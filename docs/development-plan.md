# Development plan

Updated 2026-10-09. The concrete MCP contract was explicitly approved and the independent SDK, CLI, persistent MCP worker and dedicated IME are implemented. Automated checks and one wireless device have been exercised, including an actual MCP mobile-browser round-trip query. Qualification remains partial: USB, broader OEM/OS support, cross-platform fare coverage and several failure scenarios remain open. One-platform 30-pair flexible-month coverage and its minimum were verified. See [Qualification](qualification.md).

| Milestone | Deliverables | Acceptance gate |
| --- | --- | --- |
| 0. Interface review (complete) | Record approved MVP scope and REPL direction; finalize lifecycle, feedback and action schemas | Explicit agreement on concrete model-visible names, arguments and behavior before their implementation |
| 1. Independent scaffold (implemented) | One TypeScript package, independent mise tools/tasks, lockfile, build/check/test, README and examples | Build and check inside this repository and from a fresh clone without Pot dependencies |
| 2. USB and wireless sessions (implemented; USB unqualified) | Shared connection contract, USB discovery, paired wireless endpoint binding, ADB diagnostics, cross-process device lease and disconnect handling | Zero/one/multiple/unauthorized/offline devices; no implicit switch or transport fallback; simultaneous USB/wireless attachment cannot bypass the lease |
| 3. Observations (implemented) | PNG capture, hierarchy parsing, foreground/geometry, normalized revisions and partial results | Real fixture controls; malformed/oversized XML; rotation, keyboard and unavailable hierarchy/capture |
| 4. Actions (implemented) | App discovery/launch/switch/explicit stop; click, long press, swipe/drag; dedicated IME Unicode input; Back/Home/Recents; automatic post-action observations | Fixture-owned state confirms expected effects; stale/ambiguous/out-of-bounds requests send no input |
| 5. Agent delivery (implemented) | Agreed MCP interface, SDK and CLI using one core; cleanup and outcome recovery | Actual MCP client receives documentation, structured feedback and typed images; disconnect/reset/timeout do not replay mutations |
| 6. Qualification (partial) | End-to-end agent scenarios and dated host/device matrix | Open app, navigate, search, edit a test form, recover from transport disconnect and manual takeover using visible evidence |
| 7. Pot adapter (proposed) | Host routing, device authority, package deployment and feedback translation | Pot permission and session tests; no device fallback into Sandbox; existing browser plugin behavior preserved |

## Browser-first MVP delivery

The first useful vertical slice must operate the installed Android browser through its visible UI and complete a configurable round-trip flight search with a flexible departure month and fixed trip duration. Exact user itinerary and live search evidence remain in ignored local notes. Build generic phone primitives rather than a flight-site-specific tool or scraper.

Deliver in this order: independent scaffold and exact device binding; consistent screenshot/hierarchy observations; app navigation and touch actions; dedicated IME input; persistent MCP interaction and recovery; browser end-to-end acceptance. Retain USB in MVP scope while marking it unverified until a real cable test. The broader approved MVP includes installed-app control and manual takeover; the first browser slice is not the entire MVP.

Feedback acceptance must verify:

- The agent receives usable typed image content and structured hierarchy, foreground, geometry, observation revision and capability/partial-result metadata through the actual MCP client.
- Each completed action automatically returns a new observation; the next decision uses that feedback rather than unobserved command batches.
- Missing web controls remain actionable through freshly inspected screenshot coordinates in mixed mode; empty, clipped or stale tree geometry is rejected.
- Keyboard overlays, scrolling, date-picker transitions, loading, black capture and rotation inconsistency are reported and handled before positional input.
- Browser pages provide evidence of selected route, dates, passenger/cabin settings, loaded results and relevant total price; exit status or screenshot changes alone do not verify the user task.
- Lowest-fare claims identify platform, observation time, departure dates/date pairs examined, fare inclusions and coverage gaps. A displayed calendar minimum is rechecked against actual round-trip results. Unavailable dates or incomplete search coverage are explicit.
- A real-client search ends at verified results. Booking and payment are separate tasks, not acceptance prerequisites.

Keep production companion setup separate from model-visible actions. The dedicated IME is part of MVP, with operator provisioning, version/permission diagnostics, editor-target checks, strict payload validation and conditional replacement support. Prototype tests do not establish durable deduplication, modern Android compatibility or all-app input support.

## Validation strategy

Use Vitest for hierarchy parsing, coordinate transforms, revision admission, process outcome classification and lease/recovery rules. Inject an ADB process adapter for deterministic failures; mocks establish command and state contracts, not phone compatibility.

Use a source-controlled disposable Android fixture app for actual click, long-press, swipe, editable-text and navigation acceptance. Fixture setup is operator-driven and separate from agent tools. Real-device tests must declare the selected device and connection kind and may only mutate the fixture or explicitly selected disposable state. The test harness must observe app-owned state rather than merely repeat the implementation's assertions.

Record host OS, phone model, Android/API version, ADB version, component commit, transport and tested capability. Explicitly separate basic text, spaces/punctuation, Chinese/Unicode, IME, replacement and multiline outcomes. Omitted cells remain unqualified. Use a second connected device to prove routing stays fixed. Qualify wireless and USB separately, including wireless endpoint/port changes, pairing versus connection ports, lost Wi-Fi, revoked pairing, cable unplug/replug and simultaneous attachment through both transports. Wireless testing can proceed with the available phone; USB real-device cells remain pending until a data cable is available.

Device and paid-model tests are explicit tasks. Ordinary `test` does not discover and operate a phone or invoke a paid model. Independent mise configuration is local to this repository; no Pot task wrappers are planned.

## Later scope

Consider an AccessibilityService companion for semantic actions and page-change events after measured limitations justify it. Dedicated IME text entry is already in MVP scope. Revisit multi-touch, remote/WAN connectivity, browser DOM/CDP, multiple displays and broader host support separately. APK permissions, provisioning and update lifecycle must be designed before companion rollout.

Before publishing, verify dependency licenses, installation requirements, package exports, MCP examples and the detached-project build. No release or upstream compatibility claim is implied by these documents.

## Current remaining work

- Extend the verified single-platform flexible-month acceptance to additional sites and fare/cabin policies when requested. Keep exact date-pair coverage and rechecked totals; do not claim a global minimum from one platform.
- Qualify real USB, a second phone, modern Android, secure/locked screens, physical rotation and real lost/revoked wireless connections. Automated simulations do not replace these cells.
- Improve render/hierarchy consistency if measured WebView gaps justify a new backend; retain explicit limitations until then. Any model-visible contract change requires agreement.
- Qualify release signing/update lifecycle and package distribution before publishing; this repository is currently private development packaging.
