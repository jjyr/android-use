import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Adb, type Bound } from "./connection.js";
import { capture, probe, compatible } from "./observation.js";
import { Lease, Journal, defaultStateDir, hash } from "./storage.js";
import { Recorder, stage } from "./telemetry.js";
import {
  AndroidError,
  configSchema,
  mutationSchema,
  packageSchema,
  type Config,
  type Sink,
  type Observation,
  type Mutation,
  type Target,
  type ActionResult,
  type Probe,
} from "./types.js";
const point = z
  .object({
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
  })
  .strict();
const targetSchema = z.union([
  z.object({ elementId: z.string() }).strict(),
  point,
]);
export class Android {
  config: Config;
  adb: Adb;
  phones = new Set<Phone>();
  private recorder: Recorder;
  constructor(
    config: unknown,
    public sink: Sink = () => {},
    adb?: Adb,
  ) {
    this.config = configSchema.parse(config);
    this.adb = adb ?? new Adb(this.config);
    this.recorder = new Recorder(this.config);
    this.recorder.methods(this, "android", ["listDevices", "open", "close"]);
  }
  async listDevices() {
    const transports = await this.adb.inventory();
    return this.config.devices.map((d) => ({
      deviceId: d.id,
      connections: (["usb", "wireless"] as const).flatMap((kind) =>
        d[kind]
          ? [
              {
                connection: kind,
                state:
                  transports.find((t) => t.selector === d[kind])?.state ??
                  "unavailable",
              },
            ]
          : [],
      ),
    }));
  }
  async open(args: { deviceId: string; connection: "usb" | "wireless" }) {
    const parsed = z
      .object({ deviceId: z.string(), connection: z.enum(["usb", "wireless"]) })
      .strict()
      .parse(args);
    const d = this.config.devices.find((d) => d.id === parsed.deviceId);
    if (!d)
      throw new AndroidError("DEVICE_UNAVAILABLE", "Unknown enrolled device");
    const bound = await this.adb.bind(d, parsed.connection);
    const identity = d.expected.serial;
    const state = this.config.stateDir ?? defaultStateDir();
    const lease = await Lease.acquire(state, identity);
    const phone = new Phone(
      bound,
      lease,
      new Journal(state, identity),
      this.sink,
      () => this.phones.delete(phone),
    );
    this.recorder.methods(phone, "phone", ["observe", "pause", "resume", "close", "listApps",
      "launchApp", "stopApp", "openUrl", "click", "longPress", "swipe", "drag", "pressKey", "typeText"],
      () => ({ phoneSessionId: phone.sessionId, generation: phone.bound.generation }));
    this.phones.add(phone);
    try {
      await phone.observe();
      return phone;
    } catch (e) {
      await phone.close();
      throw e;
    }
  }
  async close() {
    await Promise.allSettled([...this.phones].map((p) => p.close()));
  }
}
export class Phone {
  sessionId = randomUUID();
  observation: Observation | null = null;
  private busy = false;
  private closed = false;
  private paused = false;
  constructor(
    public bound: Bound,
    private lease: Lease,
    private journal: Journal,
    private sink: Sink,
    private onClose: () => void,
  ) {}
  private async exclusive<T>(f: () => Promise<T>) {
    if (this.closed) throw new AndroidError("CLOSED", "Phone closed");
    if (this.busy)
      throw new AndroidError("BUSY", "Concurrent device calls are refused");
    this.busy = true;
    try {
      return await f();
    } finally {
      this.busy = false;
    }
  }
  private async take() {
    const o = await capture(this.bound, this.sessionId);
    this.observation = o;
    this.sink(o);
    return o;
  }
  async observe() {
    return this.exclusive(() => this.take());
  }
  async pause() {
    return this.exclusive(async () => {
      this.paused = true;
      this.observation = null;
    });
  }
  async resume() {
    return this.exclusive(async () => {
      this.paused = false;
      this.observation = null;
      return this.take();
    });
  }
  async close() {
    if (this.closed) return;
    if (this.busy)
      throw new AndroidError(
        "BUSY",
        "Wait for current device operation before closing",
      );
    this.closed = true;
    this.observation = null;
    await this.lease.release();
    this.onClose();
  }
  private validate(m: Mutation) {
    mutationSchema.parse(m);
    if (this.paused)
      throw new AndroidError("PAUSED", "Manual takeover is active");
    const o = this.observation;
    if (
      !o ||
      o.id !== m.observationId ||
      o.generation !== this.bound.generation ||
      Date.now() - Date.parse(o.captureEndedAt) > 60000
    )
      throw new AndroidError("STALE_OBSERVATION", "Observe again before input");
    if (o.partial)
      throw new AndroidError(
        "CAPTURE_FAILED",
        "Current observation is partial; reconcile before input",
      );
    return o;
  }
  private position(o: Observation, target: Target) {
    const t = targetSchema.parse(target);
    if ("elementId" in t) {
      const e = o.elements.find((e) => e.id === t.elementId);
      if (!e || !e.enabled || !(e.clickable || e.longClickable || e.editable))
        throw new AndroidError(
          "INVALID_TARGET",
          "Element is absent or disabled",
        );
      return {
        x: Math.floor((e.bounds[0] + e.bounds[2]) / 2),
        y: Math.floor((e.bounds[1] + e.bounds[3]) / 2),
      };
    }
    if (this.bound.adb.config.mode !== "mixed" || !o.capabilities.pixels)
      throw new AndroidError(
        "UNSUPPORTED",
        "Screenshot points require usable mixed-mode pixels",
      );
    if (t.x >= o.display.width || t.y >= o.display.height)
      throw new AndroidError("INVALID_TARGET", "Point outside screenshot");
    return { x: Math.floor(t.x), y: Math.floor(t.y) };
  }
  private async mutate(
    m: Mutation,
    prepare: (o: Observation) => Promise<() => Promise<void>>,
  ): Promise<ActionResult> {
    return this.exclusive(async () => {
      const before = await stage("action.validate", async () => this.validate(m));
      await stage("action.health", () => this.bound.health());
      const p = await stage("action.preflight", () => probe(this.bound));
      if (
        p.packageName !== before.foreground.packageName ||
        p.activity !== before.foreground.activity ||
        p.rotation !== before.display.rotation ||
        p.awake !== true ||
        p.locked !== false ||
        !p.size ||
        (p.rotation === 1 || p.rotation === 3 ? p.size[1] : p.size[0]) !==
          before.display.width ||
        (p.rotation === 1 || p.rotation === 3 ? p.size[0] : p.size[1]) !==
          before.display.height
      )
        throw new AndroidError(
          "STALE_OBSERVATION",
          "Foreground or geometry changed; observe again",
        );
      const dispatch = await stage("action.prepare", () => prepare(before));
      await stage("journal.begin", () => this.journal.begin(m.requestId));
      const started = Date.now();
      let state: ActionResult["dispatch"] = "unknown";
      let error: ActionResult["error"];
      let settling: ActionResult["settling"] = "timeout";
      let o: Observation | null = null;
      try {
        await stage("action.dispatch", dispatch);
        state = "completed";
      } catch (e) {
        error = {
          code: e instanceof AndroidError ? e.code : "ACTION_FAILED",
          message: e instanceof Error ? e.message : "Action failed",
        };
      }
      await stage("journal.complete", () => this.journal.complete(m.requestId, state));
      if (this.bound.valid) {
        try {
          await stage("action.settle", async () => {
            let previous = await probe(this.bound);
            const deadline = Date.now() + 2000;
            do {
              await new Promise((r) => setTimeout(r, 150));
              const next = await probe(this.bound);
              if (compatible(previous, next)) {
                settling = "stable";
                break;
              }
              previous = next;
            } while (Date.now() < deadline);
          });
          o = await this.take();
        } catch (e) {
          error ??= {
            code: "CAPTURE_FAILED",
            message:
              e instanceof Error ? e.message : "Post-action capture failed",
          };
          this.observation = null;
        }
      } else this.observation = null;
      const result: ActionResult = {
        requestId: m.requestId,
        dispatch: state,
        effect: o
          ? hash(JSON.stringify([o.foreground, o.elements])) !==
            hash(JSON.stringify([before.foreground, before.elements]))
            ? "changed"
            : o.partial ||
                !o.capabilities.hierarchy ||
                !before.capabilities.hierarchy ||
                !o.screenshot ||
                !before.screenshot ||
                !o.screenshot.equals(before.screenshot)
              ? "unverified"
              : "no_change"
          : "unverified",
        elapsedMs: Date.now() - started,
        settling,
        observation: o,
        ...(error ? { error } : {}),
      };
      return result;
    });
  }
  async listApps() {
    return this.exclusive(async () => {
      const text = await this.bound.shell([
        "cmd",
        "package",
        "query-activities",
        "--brief",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        "android.intent.category.LAUNCHER",
      ]);
      return [
        ...new Set(
          text
            .split("\n")
            .filter((l) => /^[\w.$]+\/[\w.$]+$/.test(l.trim()))
            .map((l) => l.trim()),
        ),
      ].map((activity) => ({ packageName: activity.split("/")[0]!, activity }));
    });
  }
  launchApp(
    args: Mutation & {
      packageName: string;
    },
  ) {
    packageSchema.parse(args.packageName);
    return this.mutate(args, async () => {
      const text = await this.bound.shell([
        "cmd",
        "package",
        "resolve-activity",
        "--brief",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        "android.intent.category.LAUNCHER",
        args.packageName,
      ]);
      const component = text.trim().split("\n").at(-1)!;
      if (
        !component.startsWith(args.packageName + "/") ||
        !/^[\w.$]+\/[\w.$]+$/.test(component)
      )
        throw new AndroidError("UNSUPPORTED", "No launchable activity");
      return async () => {
        const out = await this.bound.shell([
          "am",
          "start",
          "-W",
          "-n",
          component,
        ]);
        if (/Error:|Exception/i.test(out))
          throw new AndroidError(
            "LAUNCH_FAILED",
            "Android rejected app launch",
          );
      };
    });
  }
  stopApp(
    args: Mutation & {
      packageName: string;
    },
  ) {
    packageSchema.parse(args.packageName);
    return this.mutate(args, async () => async () => {
      await this.bound.shell(["am", "force-stop", args.packageName]);
    });
  }
  openUrl(
    args: Mutation & {
      packageName: string;
      url: string;
    },
  ) {
    packageSchema.parse(args.packageName);
    const url = new URL(args.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      args.url.length > 4096
    )
      throw new AndroidError(
        "UNSUPPORTED",
        "Only bounded HTTP(S) URLs without credentials are supported",
      );
    return this.mutate(args, async () => {
      const text = await this.bound.shell([
        "cmd",
        "package",
        "resolve-activity",
        "--brief",
        "-a",
        "android.intent.action.VIEW",
        "-c",
        "android.intent.category.BROWSABLE",
        "-d",
        url.href,
        args.packageName,
      ]);
      const component = text.trim().split("\n").at(-1)!;
      if (
        !component.startsWith(args.packageName + "/") ||
        !/^[\w.$]+\/[\w.$]+$/.test(component)
      )
        throw new AndroidError(
          "UNSUPPORTED",
          "Selected app has no browser activity",
        );
      return async () => {
        const out = await this.bound.shell([
          "am",
          "start",
          "-W",
          "-n",
          component,
          "-a",
          "android.intent.action.VIEW",
          "-d",
          url.href,
        ]);
        if (/Error:|Exception/i.test(out))
          throw new AndroidError(
            "LAUNCH_FAILED",
            "Android rejected URL launch",
          );
      };
    });
  }
  click(
    args: Mutation & {
      target: Target;
    },
  ) {
    return this.mutate(args, async (o) => {
      const p = this.position(o, args.target);
      return async () => {
        await this.bound.shell(["input", "tap", String(p.x), String(p.y)]);
      };
    });
  }
  longPress(
    args: Mutation & {
      target: Target;
      durationMs?: number;
    },
  ) {
    return this.mutate(args, async (o) => {
      const p = this.position(o, args.target);
      const duration = z
        .number()
        .int()
        .min(500)
        .max(2000)
        .parse(args.durationMs ?? 800);
      return async () => {
        await this.bound.shell([
          "input",
          "swipe",
          String(p.x),
          String(p.y),
          String(p.x),
          String(p.y),
          String(duration),
        ]);
      };
    });
  }
  swipe(
    args: Mutation & {
      start: {
        x: number;
        y: number;
      };
      end: {
        x: number;
        y: number;
      };
      durationMs?: number;
    },
  ) {
    return this.mutate(args, async (o) => {
      const start = this.position(o, args.start),
        end = this.position(o, args.end);
      const duration = z
        .number()
        .int()
        .min(100)
        .max(2000)
        .parse(args.durationMs ?? 450);
      return async () => {
        await this.bound.shell([
          "input",
          "swipe",
          String(start.x),
          String(start.y),
          String(end.x),
          String(end.y),
          String(duration),
        ]);
      };
    });
  }
  drag(
    args: Mutation & {
      start: {
        x: number;
        y: number;
      };
      end: {
        x: number;
        y: number;
      };
      durationMs?: number;
    },
  ) {
    return this.swipe({ ...args, durationMs: args.durationMs ?? 1200 });
  }
  pressKey(
    args: Mutation & {
      key: "Back" | "Home" | "Recents";
    },
  ) {
    const key = z.enum(["Back", "Home", "Recents"]).parse(args.key);
    return this.mutate(args, async () => async () => {
      await this.bound.shell([
        "input",
        "keyevent",
        { Back: "4", Home: "3", Recents: "187" }[key],
      ]);
    });
  }
  typeText(
    args: Mutation & {
      text: string;
      mode: "insert" | "append" | "replace" | "clear";
    },
  ) {
    const mode = z
      .enum(["insert", "append", "replace", "clear"])
      .parse(args.mode);
    if (
      typeof args.text !== "string" ||
      Buffer.byteLength(args.text) > 8192 ||
      Buffer.from(args.text).toString() !== args.text ||
      (mode === "clear" && args.text !== "")
    )
      throw new AndroidError(
        "UNSUPPORTED",
        "Text must be valid Unicode within 8 KiB; clear requires empty text",
      );
    return this.mutate(args, async (o) => {
      if (!o.capabilities.textInput || !o.foreground.packageName)
        throw new AndroidError(
          "UNSUPPORTED",
          "Dedicated IME must be provisioned and selected by the operator",
        );
      if (o.elements.some((e) => e.focused && e.password))
        throw new AndroidError(
          "UNSUPPORTED",
          "Password input is not supported",
        );
      const response = await this.bound.shell([
        "am",
        "broadcast",
        "-a",
        "dev.androiduse.ime.PROBE",
        "-p",
        "dev.androiduse.ime",
      ]);
      const match = response.match(/data="([A-Za-z0-9+/=]+)"/);
      if (!match)
        throw new AndroidError("UNSUPPORTED", "IME probe unavailable");
      const editor = JSON.parse(Buffer.from(match[1]!, "base64").toString());
      if (
        !editor.active ||
        editor.packageName !== o.foreground.packageName ||
        editor.password
      )
        throw new AndroidError(
          "INVALID_TARGET",
          "IME editor does not match observed foreground",
        );
      if (mode !== "insert" && !editor.complete)
        throw new AndroidError(
          "UNSUPPORTED",
          "Editor cannot expose complete text for append/replacement",
        );
      return async () => {
        const output = await this.bound.shell([
          "am",
          "broadcast",
          "-a",
          "dev.androiduse.ime.INPUT",
          "-p",
          "dev.androiduse.ime",
          "--es",
          "request",
          args.requestId,
          "--es",
          "expectedPackage",
          editor.packageName,
          "--es",
          "generation",
          editor.generation,
          "--es",
          "mode",
          mode,
          "--es",
          "payload",
          Buffer.from(args.text).toString("base64"),
        ]);
        if (!output.includes('data="COMMITTED_VERIFY_FIELD"'))
          throw new AndroidError(
            "INPUT_REFUSED",
            output.match(/data="([^"]*)"/)?.[1] ??
              "IME did not acknowledge input",
          );
      };
    });
  }
}
