import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Android, publicObservation, type Phone } from "../src/index.js";
const configPath = process.env.ANDROID_USE_CONFIG,
  deviceId = process.env.ANDROID_USE_DEVICE,
  out = process.env.ANDROID_USE_ARTIFACTS,
  kind = process.env.ANDROID_USE_CONNECTION;
if (!configPath || !deviceId || !out || (kind !== "wireless" && kind !== "usb"))
  throw new Error(
    "Explicit ANDROID_USE_CONFIG, ANDROID_USE_DEVICE, ANDROID_USE_CONNECTION and ANDROID_USE_ARTIFACTS required. Provision fixture and IME first.",
  );
await mkdir(resolve(out), { recursive: true });
let count = 0;
const writes: Promise<void>[] = [];
const results: any[] = [];
const android = new Android(
  JSON.parse(await readFile(configPath, "utf8")),
  (o) => {
    const prefix = join(resolve(out), String(++count).padStart(2, "0"));
    writes.push(
      writeFile(
        prefix + ".json",
        JSON.stringify(publicObservation(o), null, 2),
      ),
    );
    if (o.screenshot) writes.push(writeFile(prefix + ".png", o.screenshot));
  },
);
let phone: Phone | undefined;
function mutation() {
  return { observationId: phone!.observation!.id, requestId: randomUUID() };
}
function assert(ok: boolean, message: string) {
  results.push({ test: message, pass: ok });
  console.log(JSON.stringify(results.at(-1)));
  if (!ok) throw new Error(message);
}
try {
  phone = await android.open({ deviceId, connection: kind });
  assert(
    !phone.observation!.partial,
    "initial observation is consistent and awake",
  );
  const launched = await phone.launchApp({
    ...mutation(),
    packageName: "dev.androiduse.fixture",
  });
  assert(
    launched.dispatch === "completed" &&
      launched.observation?.foreground.packageName === "dev.androiduse.fixture",
    "fixture launch observed",
  );
  const apps = await phone.listApps();
  assert(
    apps.some((a) => a.packageName === "dev.androiduse.fixture"),
    "launchable app inventory",
  );
  const input = phone.observation!.elements.find(
    (e) => e.editable && !e.password,
  );
  if (!input) throw new Error("Fixture edit control missing");
  const clicked = await phone.click({
    ...mutation(),
    target: { elementId: input.id },
  });
  assert(
    clicked.observation?.elements.some((e) => e.editable && e.focused) ?? false,
    "click focuses observed editable control",
  );
  for (const [mode, text, want] of [
    ["replace", '中文🙂🚀 %s "quote"', '中文🙂🚀 %s "quote"'],
    ["append", "追加👨‍👩‍👧‍👦", '中文🙂🚀 %s "quote"追加👨‍👩‍👧‍👦'],
    ["clear", "", ""],
  ] as const) {
    const r = await phone.typeText({ ...mutation(), text, mode });
    const digest = createHash("sha256").update(want).digest("hex");
    assert(
      r.dispatch === "completed" &&
        r.observation!.elements.some((e) =>
          e.text.includes("FIELD 1001 SHA256 " + digest),
        ),
      mode + " text matches native fixture hash",
    );
  }
  const multi = phone.observation!.elements.filter((e) => e.editable)[1];
  if (!multi) throw new Error("Multiline field missing");
  await phone.click({ ...mutation(), target: { elementId: multi.id } });
  const multiline = "杭州\n大阪 🙂";
  let typed = await phone.typeText({
    ...mutation(),
    text: multiline,
    mode: "replace",
  });
  assert(
    typed.observation!.elements.some((e) =>
      e.text.includes(
        "FIELD 1002 SHA256 " +
          createHash("sha256").update(multiline).digest("hex"),
      ),
    ),
    "multiline Unicode hash",
  );
  typed = await phone.typeText({ ...mutation(), text: "追加", mode: "insert" });
  assert(
    typed.observation!.elements.some((e) =>
      e.text.includes(
        "FIELD 1002 SHA256 " +
          createHash("sha256")
            .update(multiline + "追加")
            .digest("hex"),
      ),
    ),
    "insert at observed cursor hash",
  );
  await phone.pressKey({ ...mutation(), key: "Back" });
  const press = phone.observation!.elements.find(
    (e) => e.text.toLowerCase() === "long press count 0",
  );
  if (!press) throw new Error("Long press fixture missing");
  const long = await phone.longPress({
    ...mutation(),
    target: { elementId: press.id },
  });
  assert(
    long.observation!.elements.some(
      (e) => e.text.toLowerCase() === "long press count 1",
    ),
    "long press native callback",
  );
  const pad = phone.observation!.elements.find(
    (e) => e.text === "Gesture pad ready",
  );
  if (!pad) throw new Error("Gesture pad missing");
  const [left, top, right, bottom] = pad.bounds;
  const start = { x: left + 30, y: Math.floor((top + bottom) / 2) },
    end = { x: right - 30, y: start.y };
  const swiped = await phone.swipe({
    ...mutation(),
    start,
    end,
    durationMs: 450,
  });
  assert(
    swiped.observation!.elements.some((e) =>
      /^GESTURE dx=[1-9]\d* dy=0 duration=/.test(e.text),
    ),
    "swipe native touch displacement",
  );
  const dragged = await phone.drag({
    ...mutation(),
    start: end,
    end: start,
    durationMs: 1200,
  });
  assert(
    dragged.observation!.elements.some((e) => {
      const m = e.text.match(/^GESTURE dx=(-\d+) dy=0 duration=(\d+)/);
      return !!m && Number(m[1]) < 0 && Number(m[2]) >= 1000;
    }),
    "drag native displacement and duration",
  );
  const scroll = phone.observation!.elements.find(
    (e) => e.scrollable && e.className === "android.widget.ScrollView",
  );
  if (!scroll) throw new Error("Scroll fixture missing");
  const [sx, sy, sr, sb] = scroll.bounds;
  const scrolled = await phone.swipe({
    ...mutation(),
    start: { x: Math.floor((sx + sr) / 2), y: sb - 20 },
    end: { x: Math.floor((sx + sr) / 2), y: sy + 20 },
  });
  assert(
    scrolled.observation!.elements.some((e) => /^SCROLL y=[1-9]/.test(e.text)),
    "swipe scroll native offset",
  );
  await phone.pause();
  try {
    await phone.pressKey({
      observationId: randomUUID(),
      requestId: randomUUID(),
      key: "Home",
    });
    assert(false, "manual pause refuses input");
  } catch (e) {
    assert((e as any).code === "PAUSED", "manual pause refuses input");
  }
  const resumed = await phone.resume();
  assert(!resumed.partial, "manual resume observes fresh state");
  const recent = await phone.pressKey({ ...mutation(), key: "Recents" });
  assert(
    recent.dispatch === "completed" &&
      recent.observation?.elements.some(
        (e) =>
          e.description.includes("最近") ||
          e.description.includes("recent") ||
          e.text.includes("Android Use"),
      ) === true,
    "Recents shows fixture task",
  );
  const back = await phone.pressKey({ ...mutation(), key: "Back" });
  assert(
    back.dispatch === "completed" &&
      back.observation?.foreground.packageName === "dev.androiduse.fixture",
    "Back returns from Recents",
  );
  const old = phone.observation!.id;
  await phone.observe();
  try {
    await phone.click({
      observationId: old,
      requestId: randomUUID(),
      target: { x: 1, y: 1 },
    });
    assert(false, "stale observation refused");
  } catch (e) {
    assert(
      (e as any).code === "STALE_OBSERVATION",
      "stale observation refused",
    );
  }
  const stopped = await phone.stopApp({
    ...mutation(),
    packageName: "dev.androiduse.fixture",
  });
  assert(
    stopped.dispatch === "completed" &&
      stopped.observation?.foreground.packageName !== "dev.androiduse.fixture",
    "explicit stop leaves fixture foreground",
  );
  await phone.launchApp({
    ...mutation(),
    packageName: "dev.androiduse.fixture",
  });
  const home = await phone.pressKey({ ...mutation(), key: "Home" });
  assert(
    home.dispatch === "completed" &&
      home.observation?.foreground.packageName !== "dev.androiduse.fixture",
    "Home changes foreground",
  );
} finally {
  await android.close();
  await Promise.all(writes);
  await writeFile(
    join(resolve(out), "results.json"),
    JSON.stringify(results, null, 2),
  );
}
