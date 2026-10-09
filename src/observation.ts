import { randomUUID } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { PNG } from "pngjs";
import type { Bound } from "./connection.js";
import { readHierarchy } from "./hierarchy.js";
import { stage } from "./telemetry.js";
import {
  AndroidError,
  type Element,
  type Probe,
  type Rect,
  type Observation,
} from "./types.js";
export function parseHierarchy(
  xml: string,
  width: number,
  height: number,
): Element[] {
  if (
    Buffer.byteLength(xml) > 2 * 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new AndroidError(
      "CAPTURE_FAILED",
      "Invalid or oversized hierarchy XML",
    );
  const data = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    parseTagValue: false,
    isArray: (name) => name === "node",
    processEntities: true,
    htmlEntities: true,
    trimValues: false,
  }).parse(xml);
  const out: Element[] = [];
  let count = 0;
  function visit(nodes: any, depth: number) {
    if (depth > 64)
      throw new AndroidError("CAPTURE_FAILED", "Hierarchy depth exceeded");
    for (const n of Array.isArray(nodes) ? nodes : []) {
      if (++count > 5000)
        throw new AndroidError(
          "CAPTURE_FAILED",
          "Hierarchy node limit exceeded",
        );
      const m = String(n.bounds ?? "").match(
        /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/,
      );
      if (m) {
        const b = m.slice(1).map(Number) as Rect;
        const [x, y, r, s] = b;
        if (
          r > x &&
          s > y &&
          x < width &&
          y < height &&
          r <= width &&
          s <= height
        ) {
          out.push({
            id: String(count),
            text: String(n.text ?? ""),
            description: String(n["content-desc"] ?? ""),
            resourceId: String(n["resource-id"] ?? ""),
            className: String(n.class ?? ""),
            bounds: b,
            clickable: n.clickable === "true",
            longClickable: n["long-clickable"] === "true",
            editable: n.editable === "true" || String(n.class ?? "").endsWith("EditText"),
            focused: n.focused === "true",
            enabled: n.enabled === "true",
            password: n.password === "true",
            scrollable: n.scrollable === "true",
          });
        }
      }
      visit(n.node, depth + 1);
    }
  }
  visit(data.hierarchy?.node, 0);
  return out;
}
export function pngInfo(bytes: Buffer) {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new AndroidError("CAPTURE_FAILED", "Invalid PNG signature");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > 16000000
  )
    throw new AndroidError("CAPTURE_FAILED", "PNG dimensions exceed limit");
  const png = PNG.sync.read(bytes);
  let black = true;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i]! > 2 || png.data[i + 1]! > 2 || png.data[i + 2]! > 2) {
      black = false;
      break;
    }
  }
  return { width, height, black };
}
export function parseProbe(
  window: string,
  input: string,
  power: string,
  size: string,
): Probe {
  const focus = window.match(
    /mCurrentFocus=Window\{[^\n]*?\bu\d+\s+([\w.$]+)\/([\w.$]+)/,
  );
  const alternative = window.match(
    /mFocusedApp=[^\n]*?\bu\d+\s+([\w.$]+)\/([\w.$]+)/,
  );
  const m = focus ?? alternative;
  const rotation = input.match(/SurfaceOrientation:\s*(\d)/);
  const sizes = [
    ...size.matchAll(/(?:Physical|Override) size:\s*(\d+)x(\d+)/g),
  ];
  const dimensions = sizes.at(-1);
  const wake = power.match(/mWakefulness=(\w+)/);
  const lock = window.match(
    /(?:isKeyguardShowing|mKeyguardShowing)=(true|false)\b/,
  );
  return {
    packageName: m?.[1] ?? null,
    activity: m?.[2] ?? null,
    rotation: rotation ? Number(rotation[1]) : null,
    awake: wake ? wake[1] === "Awake" : null,
    locked: lock ? lock[1] === "true" : null,
    size: dimensions ? [Number(dimensions[1]), Number(dimensions[2])] : null,
  };
}
export async function probe(bound: Bound): Promise<Probe> {
  // Independent read-only queries share one round trip window; none is cached.
  // Size overrides/rotation/lock state remain checked on every admission/capture.
  const [window, input, power, size] = await Promise.all([
    bound.shell(["dumpsys", "window"]),
    bound.shell(["dumpsys", "input"]),
    bound.shell(["dumpsys", "power"]),
    bound.shell(["wm", "size"]),
  ]);
  return parseProbe(window, input, power, size);
}
export function compatible(a: Probe, b: Probe) {
  return (
    a.packageName === b.packageName &&
    a.activity === b.activity &&
    a.rotation === b.rotation &&
    a.awake === b.awake &&
    a.locked === b.locked &&
    JSON.stringify(a.size) === JSON.stringify(b.size)
  );
}
export async function capture(
  bound: Bound,
  sessionId: string,
): Promise<Observation> {
  return stage("observation.capture", () => captureImpl(bound, sessionId), { phoneSessionId: sessionId });
}
async function captureImpl(bound: Bound, sessionId: string): Promise<Observation> {
  let last: Observation | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = new Date().toISOString();
    const before = await stage("observation.preprobe", () => probe(bound), { attempt });
    const limitations: string[] = [];
    let bytes: Buffer | undefined;
    let width = before.size?.[0] ?? 0,
      height = before.size?.[1] ?? 0;
    let black = false;
    const components: Observation["components"] = { foreground: started };
    if (before.rotation === 1 || before.rotation === 3)
      [width, height] = [height, width];
    try {
      bytes = await stage("observation.screenshot", () => bound.execute(["exec-out", "screencap", "-p"]), { attempt });
      const info = await stage("observation.pngDecode", async () => pngInfo(bytes!), { attempt });
      width = info.width;
      height = info.height;
      black = info.black;
      components.pixels = new Date().toISOString();
      if (black) limitations.push("BLACK_CAPTURE");
    } catch (e) {
      if (!bound.valid) throw e;
      limitations.push("SCREENSHOT_UNAVAILABLE");
    }
    let elements: Element[] = [];
    let hierarchy = false;
    try {
      const xml = await readHierarchy(bound, attempt);
      elements = await stage("observation.hierarchyParse", async () => parseHierarchy(xml, width, height), { attempt });
      hierarchy = true;
      components.hierarchy = new Date().toISOString();
    } catch (e) {
      if (!bound.valid) throw e;
      limitations.push("HIERARCHY_UNAVAILABLE");
    }
    const after = await stage("observation.postprobe", () => probe(bound), { attempt });
    components.foreground = new Date().toISOString();
    const expected =
      after.size &&
      (after.rotation === 1 || after.rotation === 3
        ? [after.size[1], after.size[0]]
        : after.size);
    const consistent =
      compatible(before, after) &&
      !!expected &&
      width === expected[0] &&
      height === expected[1];
    if (!consistent) limitations.push("CAPTURE_UNSTABLE");
    if (after.awake !== true) limitations.push("SCREEN_NOT_AWAKE");
    if (after.locked !== false)
      limitations.push(
        after.locked === true ? "KEYGUARD_SHOWING" : "KEYGUARD_STATE_UNKNOWN",
      );
    if (!after.packageName || after.rotation === null)
      limitations.push("FOREGROUND_OR_GEOMETRY_UNKNOWN");
    const ime = (
      await stage("observation.imeQuery", () => bound.shell(["settings", "get", "secure", "default_input_method"]), { attempt })
    ).trim();
    last = {
      schemaVersion: 1,
      id: randomUUID(),
      sessionId,
      deviceId: bound.enrollment.id,
      connection: bound.kind,
      generation: bound.generation,
      captureStartedAt: started,
      captureEndedAt: new Date().toISOString(),
      components,
      foreground: { packageName: after.packageName, activity: after.activity },
      display: { width, height, rotation: after.rotation, scale: 1 },
      elements,
      capabilities: {
        pixels: !!bytes && !black,
        hierarchy,
        textInput: ime === "dev.androiduse.ime/.UnicodeIme",
      },
      limitations,
      partial: limitations.some((l) => l !== "HIERARCHY_UNAVAILABLE"),
      ...(bound.adb.config.mode === "mixed" && bytes
        ? { screenshot: bytes }
        : {}),
    };
    if (consistent) return last;
  }
  return last!;
}
