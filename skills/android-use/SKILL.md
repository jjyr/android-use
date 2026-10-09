---
name: android-use
description: Operate an enrolled physical Android phone through android_repl, using fresh screenshots and UI structure to control apps and browsers and verify results.
---

Use the installed Android Use MCP server. If it is unavailable or enrollment is missing, read the sibling [setup skill](../android-use-setup/SKILL.md). The tool is `android_repl`; plugin hosts may namespace its name. Start with an empty call and read its runtime documentation. Open the explicitly configured device/connection; do not choose the first attached phone.

## Act on current state

Inspect the screenshot and compact structure before deciding input. Coordinates use the original PNG size, not a resized preview. Compact feedback retains original IDs/bounds; enabled defaults true, other omitted flags false, missing text empty. Full fields remain in `phone.observation`. Element IDs are valid only for that observation; choose enabled actionable nodes, using labelled parent descriptions when child labels are not clickable.

Each mutation needs `observationId: phone.observation.id` and a new request ID. Never reuse IDs to retry. Every action captures fresh state; the MCP reply contains the last observation/image per phone for the invocation. Distinguish dispatch success from the desired visible result. Stable foreground/geometry does not mean network loading is finished: observe again when content is still loading.

For a short, well-grounded sequence, inspect full `phone.observation` inside the code between actions. Stop on an error, unknown dispatch, absent/partial observation or failed semantic guard. Keep within the 30-second invocation deadline. Do not precompute IDs for later screens. For uncertain branches, return feedback and decide in the next invocation.

```js
var r = await phone.click({observationId:phone.observation.id,
  requestId:'task-step-unique',target:{elementId:confirmedId}});
if (r.error || r.dispatch !== 'completed' || !r.observation || r.observation.partial)
  throw new Error('Stop and reconcile the current state');
// Inspect phone.observation for the expected state before any next action.
```

On stale observation, refresh before deciding again. After connection invalidation, close/reopen explicitly; reconcile the observed result before another mutation. Do not replay uncertain input. `pause`/`resume` supports human takeover; `close` releases resources without undoing app actions.

## Text and evidence

Unicode input requires the installed/enabled/selected dedicated IME. Insert uses the current cursor; append/replace/clear require complete extracted text and can be refused. Password input is unsupported. Verify the displayed value. Never enable services, install APKs, pair a phone or accept device permission prompts as a side effect of an ordinary app task.

Use explicit local recording/debug settings only when requested. Diagnostics are off by default. Preserve full evidence locally if needed; do not put screenshots, device selectors, pairing codes or credentials in a repository. Exact token usage belongs to the model host; do not infer it from screenshot size or tool gaps.
