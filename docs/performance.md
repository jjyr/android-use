# Performance options

Implemented 2026-10-09, following user approval of compact feedback, guarded invocation sequences, faster hierarchy acquisition and explicit debug collection. Tool names, code/session_id/reset arguments and SDK phone methods are unchanged.

## Compact final feedback

Each operation still captures a full fresh observation and performs normal validation/journaling. MCP emits only the final observation per phone in an invocation, plus its PNG. The compact structure preserves meaningful labels, original element IDs/bounds and actionability; blank noninteractive containers and default/empty attributes are omitted. SDK observations are unchanged. Debug content mode retains intermediate operation evidence. On an error, the latest successfully captured state is still returned. The 30-second invocation deadline is unchanged, so keep sequences short and stop on uncertain or unsuccessful results. See mcp-contract.md for the guarded pattern.

This reduces returned bytes and repeated model round trips. It does not measure model inference speed or guarantee token savings proportional to bytes.

## Read-only accessibility companion (opt-in)

Build with the independently configured Android SDK:

```sh
mise run build:accessibility
adb -s ENROLLED_SELECTOR install -r android/accessibility/build/android-use-accessibility.apk
```

Manually enable **Android Use Read-only UI** in system Accessibility settings. Host tools never install, enable or grant this permission automatically. The service reads the active window and keyboard on request, masks password text/descriptions, applies 5,000-node/64-depth/2-MiB limits, and exposes no gesture/action endpoint. It has no network permission and records no accessibility events. An authorized shell must hold `DUMP` to send the capture broadcast. A unique request file in private app storage is read/deleted via `run-as`; the APK is debuggable for local development, not production distribution. There is no release signing or production deployment policy yet.

Set `ANDROID_USE_HIERARCHY=accessibility` in the host environment. A failed or disabled companion falls back to UIAutomator if the transport remains valid. Diagnostic spans retain the attempted provider and error. No input is retried, and unavailable/unstable captures keep existing safety behavior. Screenshots remain the visual channel. App/OEM nodes can differ from UIAutomator; broader compatibility is unqualified. Disable the service in Accessibility settings after testing when it is no longer needed.

## Probe concurrency

Window, input, power and display-size queries run concurrently. All four are still performed for each probe. Display dimensions are deliberately not cached because overrides and rotation can change. Compatible before/after snapshots and action preflight retain their checks; parallel queries are not an atomic device snapshot.

## Explicit real-device benchmark

Provision the disposable fixture and enable the read-only service first:

```sh
ANDROID_USE_CONFIG=/absolute/machine-local/config.json \
ANDROID_USE_DEVICE=test-phone ANDROID_USE_CONNECTION=wireless \
ANDROID_USE_ARTIFACTS=/absolute/ignored/benchmark \
ANDROID_USE_DEBUG=1 ANDROID_USE_TRACE_CONTENT=1 \
mise exec -- pnpm exec tsx scripts/benchmark-device.ts
```

By default this operates the fixture; `ANDROID_USE_BENCHMARK_APP=package.name` explicitly selects another installed app. `ANDROID_USE_BENCHMARK_KEEP_STATE=1` benchmarks its current foreground page without relaunching (refuses a mismatched foreground). It alternates five observations per provider, refuses to benchmark silent fallback, compares visible-label bounds/actionability, and checks serial/parallel probe state equivalence. Results are device-specific; native fixture coverage alone does not qualify arbitrary apps.

## Recording monitor

Recording is a separate explicit operator task, independent of debug logging:

```sh
ANDROID_USE_CONFIG=/absolute/machine-local/config.json \
ANDROID_USE_DEVICE=test-phone ANDROID_USE_CONNECTION=wireless \
ANDROID_USE_RECORD_DIR=/absolute/ignored/video \
mise exec -- pnpm exec tsx scripts/record-device.ts
```

Requires installed scrcpy. It starts without control/audio/window, detects exit, verifies the enrolled device again, and records a new uniquely named segment after reconnection. `recording.jsonl` records segment boundaries/start failures. Ctrl-C stops recording; partial segments and gaps are preserved rather than presented as uninterrupted video. It never restarts ADB, pairs a device or replays input. Startup failure from a missing executable terminates; unavailable device retries once per second until stopped. Real connection-drop recovery requires additional qualification.

## Host model usage

Actual provider request correlation remains host-owned. Existing `_meta` fields and normalized usage import support exact links when the host supplies provider/model and tool IDs. The current Codex environment does not expose these IDs to live Android-use calls automatically. Do not claim per-click tokens or generation latency from tool gaps or response byte counts.

## Real-device results (2026-10-09)

Five alternating samples per provider on Ctrip: homepage observation mean 3.655s→1.833s (49.9% lower); flight-form mean 3.358s→1.391s (58.6% lower). Flight-form full feedback ~64.2 KB→14.6 KB compact with UIAutomator (77.2% lower); accessibility compact ~11.4 KB. Probe mean 334ms→103ms on the form. All 43 baseline text-label signatures were retained; 32/33 named actionable signatures matched exact bounds/flags, with one differently clipped bottom-edge container. Homepage nodes also differ because labelled clickable parents replace duplicate child labels and dynamic suggestions rotate. Faster capture is opt-in, not a claim of universal equivalent coverage.

A real guarded Home→launch Ctrip invocation completed both dispatched actions with distinct new observations and returned one final image. A subsequent semantic flight-entry click succeeded. Default-off diagnostic tracing was verified through the real MCP path with no trace directory creation. Two short real recording segments verified restart after deliberate recorder exit; a Wi-Fi drop was not induced. These are operation/feedback benchmarks, not an end-to-end flight search or measured model token/inference benchmark. See qualification.md.
