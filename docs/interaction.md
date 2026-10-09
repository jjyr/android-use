# Agent interaction and feedback

Implemented as of 2026-10-09 under the explicitly approved [MCP contract](mcp-contract.md). That document is authoritative for tool names, arguments and limits. The design uses a persistent target handle and tree-plus-pixels feedback; it does not claim API compatibility with Pot, Codex CUA or upstream Cua.

## Persistent host REPL

One stdio tool, `android_repl`, creates an isolated persistent Node worker. A first call without code returns runtime documentation and `session_id`. Subsequent calls supply that ID and code; variables and top-level await persist. Reset terminates the worker, invalidates handles and reconciles owned dead leases. Idle expiry is 10 minutes; an invocation has a 30-second wall deadline. Concurrent invocations return busy.

This is authorized host-code execution, not a sandbox. The pinned Node REPL's internal domain forwards asynchronous evaluation errors to the protocol; tests verify an error followed by successful continued evaluation. A Node upgrade must requalify this integration.

```javascript
let phone = await android.open({ deviceId: 'test-phone', connection: 'wireless' });
// Inspect the automatically emitted observation before the next action.
await phone.click({
  observationId: phone.observation.id,
  requestId: 'click-example-unique',
  target: { elementId: '7' }
});
```

Opening requires an explicitly enrolled device and connection kind. Discovery never claims a phone. Launching another application keeps the device handle. Closing releases ownership without changing the keyboard, stopping unrelated apps or undoing previous phone actions.

## Observations

Open, observe, resume and each executed action automatically emit normalized JSON and a separate typed MCP PNG image in mixed mode. JSON never embeds screenshot bytes. Observations include revision, generation, capture intervals/component timestamps, foreground, display geometry, hierarchy, capabilities and limitations. XML numeric Unicode entities are decoded without trimming editor whitespace. Invalid or off-screen bounds are filtered; DTD/entity declarations, malformed XML and resource limits are rejected.

Text mode omits image output and refuses screenshot-point actions. Mixed mode points use original PNG pixels at scale 1, including system bars. A client that resizes an image must map coordinates back to those original pixels. Element IDs belong only to their observation. Element actions resolve bounds and inject positional ADB touch; they are not semantic AccessibilityService actions.

Capture checks foreground/rotation/awake/keyguard/geometry before and after acquisition and retries an inconsistent capture twice. Unknown keyguard state, a showing keyguard, a sleeping phone, black/unavailable pixels or inconsistent geometry produce explicit limitations and a partial observation that cannot admit mutations. Missing hierarchy alone allows screenshot-based actions when usable mixed-mode pixels and metadata remain available.

**Capture is sequential, not atomic.** A dynamic WebView can render between screenshot and hierarchy acquisition, and UIAutomator can omit visible overlays or preserve old web nodes. Matching foreground/geometry does not detect every such case. Inspect the returned pixels and component times; obtain another observation when loading, animation or visible disagreement remains. Never use a known stale tree target simply because its ID is current.

## Admission and outcome

Every mutation validates latest observation ID, generation, age (60 seconds), mode, bounds, actionability and pause status. A fresh preflight checks exact transport health, foreground, rotation, awake/keyguard and display size. Fractional screenshot points are floored to stay within admitted bounds. The controller cannot exclude external ADB clients or human touches; a remaining capture-to-input race is documented.

A host-local physical-serial lease excludes other Android Use sessions across aliases/transports sharing the same state directory. Request IDs are recorded before dispatch and are never replayed, including after unknown outcomes. The journal has a 1,000-entry limit and requires explicit operator retention maintenance. Configure persistent `stateDir` if reboot retention matters; OS temporary defaults are not a permanent archive.

After input, bounded probes detect stable foreground/geometry, then acquire a fresh observation. `settling: stable` means those probes stabilized; it does **not** mean rendering/network loading finished. Results distinguish:

| Evidence | Meaning |
| --- | --- |
| `dispatch` | Whether the command completed, was not sent, or has unknown outcome |
| `effect` | Observed hierarchy/foreground change, supported no-change evidence, or unverified effect |
| User task | Agent checks application-owned values and acknowledgement against the requested goal |

Partial capture, missing hierarchy or pixel changes without corresponding structural evidence cannot establish no change. A changed screenshot alone does not prove task success. Completed dispatch remains completed if later capture fails. Errors retain earlier emitted observations; do not interpret a REPL error as proof that no input occurred.

## Text and takeover

The selected dedicated IME must be operator-provisioned. It probes foreground editor package/generation, refuses passwords, and conditionally supports complete-text append/replacement/clear. See [IME provisioning](ime.md). A committed input still requires inspecting application state.

`pause()` rejects subsequent mutations and invalidates observations. `resume()` returns fresh state. It cannot pause an action already in flight: concurrent device calls are refused, so wait for that action's outcome before takeover. scrcpy can optionally provide an operator view but does not enforce ownership.

Transport loss invalidates the handle. Close and explicitly reopen after operator reconciliation; obtain fresh state before input. Timeout kills the owned worker process group and reconciles its leases. No shared ADB server is restarted and no uncertain mutation is replayed. Qualification coverage and outstanding cases are listed in [Qualification](qualification.md).
