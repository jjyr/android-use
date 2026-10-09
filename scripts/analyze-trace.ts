/** Host-side analysis; this does not expose or change an MCP tool. */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
function option(name: string) { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i+1]; }
const input = option("trace"), destination = option("out");
if (!input || !destination) throw new Error("Usage: mise exec -- pnpm exec tsx scripts/analyze-trace.ts --trace <run directory> --out <report directory> [--usage <host JSONL> --turn-id <Codex turn UUID>]");
const root = resolve(input), out = resolve(destination);
type Row = Record<string, any>;
const warnings: string[] = [];
async function jsonl(path: string) {
  const lines = (await readFile(path, "utf8")).split("\n");
  const rows: Row[] = [];
  for (let i=0; i<lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    try { rows.push(JSON.parse(lines[i]!)); }
    catch { warnings.push(`Invalid JSONL line ${i+1} in ${path}; possibly interrupted write`); }
  }
  return rows;
}
const events: Row[] = [];
for (const file of await readdir(root))
  if (/^\d+\.jsonl$/.test(file)) events.push(...await jsonl(join(root,file)));
const starts = new Map<string, Row>(), ends = new Map<string, Row>();
if (events.some(e=>e.loggingDegraded || (e.event==='artifact' && e.persisted===false)))
  warnings.push('The recorder reported a persistence failure; trace/evidence may be incomplete');
for (const event of events) {
  if (event.event === "span.start") starts.set(event.spanId,event);
  if (event.event === "span.end") ends.set(event.spanId,event);
}
if (!starts.size) throw new Error("No trace spans found");
function union(intervals: [number,number][]) {
  let total = 0, lastStart = 0, lastEnd = 0, first = true;
  for (const [a,b] of intervals.sort((x,y)=>x[0]-y[0])) {
    if (first) { lastStart=a; lastEnd=b; first=false; }
    else if (a<=lastEnd) lastEnd=Math.max(lastEnd,b);
    else { total+=lastEnd-lastStart; lastStart=a; lastEnd=b; }
  }
  return first ? 0 : total+lastEnd-lastStart;
}
const ns = (row: Row) => Number(BigInt(row.monotonicNs))/1e6;
const children = new Map<string, Row[]>();
for (const row of starts.values()) {
  if (!row.parentId) continue;
  const list = children.get(row.parentId) ?? [];
  list.push(row); children.set(row.parentId,list);
}
const spans: Row[] = [];
for (const start of starts.values()) {
  const end = ends.get(start.spanId);
  let selfMs: number | null = null;
  if (end) {
    const intervals: [number,number][] = [];
    for (const child of children.get(start.spanId) ?? []) {
      const childEnd = ends.get(child.spanId);
      if (!childEnd) continue;
      const a=Math.max(ns(start),ns(child)), b=Math.min(ns(end),ns(childEnd));
      if (b>a) intervals.push([a,b]);
    }
    selfMs = Math.max(0,end.durationMs-union(intervals));
  }
  spans.push({ spanId: start.spanId, parentId: start.parentId, name: start.name,
    startedAt: start.startedAt, endedAt: end?.endedAt ?? null,
    durationMs: end?.durationMs ?? null, selfMs, status: end?.status ?? "incomplete",
    workDurationMs: end?.workDurationMs ?? end?.durationMs ?? null, startPersistenceMs: end?.startPersistenceMs ?? 0,
    requestId: start.requestId ?? null, observationId: start.observationId ?? end?.result?.observationId ?? null,
    replSessionId: start.replSessionId ?? end?.result?.replSessionId ?? null,
    mcpRequestId: start.mcpRequestId ?? null, codeSha256: start.codeSha256 ?? null,
    taskId: start.taskId ?? null, toolCallId: start.toolCallId ?? null, modelRequestId: start.modelRequestId ?? null,
    provider: start.provider ?? null,
    command: start.command ?? null, errorCode: end?.errorCode ?? end?.result?.errorCode ?? null,
    result: end?.result ?? null });
}
for (const span of spans) {
  let ancestor: Row | undefined = starts.get(span.spanId);
  const visited = new Set<string>();
  span.invocationSpanId = null;
  while (ancestor && !visited.has(ancestor.spanId)) {
    visited.add(ancestor.spanId);
    for (const key of ['taskId','toolCallId','modelRequestId','mcpRequestId','replSessionId'])
      if (span[key] === null && ancestor[key] !== undefined && ancestor[key] !== null) span[key] = ancestor[key];
    if (ancestor.name === 'mcp.android_repl') span.invocationSpanId = ancestor.spanId;
    ancestor = starts.get(ancestor.parentId);
  }
}
spans.sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
const aggregate = new Map<string, Row>();
for (const span of spans) {
  const row = aggregate.get(span.name) ?? { name:span.name, calls:0, errors:0, incomplete:0, durations:[], selfMs:0 };
  row.calls++; if(span.status==='error') row.errors++; if(span.status==='incomplete') row.incomplete++;
  if(span.durationMs!==null) { row.durations.push(span.durationMs); row.selfMs+=span.selfMs; }
  aggregate.set(span.name,row);
}
const stages = [...aggregate.values()].map(row=> {
  const sorted: number[] = row.durations.sort((a:number,b:number)=>a-b);
  return {name:row.name,calls:row.calls,errors:row.errors,incomplete:row.incomplete,
    inclusiveMs:sorted.reduce((a,b)=>a+b,0),selfMs:row.selfMs,
    p50Ms:sorted.length ? sorted[Math.max(0,Math.ceil(sorted.length*.5)-1)] : null,
    p95Ms:sorted.length ? sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)] : null};
}).sort((a,b)=>b.selfMs-a.selfMs);

const keys = ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens'];
const models: Row[] = [];
const usagePath=option('usage'), turnId=option('turn-id');
const modelIds=new Set<string>();
if(usagePath) for(const row of await jsonl(resolve(usagePath))) {
  const codex=row.type==='token_usage_record';
  if(!codex && !row.usage) continue;
  if(codex && !turnId) throw new Error('--turn-id is required for a Codex rollout; whole-thread totals are not task usage');
  if(codex && row.payload.turn_id!==turnId) continue;
  const p=codex ? row.payload : row;
  const requestId=p.response_id ?? p.requestId;
  if(typeof requestId!=='string') throw new Error('Model usage requires a unique requestId');
  if(modelIds.has(requestId)) { warnings.push(`Duplicate model usage ${requestId} ignored`); continue; }
  modelIds.add(requestId);
  const usage: Row={};
  for(const key of keys) {
    const n=p.usage[key] ?? (key==='cached_input_tokens'||key==='reasoning_output_tokens' ? 0 : undefined);
    if(!Number.isSafeInteger(n)||n<0) throw new Error(`Invalid provider usage: ${requestId}/${key}`);
    usage[key]=n;
  }
  if(usage.cached_input_tokens>usage.input_tokens || usage.reasoning_output_tokens>usage.output_tokens || usage.total_tokens!==usage.input_tokens+usage.output_tokens)
    throw new Error(`Inconsistent provider usage: ${requestId}`);
  const ids: string[]=Array.isArray(p.toolSpanIds) ? p.toolSpanIds.filter((id:unknown)=>typeof id==='string') : [];
  for (const s of starts.values())
    if (s.modelRequestId===requestId || (s.toolCallId && Array.isArray(p.toolCallIds) && p.toolCallIds.includes(s.toolCallId)))
      if (!ids.includes(s.spanId)) ids.push(s.spanId);
  for(const id of ids) if(!starts.has(id)) warnings.push(`Model ${requestId} references a missing span ${id}`);
  models.push({requestId,completedAt:row.timestamp ?? p.endedAt ?? null,toolSpanIds:ids,usage});
}
const totalTokens=Object.fromEntries(keys.map(key=>[key,models.reduce((n,r)=>n+r.usage[key],0)]));
const roots=[...starts.values()].filter(s=>!s.parentId);
const activeIntervals: [number,number][] = roots.flatMap(s=>ends.has(s.spanId) ? [[ns(s),ns(ends.get(s.spanId)!)]] : []);
const wallStart=Math.min(...[...starts.values()].map(s=>Date.parse(s.startedAt)));
const wallEnd=Math.max(...[...ends.values()].map(s=>Date.parse(s.endedAt)),wallStart);
const report={ schemaVersion:1, runs:[...new Set(events.map(e=>e.runId))], wallStart:new Date(wallStart).toISOString(),
  wallEnd:new Date(wallEnd).toISOString(),wallMs:wallEnd-wallStart,
  completedRootActiveMs:union(activeIntervals),spans:spans.length,incomplete:spans.filter(s=>s.status==='incomplete').length,
  orphanSpans:spans.filter(s=>s.parentId&&!starts.has(s.parentId)).length,
  stages,models,totalTokens,modelRequestsWithoutStepLink:models.filter(m=>!m.toolSpanIds.length).length,warnings,
  notes:['Inclusive parent and child durations overlap. selfMs subtracts the union of completed direct children, clipped to the parent.',
    'selfMs includes logging overhead, serialization outside measured children and uninstrumented work. Incomplete children cannot be subtracted precisely.',
    'Root active time excludes gaps between invocations; span durations use the same-host monotonic clock. UTC times correlate host/recording events.',
    'No tokens are estimated. Explicit host toolSpanIds link model requests to operations; shared requests are not split or counted multiple times.',
    'Without explicit host links, provider usage is available only at request/task level. Android-use does not know model latency or billed prices.']};
await mkdir(out,{recursive:true});
await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(out,'spans.json'),JSON.stringify(spans,null,2)+'\n');
const columns=Object.keys(spans[0]!).filter(k=>k!=='result');
const cell=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
await writeFile(join(out,'spans.csv'),[columns.map(cell).join(','),...spans.map(s=>columns.map(k=>cell(s[k])).join(','))].join('\n')+'\n');
const md=['# Android-use telemetry analysis','',`Observed trace interval: ${report.wallStart} to ${report.wallEnd} (${(report.wallMs/1000).toFixed(3)}s).`,
  `Spans: ${report.spans}; incomplete: ${report.incomplete}; orphan spans: ${report.orphanSpans}.`,'',
  '| Stage | Calls | Errors | Incomplete | Inclusive seconds | Self seconds | p95 ms |','| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...stages.map(s=>`| ${s.name} | ${s.calls} | ${s.errors} | ${s.incomplete} | ${(s.inclusiveMs/1000).toFixed(3)} | ${(s.selfMs/1000).toFixed(3)} | ${s.p95Ms?.toFixed(3) ?? 'unknown'} |`),'',
  `Provider usage: ${models.length} requests; ${totalTokens.input_tokens} input (${totalTokens.cached_input_tokens} cached), ${totalTokens.output_tokens} output (${totalTokens.reasoning_output_tokens} reasoning, included in output).`,
  `Requests without explicit step links: ${report.modelRequestsWithoutStepLink}.`,'',...report.notes.map(n=>'- '+n),...warnings.map(w=>'- Warning: '+w)];
await writeFile(join(out,'report.md'),md.join('\n')+'\n');
console.log(JSON.stringify({out,spans:report.spans,incomplete:report.incomplete,modelRequests:models.length,totalTokens,warnings},null,2));
