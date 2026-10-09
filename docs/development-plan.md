# Development plan

Updated 2026-10-09. All implementation milestones below are pending. Documentation authoring is the only completed work; no phone has been connected or tested for this component.

| Milestone | Deliverables | Acceptance gate |
| --- | --- | --- |
| 0. Interface review | Agree interaction surface, lifecycle, feedback and action contracts | Explicit agreement on the model-visible interface before its implementation |
| 1. Independent scaffold | One TypeScript package, independent mise tools/tasks, lockfile, build/check/test, README and examples | Build and check inside this repository and from a fresh clone without Pot dependencies |
| 2. USB and wireless sessions | Shared connection contract, USB discovery, paired wireless endpoint binding, ADB diagnostics, cross-process device lease and disconnect handling | Zero/one/multiple/unauthorized/offline devices; no implicit switch or transport fallback; simultaneous USB/wireless attachment cannot bypass the lease |
| 3. Observations | PNG capture, hierarchy parsing, foreground/geometry, normalized revisions and partial results | Real fixture controls; malformed/oversized XML; rotation, keyboard and unavailable hierarchy/capture |
| 4. Actions | Launch, click, long press, swipe, text and Back/Home; automatic post-action observations | Fixture-owned state confirms expected effects; stale/ambiguous/out-of-bounds requests send no input |
| 5. Agent delivery | Agreed MCP interface, SDK and CLI using one core; cleanup and outcome recovery | Actual MCP client receives documentation, structured feedback and typed images; disconnect/reset/timeout do not replay mutations |
| 6. Qualification | End-to-end agent scenarios and dated host/device matrix | Open app, navigate, search, edit a test form, recover from transport disconnect and manual takeover using visible evidence |
| 7. Pot adapter | Host routing, device authority, package deployment and feedback translation | Pot permission and session tests; no device fallback into Sandbox; existing browser plugin behavior preserved |

## Validation strategy

Use Vitest for hierarchy parsing, coordinate transforms, revision admission, process outcome classification and lease/recovery rules. Inject an ADB process adapter for deterministic failures; mocks establish command and state contracts, not phone compatibility.

Use a source-controlled disposable Android fixture app for actual click, long-press, swipe, editable-text and navigation acceptance. Fixture setup is operator-driven and separate from agent tools. Real-device tests must declare the selected device and connection kind and may only mutate the fixture or explicitly selected disposable state. The test harness must observe app-owned state rather than merely repeat the implementation's assertions.

Record host OS, phone model, Android/API version, ADB version, component commit, transport and tested capability. Explicitly separate basic text, spaces/punctuation, Chinese/Unicode, IME, replacement and multiline outcomes. Omitted cells remain unqualified. Use a second connected device to prove routing stays fixed. Qualify wireless and USB separately, including wireless endpoint/port changes, pairing versus connection ports, lost Wi-Fi, revoked pairing, cable unplug/replug and simultaneous attachment through both transports. Wireless testing can proceed with the available phone; USB real-device cells remain pending until a data cable is available.

Device and paid-model tests are explicit tasks. Ordinary `test` does not discover and operate a phone or invoke a paid model. Independent mise configuration is local to this repository; no Pot task wrappers are planned.

## Later scope

Consider a Kotlin companion for semantic accessibility actions, events and robust text entry after measured limitations justify it. Revisit multi-touch, remote/WAN connectivity, browser DOM/CDP, multiple displays and broader host support separately. APK permissions, provisioning and update lifecycle must be designed before companion rollout.

Before publishing, verify dependency licenses, installation requirements, package exports, MCP examples and the detached-project build. No release or upstream compatibility claim is implied by these documents.
