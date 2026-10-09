import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultStateDir } from "./storage.js";
import type { Config } from "./types.js";

type Fields = Record<string, unknown>;
interface Context { recorder: Recorder; spanId: string }
const context = new AsyncLocalStorage<Context>();
export const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

function summary(value: any): Fields {
  if (Buffer.isBuffer(value)) return { bytes: value.length };
  if (value?.schemaVersion === 1 && value?.captureStartedAt) return {
    observationId: value.id, elements: value.elements.length,
    screenshotBytes: value.screenshot?.length ?? 0, partial: value.partial,
    limitations: value.limitations,
  };
  if (value?.requestId && value?.dispatch) return {
    requestId: value.requestId, dispatch: value.dispatch, effect: value.effect,
    settling: value.settling, observationId: value.observation?.id ?? null,
    errorCode: value.error?.code,
  };
  if (Array.isArray(value?.content)) {
    let errorCode: string | undefined;
    let replSessionId: string | undefined;
    for (const c of value.content) {
      if (c.type !== "text") continue;
      try { const item = JSON.parse(c.text); errorCode ??= item?.error?.code; replSessionId ??= item?.session_id; } catch {}
    }
    return {
    errorCode, replSessionId,
    isError: !!value.isError, blocks: value.content.length,
    textBytes: value.content.reduce((n: number, c: any) => n + (c.type === "text" ? Buffer.byteLength(c.text) : 0), 0),
    imageBytes: value.content.reduce((n: number, c: any) => n + (c.type === "image" ? Buffer.byteLength(c.data, "base64") : 0), 0),
    };
  }
  if (value?.sessionId && value?.bound) return { phoneSessionId: value.sessionId };
  return { type: value === undefined ? "void" : Array.isArray(value) ? "array" : typeof value };
}

/** Local diagnostics only. No telemetry is sent to the model or over the network. */
export class Recorder {
  readonly runId: string;
  readonly directory: string;
  readonly file: string;
  readonly enabled: boolean;
  readonly full: boolean;
  private queue: Promise<void> = Promise.resolve();
  private warned = false;
  constructor(config: Pick<Config, "stateDir">, runId?: string) {
    const inherited = process.env.ANDROID_USE_TRACE_RUN_ID;
    this.runId = runId ?? (inherited && /^[a-f0-9-]{36}$/i.test(inherited) ? inherited : randomUUID());
    this.directory = join(process.env.ANDROID_USE_TRACE_DIR ?? join(config.stateDir ?? defaultStateDir(), "traces"), this.runId);
    this.file = join(this.directory, `${process.pid}.jsonl`);
    this.enabled = process.env.ANDROID_USE_DEBUG === "1" && process.env.ANDROID_USE_TRACE !== "0";
    this.full = this.enabled && process.env.ANDROID_USE_TRACE_CONTENT === "1";
  }
  private async io(f: () => Promise<void>) {
    this.queue = this.queue.then(f).catch(() => {
      if (!this.warned) {
        this.warned = true;
        process.stderr.write("android-use: local telemetry write failed; operation outcome is unchanged, trace may be incomplete\n");
      }
    });
    await this.queue;
  }
  private async write(event: Fields) {
    if (!this.enabled) return;
    await this.io(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await appendFile(this.file, JSON.stringify({ schemaVersion: 1, runId: this.runId,
        taskId: process.env.ANDROID_USE_TASK_ID ?? null, pid: process.pid,
        loggingDegraded: this.warned,
        recordedAt: new Date().toISOString(), ...event }) + "\n", { mode: 0o600 });
    });
  }
  private async artifact(spanId: string, label: string, value: unknown) {
    const v = value as any;
    const images: Buffer[] = [];
    if (Buffer.isBuffer(v?.screenshot)) images.push(v.screenshot);
    else if (Buffer.isBuffer(v?.observation?.screenshot)) images.push(v.observation.screenshot);
    if (Array.isArray(v?.content))
      for (const item of v.content)
        if (item.type === "image" && item.mimeType === "image/png") images.push(Buffer.from(item.data, "base64"));
    const imageHashes = images.map(bytes => createHash("sha256").update(bytes).digest("hex"));
    const imagePaths = imageHashes.map(hash => join(this.directory, `${hash}.png`));
    let content: string;
    try {
      const seen = new WeakSet<object>();
      content = JSON.stringify(value, (_key, v) => {
        if (v?.type === "Buffer") return { binaryBytes: v.data.length };
        if (v?.sessionId && v?.bound) return { phoneSessionId: v.sessionId };
        if (v?.type === "image" && typeof v.data === "string") return { type: "image", mimeType: v.mimeType, bytes: Buffer.byteLength(v.data, "base64"), sha256: fingerprint(v.data) };
        if (v && typeof v === "object") {
          if (seen.has(v)) return { repeatedReference: true };
          seen.add(v);
        }
        return v;
      }) ?? "null";
    } catch { return { omitted: "unserializable" }; }
    const path = join(this.directory, `${spanId}-${label}.json`);
    let persisted = false;
    await this.io(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await writeFile(path, content, { mode: 0o600 });
      for (const [i, image] of images.entries())
        await writeFile(imagePaths[i]!, image, { mode: 0o600, flag: "wx" }).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        });
      persisted = true;
    });
    return { path, persisted, bytes: Buffer.byteLength(content), sha256: fingerprint(content),
      images: images.map((bytes, i) => ({ path: imagePaths[i], bytes: bytes.length,
        sha256: imageHashes[i] })) };
  }
  async span<T>(name: string, f: () => Promise<T>, fields: Fields = {}, options: { input?: unknown; content?: boolean; parentId?: string | null } = {}): Promise<T> {
    if (!this.enabled) return f();
    const spanId = randomUUID();
    const parentId = options.parentId === undefined ? context.getStore()?.spanId ?? null : options.parentId;
    const startedAt = new Date().toISOString();
    const start = process.hrtime.bigint();
    await this.write({ event: "span.start", spanId, parentId, name, startedAt, monotonicNs: start.toString(), ...fields });
    if (this.full && options.content && options.input !== undefined)
      await this.write({ event: "artifact", spanId, label: "input", ...await this.artifact(spanId, "input", options.input) });
    const workStart = process.hrtime.bigint();
    const workStartedAt = new Date().toISOString();
    return context.run({ recorder: this, spanId }, async () => {
      try {
        const value = await f();
        const endedAt = new Date().toISOString();
        const end = process.hrtime.bigint();
        // Duration excludes end-record/artifact persistence, includes start persistence.
        await this.write({ event: "span.end", spanId, parentId, name, startedAt, endedAt,
          monotonicNs: end.toString(), durationMs: Number(end - start) / 1e6,
          workStartedAt, workStartedMonotonicNs: workStart.toString(),
          workDurationMs: Number(end-workStart)/1e6, startPersistenceMs: Number(workStart-start)/1e6,
          status: (value as any)?.isError || (value as any)?.error ? "error" : "ok", result: summary(value) });
        if (this.full && options.content)
          await this.write({ event: "artifact", spanId, label: "output", ...await this.artifact(spanId, "output", value) });
        return value;
      } catch (error) {
        const end = process.hrtime.bigint();
        await this.write({ event: "span.end", spanId, parentId, name, startedAt, endedAt: new Date().toISOString(),
          monotonicNs: end.toString(), durationMs: Number(end - start) / 1e6, status: "error",
          workStartedAt, workStartedMonotonicNs: workStart.toString(),
          workDurationMs: Number(end-workStart)/1e6, startPersistenceMs: Number(workStart-start)/1e6,
          errorCode: (error as any)?.code ?? "ERROR" });
        throw error;
      }
    });
  }
  sync<T>(name: string, f: () => T): T {
    if (!this.enabled) return f();
    const spanId = randomUUID(), parentId = context.getStore()?.spanId ?? null;
    const start = process.hrtime.bigint(), startedAt = new Date().toISOString();
    void this.write({ event: "span.start", spanId, parentId, name, startedAt, monotonicNs: start.toString() });
    let status = "ok";
    try { return f(); } catch (error) { status = "error"; throw error; }
    finally {
      const end = process.hrtime.bigint();
      void this.write({ event: "span.end", spanId, parentId, name, startedAt, endedAt: new Date().toISOString(),
        monotonicNs: end.toString(), durationMs: Number(end-start)/1e6, status });
    }
  }
  /** Instrument public SDK entry points without changing their arguments/results. */
  methods(object: any, prefix: string, names: string[], fields: () => Fields = () => ({})) {
    if (!this.enabled) return;
    for (const name of names) {
      const original = object[name].bind(object);
      object[name] = (...args: any[]) => {
        const input = args[0];
        return this.span(`${prefix}.${name}`, async () => original(...args), {
          ...fields(), requestId: input?.requestId, observationId: input?.observationId,
          inputSha256: (() => { try { return fingerprint(JSON.stringify(args)); } catch { return null; } })(),
        }, { input: args, content: true });
      };
    }
  }
}

export function currentTrace() { return context.getStore(); }
export function syncStage<T>(name: string, f: () => T): T {
  const active = context.getStore();
  return active ? active.recorder.sync(name, f) : f();
}
export function stage<T>(name: string, f: () => Promise<T>, fields: Fields = {}): Promise<T> {
  const active = context.getStore();
  return active ? active.recorder.span(name, f, fields) : f();
}
