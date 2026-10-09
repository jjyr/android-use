import { randomUUID } from "node:crypto";
import type { Bound } from "./connection.js";
import { stage } from "./telemetry.js";
import { AndroidError } from "./types.js";

async function uiAutomator(bound: Bound, attempt: number) {
  const path = `/data/local/tmp/android-use-${randomUUID()}.xml`;
  try {
    await stage("observation.hierarchyDump", () => bound.shell(["uiautomator", "dump", path]), { attempt, provider: "uiautomator" });
    return (await stage("observation.hierarchyRead", () => bound.execute(["exec-out", "cat", path], 2 * 1024 * 1024), { attempt })).toString();
  } finally {
    if (bound.valid) await stage("observation.cleanup", () => bound.shell(["rm", "-f", path]), { attempt }).catch(() => {});
  }
}
async function accessibility(bound: Bound, attempt: number) {
  const id = randomUUID(), file = `files/${id}.xml`, pkg = "dev.androiduse.accessibility";
  try {
    const reply = await stage("observation.hierarchyDump", () => bound.shell([
      "am", "broadcast", "-a", "dev.androiduse.accessibility.CAPTURE", "-p", pkg,
      "--es", "requestId", id,
    ]), { attempt, provider: "accessibility" });
    if (!reply.includes(`data="OK ${id}"`))
      throw new AndroidError("CAPTURE_FAILED", "Read-only accessibility service unavailable or refused capture");
    return (await stage("observation.hierarchyRead", () => bound.execute([
      "exec-out", "run-as", pkg, "cat", file,
    ], 2 * 1024 * 1024), { attempt })).toString();
  } finally {
    if (bound.valid) await stage("observation.cleanup", () => bound.shell([
      "run-as", pkg, "rm", "-f", file,
    ]), { attempt }).catch(() => {});
  }
}
export async function readHierarchy(bound: Bound, attempt: number) {
  // No automatic installation, enablement or permission changes.
  if (process.env.ANDROID_USE_HIERARCHY === "accessibility") {
    try { return await accessibility(bound, attempt); }
    catch (e) {
      if (!bound.valid) throw e;
      // Keep the established provider available when the opt-in companion is off.
      return uiAutomator(bound, attempt);
    }
  }
  return uiAutomator(bound, attempt);
}
