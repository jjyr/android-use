import { randomUUID } from "node:crypto";
import { type Runner, run } from "./process.js";
import {
  AndroidError,
  type Config,
  type Enrollment,
  type ConnectionKind,
} from "./types.js";
export interface Transport {
  selector: string;
  state: string;
  transportId: number;
}
export function parseDevices(text: string): Transport[] {
  return text
    .split("\n")
    .slice(1)
    .flatMap((line) => {
      const m = line.match(/^(\S+)\s+(\S+).*?transport_id:(\d+)/);
      return m
        ? [{ selector: m[1]!, state: m[2]!, transportId: Number(m[3]) }]
        : [];
    });
}
export class Adb {
  constructor(
    public config: Config,
    public runner: Runner = run,
  ) {}
  async execute(args: string[], maxBytes?: number) {
    const r = await this.runner(this.config.adbPath, args, { maxBytes });
    if (r.code !== 0)
      throw new AndroidError(
        /offline|not found|unauthorized|no devices?\b/i.test(r.stderr)
          ? "DEVICE_UNAVAILABLE"
          : "ADB_FAILED",
        r.stderr.trim().slice(0, 500) || "ADB command failed",
      );
    return r.stdout;
  }
  async inventory() {
    return parseDevices((await this.execute(["devices", "-l"])).toString());
  }
  async bind(enrollment: Enrollment, kind: ConnectionKind) {
    const selector = enrollment[kind];
    if (!selector)
      throw new AndroidError(
        "UNSUPPORTED",
        `Enrollment has no ${kind} selector`,
      );
    const t = (await this.inventory()).find((t) => t.selector === selector);
    if (!t || t.state !== "device")
      throw new AndroidError(
        "DEVICE_UNAVAILABLE",
        "Selected transport is unavailable or unauthorized",
      );
    const bound = new Bound(this, enrollment, kind, t);
    const serial = (await bound.shell(["getprop", "ro.serialno"])).trim();
    const model = (await bound.shell(["getprop", "ro.product.model"])).trim();
    if (
      serial !== enrollment.expected.serial ||
      (enrollment.expected.model && model !== enrollment.expected.model)
    )
      throw new AndroidError(
        "IDENTITY_MISMATCH",
        "Device attributes differ from enrollment; reconcile explicitly",
      );
    return bound;
  }
}
export class Bound {
  generation = randomUUID();
  valid = true;
  constructor(
    public adb: Adb,
    public enrollment: Enrollment,
    public kind: ConnectionKind,
    public transport: Transport,
  ) {}
  async execute(args: string[], maxBytes?: number) {
    if (!this.valid)
      throw new AndroidError(
        "DEVICE_UNAVAILABLE",
        "Connection invalidated; reopen explicitly",
      );
    try {
      return await this.adb.execute(
        ["-t", String(this.transport.transportId), ...args],
        maxBytes,
      );
    } catch (e) {
      if (
        e instanceof AndroidError &&
        ["DEVICE_UNAVAILABLE", "COMMAND_TIMEOUT"].includes(e.code)
      )
        this.valid = false;
      throw e;
    }
  }
  async shell(args: string[]) {
    const { shellArgs } = await import("./process.js");
    return (await this.execute(["shell", shellArgs(args)])).toString("utf8");
  }
  async health() {
    await this.execute(["get-state"]);
  }
}
