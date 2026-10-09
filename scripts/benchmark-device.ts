/** Explicit real-device benchmark. Operates only the preinstalled disposable fixture. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Android, publicObservation } from "../src/index.js";
import { compactObservation } from "../src/feedback.js";
import { probe, compatible } from "../src/observation.js";
const config = process.env.ANDROID_USE_CONFIG, deviceId = process.env.ANDROID_USE_DEVICE;
const connection = process.env.ANDROID_USE_CONNECTION, output = process.env.ANDROID_USE_ARTIFACTS;
if (!config || !deviceId || !output || !['usb','wireless'].includes(connection ?? ''))
  throw new Error('Explicit config, device, connection and artifact directory required. Install fixture and enable read-only service first.');
await mkdir(resolve(output),{recursive:true});
const android=new Android(JSON.parse(await readFile(config,'utf8')));
const phone=await android.open({deviceId,connection:connection as 'usb'|'wireless'});
const rows:any[]=[];
const old=process.env.ANDROID_USE_HIERARCHY;
const packageName=process.env.ANDROID_USE_BENCHMARK_APP ?? "dev.androiduse.fixture";
const clock=()=>performance.now();
try {
  if (process.env.ANDROID_USE_BENCHMARK_KEEP_STATE === '1') {
    if(phone.observation!.foreground.packageName!==packageName)throw new Error('Expected benchmark app is not foreground');
  } else {
    const result=await phone.launchApp({observationId:phone.observation!.id,requestId:randomUUID(),packageName});
    if(result.error || result.observation?.foreground.packageName!==packageName)throw new Error('Benchmark app launch failed');
  }
  const signatures=new Map<string, Set<string>>();
  const actions=new Map<string, Set<string>>();
  for(let i=0;i<5;i++) {
    for(const provider of i%2===0?['uiautomator','accessibility']:['accessibility','uiautomator']) {
      process.env.ANDROID_USE_HIERARCHY=provider;
      if(provider==='accessibility') {
        const id=randomUUID();
        const check=await phone.bound.shell(['am','broadcast','-a','dev.androiduse.accessibility.CAPTURE','-p','dev.androiduse.accessibility','--es','requestId',id]);
        await phone.bound.shell(['run-as','dev.androiduse.accessibility','rm','-f',`files/${id}.xml`]);
        if(!check.includes(`data="OK ${id}"`))throw new Error('Accessibility service is not enabled: fallback is not a valid benchmark');
      }
      const start=clock(),o=await phone.observe(),elapsedMs=clock()-start;
      if(o.partial || !o.capabilities.hierarchy)throw new Error('Incomplete benchmark observation');
      const full=JSON.stringify(publicObservation(o)),compact=JSON.stringify(compactObservation(o));
      const visible=o.elements.filter(e=>e.text).map(e=>JSON.stringify([e.text,e.bounds,e.clickable,e.editable]));
      signatures.set(provider,new Set(visible));
      actions.set(provider,new Set(o.elements.filter(e=>(e.clickable||e.longClickable||e.editable)&&e.enabled&&(e.text||e.description||e.resourceId))
        .map(e=>JSON.stringify([e.text,e.description,e.resourceId,e.bounds,e.clickable,e.longClickable,e.editable]))));
      rows.push({provider,elapsedMs,elements:o.elements.length,fullBytes:Buffer.byteLength(full),compactBytes:Buffer.byteLength(compact)});
      await writeFile(join(output,`${i}-${provider}.json`),full);
      if(o.screenshot)await writeFile(join(output,`${i}-${provider}.png`),o.screenshot);
    }
  }
  const probes:any[]=[];
  for(let i=0;i<5;i++) {
    const start=clock();
    const window=await phone.bound.shell(['dumpsys','window']);
    const input=await phone.bound.shell(['dumpsys','input']);
    const power=await phone.bound.shell(['dumpsys','power']);
    const size=await phone.bound.shell(['wm','size']);
    const serialMs=clock()-start;
    const {parseProbe}=await import('../src/observation.js');
    const serial=parseProbe(window,input,power,size);const parallelStart=clock();const parallel=await probe(phone.bound);
    if(!compatible(serial,parallel))throw new Error('State changed during probe comparison');
    probes.push({serialMs,parallelMs:clock()-parallelStart});
  }
  const base=signatures.get('uiautomator')!,fast=signatures.get('accessibility')!;
  const baseActions=actions.get('uiautomator')!,fastActions=actions.get('accessibility')!;
  const report={rows,probes,actionCoverage:{uiautomator:baseActions.size,accessibility:fastActions.size,matching:[...baseActions].filter(k=>fastActions.has(k)).length,missing:[...baseActions].filter(k=>!fastActions.has(k))},coverage:{uiautomatorLabels:base.size,accessibilityLabels:fast.size,matching:[...base].filter(k=>fast.has(k)).length,missing:[...base].filter(k=>!fast.has(k))}};
  await writeFile(join(output,'benchmark.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {
  if(old===undefined)delete process.env.ANDROID_USE_HIERARCHY;else process.env.ANDROID_USE_HIERARCHY=old;
  await phone.close();await android.close();
}
