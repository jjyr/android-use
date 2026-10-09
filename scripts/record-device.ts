import { readFile } from "node:fs/promises";
import { Adb } from "../src/connection.js";
import { configSchema } from "../src/types.js";
import { recordSegments, startScrcpy } from "../src/recording.js";
const path=process.env.ANDROID_USE_CONFIG,device=process.env.ANDROID_USE_DEVICE,kind=process.env.ANDROID_USE_CONNECTION,directory=process.env.ANDROID_USE_RECORD_DIR;
if(!path || !device || !directory || (kind!=='usb'&&kind!=='wireless'))throw new Error('Explicit config/device/connection/record directory required');
const config=configSchema.parse(JSON.parse(await readFile(path,'utf8')));
const enrollment=config.devices.find(d=>d.id===device);if(!enrollment)throw new Error('Device is not enrolled');
const abort=new AbortController();process.once('SIGINT',()=>abort.abort());process.once('SIGTERM',()=>abort.abort());
await recordSegments({directory,signal:abort.signal,start:async(file)=> {
  const bound=await new Adb(config).bind(enrollment,kind);
  const child=startScrcpy(bound.transport.selector,file,config.adbPath);
  // Drain stderr without retaining private screen/device details in the manifest.
  child.stderr?.on('data',()=>{});return child;
}});
