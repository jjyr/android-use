import repl from "node:repl";
import { PassThrough } from "node:stream";
import { inspect } from "node:util";
import { Android } from "./core.js";
import { publicObservation, type Observation, type Config } from "./types.js";
import { Phone } from "./core.js";
let output: any[] = [];
let budget = 0;
let android: Android;
let server: repl.REPLServer;
let rejectCurrent: ((error: Error) => void) | null = null;
function add(item: any) {
  const bytes = Buffer.byteLength(JSON.stringify(item));
  if (budget + bytes > 16 * 1024 * 1024) throw new Error("REPL_OUTPUT_LIMIT");
  budget += bytes;
  output.push(item);
}
function emit(value: unknown) {
  const safe =
    value instanceof Phone
      ? {
          type: "Phone",
          sessionId: value.sessionId,
          deviceId: value.bound.enrollment.id,
        }
      : value;
  const text = JSON.stringify(safe, (_key, v) =>
    v?.type === "Buffer" ? { binary: "omitted" } : v,
  );
  if (text !== undefined) add({ type: "text", text });
}
function observation(o: Observation) {
  add({ type: "text", text: JSON.stringify(publicObservation(o)) });
  if (o.screenshot)
    add({
      type: "image",
      mimeType: "image/png",
      data: o.screenshot.toString("base64"),
    });
}
process.on("message", async (message: any) => {
  if (message.type === "init") {
    android = new Android(message.config as Config, observation);
    const input = new PassThrough();
    const sink = new PassThrough();
    sink.on("data", () => {});
    server = repl.start({
      input,
      output: sink,
      terminal: false,
      prompt: "",
      useGlobal: false,
      writer: () => "",
    });
    (server as any)._domain.on("error", (error: Error) =>
      rejectCurrent?.(error),
    );
    server.context.android = android;
    server.context.emit = emit;
    server.context.console = {
      log: (...args: unknown[]) =>
        add({
          type: "text",
          text: args
            .map((x) =>
              typeof x === "string"
                ? x
                : inspect(x, { depth: 2, maxStringLength: 2000 }),
            )
            .join(" ")
            .slice(0, 16000),
        }),
      error: (...args: unknown[]) =>
        add({ type: "text", text: args.map(String).join(" ").slice(0, 16000) }),
    };
    process.send?.({ ready: true });
    return;
  }
  if (message.type === "close") {
    await android.close();
    server.close();
    process.exit(0);
  }
  if (message.type === "eval") {
    output = [];
    budget = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        rejectCurrent = reject;
        server.eval(
          message.code + "\n",
          server.context,
          "android-repl",
          (_error: Error | null, value: unknown) => {
            if (_error) {
              reject(_error);
              return;
            }
            try {
              if (value !== undefined) {
                if (
                  value &&
                  typeof value === "object" &&
                  "observation" in value
                ) {
                  const { observation, ...rest } = value as any;
                  emit({ ...rest, observationId: observation?.id ?? null });
                } else if (
                  value &&
                  typeof value === "object" &&
                  "screenshot" in value
                ) {
                  emit(publicObservation(value as Observation));
                } else emit(value);
              }
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        );
      });
      rejectCurrent = null;
      process.send?.({ done: true, content: output });
    } catch (e) {
      rejectCurrent = null;
      process.send?.({
        done: true,
        content: output,
        error: {
          message: e instanceof Error ? e.message : String(e),
          code: (e as any)?.code ?? "REPL_ERROR",
        },
      });
    }
  }
});
process.on("disconnect", () => process.exit(1));
