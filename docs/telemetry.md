# Local operation telemetry

Implemented on 2026-10-09. The MCP tool name, arguments, returned feedback and phone methods are unchanged. This is host-side persistence and analysis, not a new model-visible tool.

## Collection

Diagnostic tracing is **off by default**. Set `ANDROID_USE_DEBUG=1` explicitly to let SDK, CLI and MCP operations append versioned JSONL records under `<stateDir>/traces/<run UUID>/<PID>.jsonl`. Without an explicit persistent `stateDir`, the existing OS temporary state directory is used and OS cleanup can remove it. Use the persistent machine-local configuration documented in README. A single MCP server and its REPL workers share a run UUID, with separate files per process; multiple operations within one code invocation remain distinguishable.

Each span has separate start/end events, a unique span ID, parent ID, UTC timestamps and a monotonic clock duration. SDK entry spans retain method names, request IDs, observation references and input hashes. MCP spans retain JSON-RPC request IDs, REPL session IDs, code hashes/byte counts and response text/image sizes. Response summaries include dispatch/effect/settling, resulting observation IDs, limitations and error codes. A worker killed by a timeout can leave an unfinished span; analysis reports it as incomplete rather than claiming success.

Nested spans measure validation, connection health, preflight, preparation, recovery journal writes, dispatch, settling, observation attempts, before/after probes, screenshot acquisition, PNG decoding, hierarchy dump/read/parse, cleanup, IME queries, individual ADB command categories and observation feedback serialization. Failed captures and retries remain visible even when the final public result contains only the last capture.

The former action `elapsedMs` field retains its existing meaning. Use trace spans for the full operation, including admission/preflight, rather than interpreting that field as input injection time.

## Timing interpretation

`durationMs` uses `process.hrtime.bigint()` from span entry to operation completion. UTC timestamps support correlation with recordings and host events. Nanosecond clock values do not imply nanosecond physical measurement accuracy.

Async spans also record `workDurationMs` and `startPersistenceMs`: the former excludes their own start-event/input-artifact persistence, while the latter measures that overhead. Parent work includes child tracing overhead. End-record and output-artifact persistence occur after the span duration ends and can appear in the parent's self time or the gap before the next call. Synchronous feedback serialization queues its records and measures the synchronous work directly.

Analysis computes inclusive and self durations. Self duration subtracts the union of completed direct-child intervals, clipped to the parent; parallel child spans are not double-counted. Never add parent and child inclusive durations. Self time includes remaining logging and uninstrumented work, not necessarily model reasoning. Missing child end events limit exact attribution. All processes in a run use the same host monotonic clock; do not merge different hosts into one timing partition.

Start events are appended before async operations execute. File appends are awaited but are not power-loss-safe `fsync` commits. Logging failures produce a stderr warning and preserve original operation results/errors; treat that trace as incomplete. No protocol diagnostics are printed to stdout. JSON-RPC schema validation rejected before the tool handler is reached is outside this recorder.

## Host settings and evidence

Settings are host environment variables, not MCP tool arguments:

| Variable | Meaning |
| --- | --- |
| `ANDROID_USE_DEBUG` | `1` enables diagnostic span collection; unset/other values create no traces or artifacts |
| `ANDROID_USE_TRACE` | `0` disables collection even in debug mode; `1` alone does not enable it |
| `ANDROID_USE_TRACE_DIR` | Override the trace root directory |
| `ANDROID_USE_TRACE_CONTENT` | In debug mode only, `1` retains full operation/MCP input and output JSON plus PNG artifacts; otherwise metadata only |
| `ANDROID_USE_TASK_ID` | Optional task label for a dedicated host process |

Debug metadata omits typed text, URLs, UI text, raw code, screenshots, machine selectors, configuration and command stderr. Input/code hashes allow correlation without retaining their contents. Full evidence requires both `ANDROID_USE_DEBUG=1` and `ANDROID_USE_TRACE_CONTENT=1`: it can contain private screen content, typed text and arbitrary REPL code. PNGs are stored by content hash and deduplicated within the run. Directories/files are created with 0700/0600 modes. No data is uploaded. Retention is operator-managed; there is no automatic deletion of recovery journals or traces.

For this development workflow, operator-selected evidence can live in Git-ignored `docs/notes/`; machine connection configuration remains under `~/Workspace/Machines`. Do not commit runtime evidence.

## Exact model usage correlation

Android-use does not invoke the model and cannot measure token usage or model latency itself. The host must retain provider-reported usage **once per model request**, including input, cached input, output, reasoning output (a subset of output), request ID and timestamps. Text length, image byte size and cumulative conversation counters are not substitutes for provider usage.

Hosts may attach transport-only MCP request `_meta` fields `android-use/taskId`, `android-use/toolCallId` and `android-use/modelRequestId` (strings up to 256 characters). These become local trace fields; they do not change model-facing arguments or responses. A persistent MCP server can therefore distinguish successive tasks. Parent IDs correlate each device step with its enclosing invocation.

Supply normalized host usage JSONL to the analyzer:

```json
{"requestId":"provider-response-id","endedAt":"2026-10-09T12:00:00Z","toolCallIds":["host-tool-call-id"],"usage":{"input_tokens":1000,"cached_input_tokens":900,"output_tokens":100,"reasoning_output_tokens":40,"total_tokens":1100}}
```

Alternatively supply `toolSpanIds`, or set `modelRequestId` on the corresponding MCP invocation to the provider request ID. One model request may generate multiple tool calls and one tool invocation may contain multiple phone operations. Preserve that relationship; do not split its tokens evenly across clicks or charge its usage repeatedly. Requests without host correlation remain explicitly unlinked. Model requests producing final text may have no device step.

The analyzer can also read local Codex `token_usage_record` JSONL with an explicit turn ID. It exports only usage, not raw conversation or reasoning text. This provides exact request/task totals; existing Codex turns without correlation metadata remain unlinked at step level. The current Codex environment does not automatically export provider usage or these correlation fields into Android-use; live integration of the host exporter remains separate work.

Normal request journals and leases remain enabled: they retain admission/outcome IDs needed to prevent replay and coordinate ownership, not diagnostic screenshots or UI text.

## Analysis

```sh
mise exec -- pnpm exec tsx scripts/analyze-trace.ts \
  --trace /absolute/local/state/traces/RUN_UUID \
  --out docs/notes/performance/RUN_UUID \
  --usage /absolute/local/host-usage.jsonl
```

For an existing Codex rollout, add `--turn-id TURN_UUID`. Outputs: `report.md`, `report.json`, `spans.csv` and `spans.json`. Reports include phase distributions, errors, unfinished operations, root active time, per-model-request provider usage and unlinked request counts. Root active time excludes invocation gaps; the trace interval runs from the first recorded operation to the last recorded completion, not necessarily from the human request to the final answer. Host task lifecycle events are needed for that larger interval.

Automated tests cover nested timing, overlapping child spans, metadata privacy, opted-in evidence, deduplication, logging failure, exact usage links, MCP/worker correlation, refused mutations and real worker timeout. These use simulated ADB and do not operate a physical phone. A real-device Ctrip search on 2026-10-09 verified full collection: 77 MCP invocations and 3,354 completed spans, with zero incomplete or orphan spans. It retained refused inputs, unavailable hierarchy captures and a transient ADB failure. Provider usage was imported at task/request level; exact provider-request-to-device-step linkage remains unqualified. Runtime evidence is local in Git-ignored `docs/notes/`. The external recorder disconnected near the final query, so this run does not qualify uninterrupted end-to-end video recording.
