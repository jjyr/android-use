# Agent interaction design

**Draft, not implemented or an approved tool contract.** Names, arguments and examples below are review candidates. The design adopts the persistent target-handle interaction of Pot computer-use and Codex CUA, with the tree-plus-pixels feedback and result verification discipline of upstream Cua Driver. These products are distinct; this is not API compatibility with any of them.

## Recommended agent surface

Provide a persistent JavaScript REPL through MCP, with runtime documentation on its first call, reusable device handles and typed observation output. This is the proposed primary agent surface. Typed SDK and operator CLI calls use the same core. Additional direct MCP action tools are deferred until there is a demonstrated integration need and an agreed interface.

The proposed REPL input contains `code`, `session_id` and `reset`. Its tool name remains undecided. A first call without code returns documentation and a session identifier. Reset requires the existing session identifier. Device access is explicitly opened inside the session; reading documentation never claims a phone.

A Node REPL executes host code and is not a security boundary. Hiding `process` or `require` does not confine dynamic imports. Approving this integration therefore includes host-code execution authority; a typed MCP-only surface is the alternative if that authority is unacceptable. Decide this before implementation.

Proposed JavaScript usage:

```javascript
// Pseudocode: these methods do not exist yet.
let devices = await android.listDevices();
// Operator configuration binds this device ID to an exact wireless endpoint.
let phone = await android.open({ deviceId: "test-phone", connection: "wireless" });
// The same handle API supports connection: "usb" with an enrolled USB selector.
let state = await phone.observe();
state = await phone.launchApp({ observationId: state.id, packageName: "com.example.fixture" });
state = await phone.click({ observationId: state.id, element: "7" });
// Inspect state before choosing the next action.
```

Device IDs are operator-enrolled logical identities, not IP addresses. Model calls select an enrolled connection; pairing codes and arbitrary network endpoints stay out of the REPL interface. Exact selector resolution belongs to the connection layer.

Discovery returns inventory. Open returns a handle and initial observation. Subsequent calls reuse the handle across invocations and agent turns. Launching an application does not create a new device session. Closing ends device control; resetting ends the REPL and all its handles. Expiry, process loss and connection-generation changes invalidate handles and element references.

| Proposed operation | Responsibility |
| --- | --- |
| `android.listDevices()` | Enumerate configured device identities, connection kinds, availability and authorization state |
| `android.open({deviceId, connection})` | Claim the enrolled device via the chosen connection and return initial observation |
| `phone.observe()` | Read current pixels, hierarchy, foreground state and capabilities |
| `phone.launchApp({packageName})` | Launch the installed application's resolved launcher Activity |
| `phone.click(...)` / `phone.longPress(...)` | Operate an observed element or screenshot point |
| `phone.swipe(...)` | Inject a bounded single-finger gesture in the observed coordinate space |
| `phone.typeText(...)` | Enter text into a validated observed editable target using a supported input capability |
| `phone.pressKey(...)` | Issue an allowlisted Android navigation key, initially Back/Home |
| `phone.close()` | Release control and invalidate the handle |

Explicit launch and navigation are state-changing actions too and require the current observation revision, consistently with touch/text operations.

## Observation contract

A normalized observation contains:

- Schema version, session/enrolled-device identity, connection kind, connection generation and observation ID.
- Capture start/end times and component timestamps; hierarchy, pixels and foreground state are not an atomic Android snapshot.
- Foreground package/Activity when observable, with unknown values represented explicitly.
- Display identity, orientation, full-display dimensions and screenshot dimensions/transform.
- Visible elements with observation-local IDs, text, content description, resource ID, class/role, bounds and actionable/editable/enabled properties. IDs are never stable across observations.
- A screenshot as typed image content in mixed mode; it is not embedded as base64 text in the model-facing JSON.
- Capability flags, truncation and limitations, including hierarchy unavailable, secure capture, unsupported text and capture instability.

Text mode exposes hierarchy and geometry; mixed mode adds the screenshot. The host fixes the mode. Screenshot-derived coordinates require mixed mode. An element action can use tree-provided bounds in text mode, but must report that it injected a positional touch rather than a semantic UI action.

Initial responses use a full hierarchy. Bounded hierarchy diffs are a later optimization and must retain an unambiguous full-state recovery route. A screenshot-only refresh invalidates previous element references; obtaining another tree must create a fresh observation ID.

## Action admission and coordinate mapping

Every action targets one bound device. Element and point targeting are mutually exclusive. Element actions require a current observation ID and an element from it. Pixel points refer to the displayed screenshot; the adapter maps them to Android display pixels using the observation's recorded scale/orientation, including system bars and cropping. There is no fixed desktop-sized viewport or implicit dp-to-pixel conversion.

Before dispatch, validate identity/generation, latest observation ID, bounds, target properties and permitted action. Recheck foreground and geometry where available. If either changed, refuse and return or request a new observation. Reusing the latest ID prevents known stale references; it cannot prove that a dynamic page or user touch did not change between capture and input.

The first backend uses UIAutomator dumps for discovery, not semantic action delivery. An element click resolves its bounds and sends ADB touch input. Refuse ambiguous, empty or off-screen targets rather than guessing. A companion AccessibilityService may later add semantic click and text-setting capabilities behind the same normalized result format.

Text input must declare append versus replacement behavior. Standard ADB input is not a reliable arbitrary-Unicode, multiline or replace-text implementation. Unsupported requests must fail before input; do not report success after truncation or silent substitution. Chinese and IME support require a dedicated acceptance gate.

## Observe, act, settle, verify

All successful actions automatically emit and return a new observation. Deterministic calls can share one REPL invocation, but await them sequentially and inspect the returned state before making a new decision. Concurrent calls against a device are rejected or serialized by a documented policy, never interleaved silently.

After input, use bounded settling probes for foreground/geometry changes and page evidence. A changed screenshot hash is neither required for success nor proof of success. Return settling status and elapsed time; animation or timeout can yield a partial observation. Do not require caller-inserted blind sleeps for ordinary actions. Any future wait primitive must have an explicit condition and deadline.

Separate three outcomes:

| Layer | Evidence |
| --- | --- |
| Command execution | ADB command completed, failed or has unknown outcome |
| UI effect | Post-action observation shows a relevant change, no change or insufficient evidence |
| User task | Agent compares application-owned state with the requested result |

A search action is complete only when results or an explicit empty result are visible. An app launch is verified by the observed target foreground state, not just the launch command exit code. Form completion checks displayed values; submission checks application acknowledgement. The adapter must never claim the entire user's goal was achieved merely because input was delivered.

## Errors, recovery and takeover

Results preserve emitted observations even when a later step fails. Distinguish `not_dispatched`, `dispatched`, `completed` and `unknown` action states and provide a structured error code, message and recovery hint. A completed input followed by failed capture is not an unexecuted action.

Candidate error categories include stale observation, busy device, unauthorized/offline/disconnected device, session expired, target ambiguity, unsupported capability, failed capture and command timeout. Final code names are part of interface review.

No automatic replay of mutations after transport loss or timeout. A repeated request identifier must either replay a retained result or return an unknown-outcome refusal; it must not reexecute input. Minimal recovery records exclude typed content and raw screenshots. Multi-step REPL calls report the completed prefix and failed step; invocation deduplication does not make a sequence transactional.

Manual takeover pauses admission, drains or classifies in-flight actions and invalidates the current observation. Resume explicitly acquires control and observes again. scrcpy is an optional operator interface, not a source of Android hierarchy or an ownership guarantee against other clients.

## Decisions required before implementation

1. Confirm persistent REPL as the primary MCP interface, including host-code execution authority, or choose typed MCP calls instead.
2. Approve tool name, session arguments, handle methods, target/revision fields and result/error schemas.
3. Fix observation modes, payload/time limits, lease and expiry behavior, request recovery retention and takeover entry points.
4. Fix text input semantics and the first host/device qualification matrix.

These decisions do not change the existing Pot `cua_repl` or register new model-visible tools.
