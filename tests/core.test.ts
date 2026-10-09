import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { randomUUID } from "node:crypto";
import { parseHierarchy, pngInfo, parseProbe } from "../src/observation.js";
import { Adb, parseDevices } from "../src/connection.js";
import { Android } from "../src/core.js";
import { configSchema } from "../src/types.js";
import { Lease, Journal } from "../src/storage.js";
import { run, shellArgs, type Runner } from "../src/process.js";
const xml =
  '<hierarchy><node class="android.widget.EditText" text="A &amp; B" bounds="[1,1][10,20]" enabled="true" focused="true" clickable="true"/><node text="offscreen" bounds="[0,0][0,0]"/><node text="inverted" bounds="[1,30][10,20]"/></hierarchy>';
function png() {
  const p = new PNG({ width: 20, height: 40 });
  p.data.fill(255);
  return PNG.sync.write(p);
}
const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0))
    await rm(r, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "android-use-test-"));
  roots.push(root);
  let input = 0;
  let lastTap: number[] = [];
  let disconnected = false;
  let disconnectMessage = "device not found";
  let packageName = "com.example.fixture";
  let failingCapture = false;
  let locked = false;
  const config = configSchema.parse({
    stateDir: root,
    devices: [
      { id: "one", expected: { serial: "physical" }, wireless: "test:1111" },
      { id: "alias", expected: { serial: "physical" }, usb: "usb-test" },
    ],
  });
  const runner: Runner = async (_file, args) => {
    const text = args.join(" ");
    if (text === "devices -l")
      return {
        code: 0,
        stderr: "",
        stdout: Buffer.from(
          "List of devices attached\ntest:1111 device transport_id:1\nusb-test device transport_id:2\n",
        ),
      };
    if (disconnected)
      return { code: 1, stderr: disconnectMessage, stdout: Buffer.alloc(0) };
    let out = "";
    if (text.includes("get-state")) out = "device";
    else if (text.includes("'getprop' 'ro.serialno'")) out = "physical";
    else if (text.includes("'getprop' 'ro.product.model'")) out = "fixture";
    else if (text.includes("'dumpsys' 'window'"))
      out = `mCurrentFocus=Window{test u0 ${packageName}/.Main} isKeyguardShowing=${locked}`;
    else if (text.includes("'dumpsys' 'input'")) out = "SurfaceOrientation: 0";
    else if (text.includes("'dumpsys' 'power'")) out = "mWakefulness=Awake";
    else if (text.includes("'wm' 'size'")) out = "Physical size: 20x40";
    else if (text.includes("screencap")) {
      if (failingCapture)
        return { code: 1, stderr: "capture failed", stdout: Buffer.alloc(0) };
      return { code: 0, stderr: "", stdout: png() };
    } else if (text.includes("exec-out cat")) out = xml;
    else if (text.includes("'settings' 'get'")) out = "other-ime";
    else if (text.includes("'input' 'tap'")) {
      input++;
      lastTap = text
        .match(/'input' 'tap' '(\d+)' '(\d+)'/)!
        .slice(1)
        .map(Number);
    }
    return { code: 0, stderr: "", stdout: Buffer.from(out) };
  };
  const adb = new Adb(config, runner);
  const emitted: any[] = [];
  const android = new Android(config, (o) => emitted.push(o), adb);
  return {
    android,
    emitted,
    input: () => input,
    lastTap: () => lastTap,
    lock: () => {
      locked = true;
    },
    disconnect: (message = "device not found") => {
      disconnected = true;
      disconnectMessage = message;
    },
    changeForeground: () => {
      packageName = "other.app";
    },
    failCapture: () => {
      failingCapture = true;
    },
  };
}
describe("observations", () => {
  it("parses entities and filters invalid/offscreen bounds", () => {
    const e = parseHierarchy(xml, 20, 40);
    expect(e).toHaveLength(1);
    expect(e[0]?.text).toBe("A & B");
    expect(e[0]?.editable).toBe(true);
  });
  it("decodes numeric Unicode and preserves editor whitespace", () => {
    const e = parseHierarchy(
      '<hierarchy><node text="  A&#10;&#128578; &amp;#10;  " bounds="[1,1][10,20]"/></hierarchy>',
      20,
      40,
    );
    expect(e[0]?.text).toBe("  A\n🙂 &#10;  ");
  });
  it("rejects DTD and malformed XML", () => {
    expect(() => parseHierarchy("<!DOCTYPE x>" + xml, 20, 40)).toThrow();
    expect(() => parseHierarchy("<hierarchy>", 20, 40)).toThrow();
  });
  it("validates pixels and decompression geometry", () => {
    expect(pngInfo(png())).toMatchObject({
      width: 20,
      height: 40,
      black: false,
    });
    const p = png();
    p.writeUInt32BE(100000, 16);
    expect(() => pngInfo(p)).toThrow();
  });
  it("extracts foreground, orientation and override dimensions", () => {
    expect(
      parseProbe(
        "mCurrentFocus=Window{a u0 com.browser/.Main}",
        "SurfaceOrientation: 1",
        "mWakefulness=Awake",
        "Physical size: 10x20\nOverride size: 20x40",
      ),
    ).toMatchObject({
      packageName: "com.browser",
      rotation: 1,
      size: [20, 40],
      awake: true,
    });
  });
  it("preserves unknown metadata", () =>
    expect(parseProbe("", "", "", "")).toMatchObject({
      packageName: null,
      rotation: null,
      awake: null,
      locked: null,
      size: null,
    }));
  it("parses transports without choosing one", () =>
    expect(
      parseDevices(
        "List of devices attached\na device transport_id:1\nb unauthorized transport_id:2\n",
      ),
    ).toHaveLength(2));
});
describe("session and mutation admission", () => {
  it("rejects stale and out-of-bounds input before dispatch", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    try {
      await expect(
        p.click({
          observationId: randomUUID(),
          requestId: "stale",
          target: { x: 1, y: 1 },
        }),
      ).rejects.toMatchObject({ code: "STALE_OBSERVATION" });
      await expect(
        p.click({
          observationId: p.observation!.id,
          requestId: "bounds",
          target: { x: 20, y: 1 },
        }),
      ).rejects.toMatchObject({ code: "INVALID_TARGET" });
      expect(f.input()).toBe(0);
    } finally {
      await p.close();
    }
  });
  it("keeps one-pixel edge elements and fractional points inside the display", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    try {
      p.observation!.elements.push({
        ...p.observation!.elements[0]!,
        id: "edge",
        bounds: [19, 39, 20, 40],
      });
      await p.click({
        observationId: p.observation!.id,
        requestId: "edge-element",
        target: { elementId: "edge" },
      });
      expect(f.lastTap()).toEqual([19, 39]);
      await p.click({
        observationId: p.observation!.id,
        requestId: "edge-point",
        target: { x: 19.9, y: 39.9 },
      });
      expect(f.lastTap()).toEqual([19, 39]);
    } finally {
      await p.close();
    }
  });
  it("returns and emits fresh observation after a click", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    try {
      const old = p.observation!.id;
      const r = await p.click({
        observationId: old,
        requestId: "once",
        target: { elementId: "1" },
      });
      expect(r.dispatch).toBe("completed");
      expect(r.observation!.id).not.toBe(old);
      expect(f.emitted).toHaveLength(2);
      expect(f.input()).toBe(1);
    } finally {
      await p.close();
    }
  });
  it("durably refuses a repeated request after reopening", async () => {
    const f = await fixture();
    let p = await f.android.open({ deviceId: "one", connection: "wireless" });
    await p.click({
      observationId: p.observation!.id,
      requestId: "once",
      target: { x: 5, y: 5 },
    });
    await p.close();
    p = await f.android.open({ deviceId: "one", connection: "wireless" });
    try {
      await expect(
        p.click({
          observationId: p.observation!.id,
          requestId: "once",
          target: { x: 5, y: 5 },
        }),
      ).rejects.toMatchObject({ code: "REQUEST_REPEATED" });
      expect(f.input()).toBe(1);
    } finally {
      await p.close();
    }
  });
  it("deduplicates leases across aliases and connection kinds", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    try {
      await expect(
        f.android.open({ deviceId: "alias", connection: "usb" }),
      ).rejects.toMatchObject({ code: "BUSY" });
    } finally {
      await p.close();
    }
  });
  it("refuses keyguard that appears after capture", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    f.lock();
    try {
      await expect(
        p.click({
          observationId: p.observation!.id,
          requestId: "locked",
          target: { x: 1, y: 1 },
        }),
      ).rejects.toMatchObject({ code: "STALE_OBSERVATION" });
      expect(f.input()).toBe(0);
      const o = await p.observe();
      expect(o.partial).toBe(true);
      expect(o.limitations).toContain("KEYGUARD_SHOWING");
    } finally {
      await p.close();
    }
  });
  it("rejects changed foreground before input", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    f.changeForeground();
    try {
      await expect(
        p.click({
          observationId: p.observation!.id,
          requestId: "changed",
          target: { x: 1, y: 1 },
        }),
      ).rejects.toMatchObject({ code: "STALE_OBSERVATION" });
      expect(f.input()).toBe(0);
    } finally {
      await p.close();
    }
  });
  it("invalidates disconnected transport without replay", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    f.disconnect();
    try {
      await expect(
        p.click({
          observationId: p.observation!.id,
          requestId: "lost",
          target: { x: 1, y: 1 },
        }),
      ).rejects.toMatchObject({ code: "DEVICE_UNAVAILABLE" });
      expect(f.input()).toBe(0);
    } finally {
      await p.close();
    }
  });
  it("invalidates a missing exact transport using the real modern ADB error", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    f.disconnect("error: no device with transport id '1'");
    try {
      await expect(p.observe()).rejects.toMatchObject({
        code: "DEVICE_UNAVAILABLE",
      });
      expect(p.bound.valid).toBe(false);
      expect(f.input()).toBe(0);
    } finally {
      await p.close();
    }
  });
  it("pause/resume invalidates old references and rejects concurrency", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    try {
      const old = p.observation!.id;
      await p.pause();
      await expect(
        p.click({
          observationId: old,
          requestId: "paused",
          target: { x: 1, y: 1 },
        }),
      ).rejects.toMatchObject({ code: "PAUSED" });
      const pending = p.resume();
      await expect(p.observe()).rejects.toMatchObject({ code: "BUSY" });
      await pending;
      expect(p.observation!.id).not.toBe(old);
    } finally {
      await p.close();
    }
  });
  it("keeps completed dispatch when post-input pixels fail", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    f.failCapture();
    try {
      const r = await p.click({
        observationId: p.observation!.id,
        requestId: "capture",
        target: { x: 5, y: 5 },
      });
      expect(r.dispatch).toBe("completed");
      expect(r.observation?.partial).toBe(true);
      expect(f.input()).toBe(1);
    } finally {
      await p.close();
    }
  });
  it("refuses insecure fallback text input", async () => {
    const f = await fixture();
    const p = await f.android.open({ deviceId: "one", connection: "wireless" });
    try {
      await expect(
        p.typeText({
          observationId: p.observation!.id,
          requestId: "text",
          text: "中文",
          mode: "replace",
        }),
      ).rejects.toMatchObject({ code: "UNSUPPORTED" });
      expect(f.input()).toBe(0);
    } finally {
      await p.close();
    }
  });
});
describe("process and recovery", () => {
  it("escapes Android shell metacharacters and empty strings", () =>
    expect(shellArgs(["a b", "a'b", "", "$(secret)"])).toBe(
      "'a b' 'a'\\''b' '' '$(secret)'",
    ));
  it("bounds command wall time and output", async () => {
    await expect(
      run(process.execPath, ["-e", "setTimeout(()=>{},10000)"], {
        timeoutMs: 30,
      }),
    ).rejects.toMatchObject({ code: "COMMAND_TIMEOUT" });
    await expect(
      run(process.execPath, ["-e", "process.stdout.write('x'.repeat(10000))"], {
        maxBytes: 100,
      }),
    ).rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
  });
  it("refuses unknown journal entries after a new journal instance", async () => {
    const r = await mkdtemp(join(tmpdir(), "android-use-journal-"));
    roots.push(r);
    await new Journal(r, "same").begin("id");
    await expect(new Journal(r, "same").begin("id")).rejects.toMatchObject({
      code: "REQUEST_REPEATED",
    });
  });
  it("leases are exclusive and reusable only after release", async () => {
    const r = await mkdtemp(join(tmpdir(), "android-use-lease-"));
    roots.push(r);
    const l = await Lease.acquire(r, "same");
    await expect(Lease.acquire(r, "same")).rejects.toMatchObject({
      code: "BUSY",
    });
    await l.release();
    const second = await Lease.acquire(r, "same");
    await second.release();
  });
});
