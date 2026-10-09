#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Android, configSchema, publicObservation } from "./index.js";
import { reconcileLease, defaultStateDir } from "./storage.js";
const args = process.argv.slice(2);
const command = args.shift();
const option = (name: string) => {
  const index = args.indexOf("--" + name);
  return index === -1 ? undefined : args[index + 1];
};
try {
  const path = option("config") ?? process.env.ANDROID_USE_CONFIG;
  if (!path)
    throw new Error(
      "Specify --config /absolute/path/config.json or ANDROID_USE_CONFIG",
    );
  const config = configSchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (command === "mcp") {
    const { startMcp } = await import("./mcp.js");
    await startMcp(config);
  } else if (command === "reconcile-lease") {
    const d = config.devices.find((d) => d.id === option("device"));
    if (!d) throw new Error("Select --device");
    await reconcileLease(
      config.stateDir ?? defaultStateDir(),
      d.expected.serial,
    );
    console.log("Dead lease reconciled");
  } else {
    const android = new Android(config);
    try {
      if (command === "devices")
        console.log(JSON.stringify(await android.listDevices(), null, 2));
      else if (command === "doctor") {
        console.log(
          JSON.stringify(
            {
              adbVersion: (await android.adb.execute(["version"])).toString(),
              devices: await android.listDevices(),
            },
            null,
            2,
          ),
        );
      } else if (command === "observe") {
        const kind = option("connection");
        if (kind !== "usb" && kind !== "wireless")
          throw new Error("--connection usb|wireless required");
        const phone = await android.open({
          deviceId: option("device") ?? "",
          connection: kind,
        });
        const o = phone.observation!;
        const out = option("out");
        if (out) {
          await mkdir(resolve(out), { recursive: true });
          await writeFile(
            join(resolve(out), "observation.json"),
            JSON.stringify(publicObservation(o), null, 2),
          );
          if (o.screenshot)
            await writeFile(join(resolve(out), "screenshot.png"), o.screenshot);
        }
        console.log(JSON.stringify(publicObservation(o), null, 2));
      } else
        throw new Error(
          "Commands: devices, doctor, observe, reconcile-lease, mcp. Use --config; observe requires --device --connection [--out]. APK provisioning uses documented operator ADB commands.",
        );
    } finally {
      await android.close();
    }
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
