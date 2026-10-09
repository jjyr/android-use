# Reference findings

Reviewed 2026-10-09. These references inform the proposed interaction; they do not establish Android Use implementation or physical-device acceptance.

## Distinct reference systems

| Reference | Established behavior | What Android Use should borrow |
| --- | --- | --- |
| [Pot computer-use](https://github.com/jjyr/pot/blob/2c4ca8a16abdc2192f6da6ea7670a0460e5f46af/docs/computer-use.md) and [implementation](https://github.com/jjyr/pot/blob/2c4ca8a16abdc2192f6da6ea7670a0460e5f46af/plugins/computer-use/index.mjs) | Persistent Node REPL, target handles, fresh observations after browser actions, sequence checks, text/mixed modes and cleanup | Persistent interaction, explicit revision admission, automatic observation and bounded typed output |
| Codex `mcp__cua_repl` runtime documentation inspected in this conversation | `cua.getApp/getTab`, target-bound tree/screenshot reads and clicks/typing/scrolling; fresh state before choosing subsequent actions | Reusable target handles, tree/pixel choice and observation-driven decisions |
| Upstream Cua Driver | Exact desktop/window targeting, tree and screenshot observations, semantic/pixel action ladder, structured refusals and app-owned verification | Precise targets, honest delivery/effect distinctions, verification and common core below transports |
| Upstream Cua Sandbox Android | Emulator lifecycle plus generic serial-based ADB transport and mobile input primitives | Android transport mechanics and touch coordinates, without inheriting emulator/root assumptions |

The Codex runtime source was not inspected and no public Android backend was established by its session documentation. Codex CUA and trycua/Cua are not assumed to share an implementation. Pot's browser API is also explicitly incompatible with Codex CUA.

## Pinned upstream sources

The upstream repository was inspected at commit `5a364bbe60e1f8a901ceacd889606b6367dc96ab`:

- [Cua Driver interaction and verification](https://github.com/trycua/cua/blob/5a364bbe60e1f8a901ceacd889606b6367dc96ab/docs/content/docs/cua-driver/concepts/how-cua-driver-works.mdx).
- [Cua Driver platform support](https://github.com/trycua/cua/blob/5a364bbe60e1f8a901ceacd889606b6367dc96ab/docs/content/docs/cua-driver/concepts/platform-support.mdx): macOS, Windows and Linux; no listed native Android driver.
- [Sandbox runtime support](https://github.com/trycua/cua/blob/5a364bbe60e1f8a901ceacd889606b6367dc96ab/docs/content/docs/cua-sdk/reference/runtime-support.mdx): Android is a legacy emulator adapter, not an established physical-phone product flow.
- [ADBTransport](https://github.com/trycua/cua/blob/5a364bbe60e1f8a901ceacd889606b6367dc96ab/libs/python/cua-sandbox/cua_sandbox/transport/adb.py): caller-supplied serial, `adb -s`, screenshot and screen-size primitives. This makes basic physical-device reuse plausible, not qualified.
- [Mobile](https://github.com/trycua/cua/blob/5a364bbe60e1f8a901ceacd889606b6367dc96ab/libs/python/cua-sandbox/cua_sandbox/interfaces/mobile.py): single-touch input via Android shell; multi-touch relies on root/sendevent. Do not copy that assumption into unrooted-phone support.

## Android mechanisms

Use official sources when implementing and qualifying the adapter:

- [ADB device selection and USB authorization](https://developer.android.com/tools/adb).
- [UI Automator](https://developer.android.com/training/testing/other-components/ui-automator).
- [AccessibilityService](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService), a later companion option.
- [scrcpy](https://github.com/Genymobile/scrcpy), optional viewing and operator control.

ADB command completion, UIAutomator discovery and rendered pixels are separate evidence sources. UI dump discovery alone does not provide semantic action execution, atomic observations or background input. Verify host-version, Android-version and OEM behavior on a real device before claiming support.
