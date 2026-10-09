import { it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Recorder, stage } from "../src/telemetry.js";
import { run } from "../src/process.js";
const roots: string[] = [];
beforeEach(() => { vi.stubEnv("ANDROID_USE_DEBUG", "1"); });
const originalContent = process.env.ANDROID_USE_TRACE_CONTENT;
afterEach(async () => {
  if (originalContent === undefined) delete process.env.ANDROID_USE_TRACE_CONTENT;
  else process.env.ANDROID_USE_TRACE_CONTENT = originalContent;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for(const r of roots.splice(0)) await rm(r,{recursive:true,force:true});
});
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'android-trace-')); roots.push(root);
  return {root, recorder:new Recorder({stateDir:root})};
}
it('retains refused operations, nested timing and privacy-safe metadata',async()=> {
  process.env.ANDROID_USE_TRACE_CONTENT='0';
  const {recorder}=await fixture();
  const phone={async typeText(_args:unknown) { return stage('action.dispatch',async()=> { throw Object.assign(new Error('secret message'),{code:'INPUT_REFUSED'}); }); }};
  recorder.methods(phone,'phone',['typeText']);
  await expect(phone.typeText({text:'secret input',requestId:'refused'})).rejects.toMatchObject({code:'INPUT_REFUSED'});
  const raw=await readFile(recorder.file,'utf8');
  expect(raw).not.toContain('secret input'); expect(raw).not.toContain('secret message');
  const events=raw.trim().split('\n').map(s=>JSON.parse(s));
  const parent=events.find(e=>e.event==='span.start'&&e.name==='phone.typeText');
  const child=events.find(e=>e.event==='span.start'&&e.name==='action.dispatch');
  expect(parent.requestId).toBe('refused'); expect(child.parentId).toBe(parent.spanId);
  expect(events.filter(e=>e.event==='span.end').every(e=>e.status==='error'&&e.durationMs>=0&&e.errorCode==='INPUT_REFUSED')).toBe(true);
});
it('captures opted-in inputs and deduplicates PNG evidence',async()=> {
  process.env.ANDROID_USE_TRACE_CONTENT='1';
  const {recorder}=await fixture();
  const value={screenshot:Buffer.from('test-png')};
  await recorder.span('test',async()=>value,{}, {input:{text:'杭州'},content:true});
  await recorder.span('test',async()=>value,{}, {content:true});
  const names=await readdir(recorder.directory);
  expect(names.filter(n=>n.endsWith('.png'))).toHaveLength(1);
  const input=names.find(n=>n.endsWith('-input.json'))!;
  expect(JSON.parse(await readFile(join(recorder.directory,input),'utf8')).text).toBe('杭州');
  expect(await readFile(join(recorder.directory,names.find(n=>n.endsWith('.png'))!))).toEqual(value.screenshot);
});
it('a failed logger preserves operation results and errors',async()=> {
  const {root}=await fixture();
  const path=join(root,'file'); await writeFile(path,'not a directory');
  const recorder=new Recorder({stateDir:path});
  const warning=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);
  expect(await recorder.span('ok',async()=>42)).toBe(42);
  const error=new Error('original');
  await expect(recorder.span('failed',async()=> {throw error;})).rejects.toBe(error);
  expect(warning).toHaveBeenCalledTimes(1);
});
it('analyzes overlapping spans, incomplete calls and exact linked provider usage',async()=> {
  process.env.ANDROID_USE_TRACE_CONTENT='0';
  const {recorder,root}=await fixture();
  await recorder.span('mcp.android_repl',async()=> {
    await Promise.all([stage('slow',()=>new Promise(r=>setTimeout(r,20))),stage('fast',()=>new Promise(r=>setTimeout(r,10)))]);
  },{toolCallId:'host-call',modelRequestId:'model-request'});
  await appendFile(recorder.file,JSON.stringify({event:'span.start',spanId:'unfinished',parentId:null,name:'killed',startedAt:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString()})+'\n');
  const usage=join(root,'usage.jsonl');
  await writeFile(usage,JSON.stringify({requestId:'model-request',usage:{input_tokens:100,cached_input_tokens:90,output_tokens:10,reasoning_output_tokens:5,total_tokens:110}})+'\n');
  const out=join(root,'report');
  const result=await run(process.execPath,[resolve('dist/scripts/analyze-trace.js'),'--trace',recorder.directory,'--out',out,'--usage',usage]);
  expect(result.code).toBe(0);
  const report=JSON.parse(await readFile(join(out,'report.json'),'utf8'));
  expect(report.totalTokens.total_tokens).toBe(110);
  expect(report.modelRequestsWithoutStepLink).toBe(0);
  expect(report.models[0].toolSpanIds).toHaveLength(1);
  expect(report.incomplete).toBe(1);
  const parent=report.stages.find((s:any)=>s.name==='mcp.android_repl');
  expect(parent.selfMs).toBeGreaterThanOrEqual(0);
  expect(parent.inclusiveMs-parent.selfMs).toBeGreaterThan(15);
});

it('does not create traces or content by default, even with content flags',async()=> {
  delete process.env.ANDROID_USE_DEBUG;
  process.env.ANDROID_USE_TRACE_CONTENT='1';
  const {recorder,root}=await fixture();
  expect(recorder.enabled).toBe(false); expect(recorder.full).toBe(false);
  const object={async operation(){return 7;}}; const original=object.operation;
  recorder.methods(object,'phone',['operation']);
  expect(object.operation).toBe(original);
  expect(await recorder.span('off',()=>object.operation(),{}, {input:'private',content:true})).toBe(7);
  expect(recorder.sync('off',()=>8)).toBe(8);
  expect(await readdir(root)).toEqual([]);
});
