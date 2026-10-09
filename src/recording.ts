import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** Explicit operator recording. Restart reads only; never replay phone actions. */
export async function recordSegments(options: {
  directory: string; signal: AbortSignal;
  start: (path: string) => Promise<ChildProcess>;
  retryMs?: number;
}) {
  await mkdir(options.directory, {recursive:true,mode:0o700});
  const event=async(fields:Record<string,unknown>)=>appendFile(join(options.directory,'recording.jsonl'),JSON.stringify({at:new Date().toISOString(),...fields})+'\n',{mode:0o600});
  while(!options.signal.aborted) {
    const path=join(options.directory,`segment-${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}.mp4`);
    let child:ChildProcess;
    try {child=await options.start(path);}catch(error) {
      await event({event:'start-failed',code:(error as any)?.code ?? 'ERROR'});
      if((error as any)?.code==='ENOENT')throw error;
      if(options.signal.aborted)break;
      await delay(options.retryMs??1000,options.signal);continue;
    }
    const stop=()=>{child.kill('SIGINT');};
    options.signal.addEventListener('abort',stop,{once:true});
    let errorCode:string|undefined;
    // Register immediately; a missing executable or early exit must not be missed.
    const closed=new Promise<{code:number|null;signal:string|null}>(resolve=> {
      child.once('error',e=>{errorCode=(e as NodeJS.ErrnoException).code??'ERROR';});
      child.once('close',(code,signal)=>resolve({code,signal}));
    });
    if(options.signal.aborted)stop();
    await event({event:'segment-started',path,pid:child.pid});
    const exit=await closed;
    options.signal.removeEventListener('abort',stop);
    await event({event:'segment-ended',path,...exit,...(errorCode?{errorCode}:{})});
    if(errorCode==='ENOENT')throw Object.assign(new Error('Recorder executable unavailable'),{code:errorCode});
    if(!options.signal.aborted)await delay(options.retryMs??1000,options.signal);
  }
}
function delay(ms:number,signal:AbortSignal) {
  return new Promise<void>(resolve=> {
    if(signal.aborted)return resolve();
    const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};
    const timer=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true});
  });
}
export const startScrcpy=(selector:string,path:string,adbPath:string)=>spawn('scrcpy',[
  `--serial=${selector}`,'--no-control','--no-audio','--no-window',`--record=${path}`,'--max-fps=15','--video-bit-rate=4M',
],{env:{...process.env,ADB:adbPath},stdio:['ignore','ignore','pipe']});
