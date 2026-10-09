# MCP contract for implementation review

Status: explicitly approved by the user on 2026-10-09; implemented; verification coverage is documented in qualification.md. This document fixes the agreed names, arguments and behavior.

One stdio MCP tool: `android_repl`.

Arguments: `code?: string` (maximum 16,384 characters), `session_id?: string`, `reset?: boolean` (default false). A call with no session and no code creates a session and returns runtime documentation and its ID. Code requires that ID. Reset requires the ID, closes its phone handles and terminates the worker. Sessions expire after 10 idle minutes. One invocation per session; concurrent calls return busy. Code has a 30-second wall deadline; timeout terminates the worker and releases owned leases after reconciling command outcomes. This executes host Node code and is not a sandbox.

Persistent bindings: `android`, `console`, `emit(value)`. Variables and top-level await persist across invocations. `console` output is bounded. Each observation produced by a phone operation is automatically emitted as structured JSON plus a separate MCP PNG image block in mixed mode. `emit` emits bounded JSON; image bytes never appear as base64 text in JSON. Errors retain earlier emitted observations and state that a command may already have executed.

SDK and REPL phone methods use these signatures:

```ts
android.listDevices()
android.open({ deviceId: string, connection: 'usb' | 'wireless' }) // Phone; initial observation emitted
phone.observe()
phone.listApps() // launchable apps, package and resolved Activity
phone.launchApp({ observationId, requestId, packageName })
phone.stopApp({ observationId, requestId, packageName })
phone.openUrl({ observationId, requestId, packageName, url }) // explicit installed browser; http/https only
phone.click({ observationId, requestId, target })
phone.longPress({ observationId, requestId, target, durationMs? })
phone.swipe({ observationId, requestId, start, end, durationMs? })
phone.drag({ observationId, requestId, start, end, durationMs? }) // bounded single-finger gesture
phone.typeText({ observationId, requestId, text, mode: 'insert' | 'append' | 'replace' | 'clear' })
phone.pressKey({ observationId, requestId, key: 'Back' | 'Home' | 'Recents' })
phone.pause() // reject subsequent mutations for manual takeover
phone.resume() // invalidate old references and return a fresh observation
phone.close() // release owned resources; no app stop, global ADB disconnect or IME change
```

`target` is exactly `{ elementId: string }` or `{ x: number, y: number }`. Gesture start/end are screenshot points. Points require mixed mode. Element IDs belong to the current observation; positional delivery is explicit. No arbitrary shell, device IP, pairing code or APK provisioning is exposed in the tool.

Every mutation requires the latest observation ID and a caller request ID (1-128 ASCII letters/digits/underscore/hyphen). Requests are durably marked before dispatch. Repeated IDs are refused, including unknown outcomes; they never replay input. Connection loss invalidates the handle; reopen requires a new binding and observation. Per-physical-device leases cover logical aliases and USB/wireless routes. Busy mutations are rejected rather than interleaved.

Observation fields: `schemaVersion`, `id`, `sessionId`, `deviceId`, `connection`, `generation`, `captureStartedAt`, `captureEndedAt`, `components`, `foreground`, `display`, `elements`, `capabilities`, `limitations`, `partial`. Screenshot bytes are SDK binary content and MCP image blocks. Text mode omits image output and rejects point actions. Element data includes text/description/resourceId/class/bounds/actionability/editability/focus/enabled; invalid or off-screen bounds are filtered. Capture retries inconsistent foreground/geometry at most twice; still-inconsistent observations are partial and do not admit mutations.

Action result: `requestId`, `dispatch: 'not_dispatched' | 'completed' | 'unknown'`, `effect: 'changed' | 'no_change' | 'unverified'`, `elapsedMs`, `settling: 'stable' | 'timeout'`, `observation`, optional `error`. New pixels or a command exit code alone do not prove a user task. Capture failure after execution preserves completed/unknown dispatch and never claims no input occurred.

Text input requires the configured dedicated IME already installed, enabled and selected by the operator. It validates active editor package and IME editor generation. Insert uses current cursor/selection; append moves to the end only with complete text; replace/clear select complete content or refuse. Hidden or absent hierarchy does not authorize blind typing: the IME probe and a fresh foreground observation must establish the editor. Password fields are refused. The IME bridge requires Android DUMP sender permission; provisioning remains CLI/operator work.

Initial bounds: ADB command timeout 15 seconds, PNG 6 MiB, hierarchy 2 MiB/5,000 nodes, text 8 KiB UTF-8, settling 2 seconds, observation maximum age 60 seconds. Default host mode is mixed. These are validation limits, not a latency SLA. Error codes include BUSY, CLOSED, PAUSED, STALE_OBSERVATION, DEVICE_UNAVAILABLE, IDENTITY_MISMATCH, INVALID_TARGET, UNSUPPORTED, CAPTURE_FAILED, REQUEST_REPEATED, COMMAND_TIMEOUT and REPL_TIMEOUT. Refusals occur before mutation when validation fails.

Implementation clarification: `settling: stable` covers foreground/geometry probes, not network/render completion. Sequential screenshot and hierarchy capture is not atomic. See interaction.md for limitations and qualification.md for verified coverage.
