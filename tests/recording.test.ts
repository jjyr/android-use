import { it,expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp,readFile,rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recordSegments } from "../src/recording.js";
it('segments and restarts an exited recorder, and stops without restarting on abort',async()=> {
 const directory=await mkdtemp(join(tmpdir(),'android-record-'));let starts=0;const abort=new AbortController();
 try {
  await recordSegments({directory,signal:abort.signal,retryMs:1,start:async()=> {
   starts++;const child=spawn(process.execPath,['-e',starts===1?'process.exit(1)':'setInterval(()=>{},1000)']);
   if(starts===2)setTimeout(()=>abort.abort(),100);return child;
  }});
  expect(starts).toBe(2);
  const records=(await readFile(join(directory,'recording.jsonl'),'utf8')).trim().split('\n').map(s=>JSON.parse(s));
  expect(records.map(r=>r.event)).toEqual(['segment-started','segment-ended','segment-started','segment-ended']);
  expect(records[0].path).not.toBe(records[2].path);
 }finally{await rm(directory,{recursive:true,force:true});}
});
