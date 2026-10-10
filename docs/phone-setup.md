# Phone setup and permissions

Phone setup is separate from host/plugin installation. Reuse existing enrollment and components when possible. Installing a plugin does not itself install phone APKs, pair a device, change its keyboard or enable Accessibility.

## Required connection and control settings

1. Enable Developer options on the intended phone.
2. Choose USB debugging with host authorization, or Android 11+ Wireless debugging with operator pairing. See [connections](connections.md); pairing and connection ports differ.
3. Keep the phone awake and unlocked during operation. A successful wake command does not prove that the screen is ready for input.
4. If injected touch is refused, inspect the actual OEM error. On the tested Xiaomi/MIUI phone, **USB debugging (Security settings)** was required in addition to ordinary debugging, including when connected wirelessly. Other vendors may use different names or require no extra switch. Do not disable unrelated security protections.
5. If a companion APK installation prompts for approval or a vendor installation setting, explain the concrete prompt and let the operator authorize it. Requirements for account login or SIM availability vary by OEM.

Store device enrollment, endpoints, original keyboard state and persistent request-journal state outside the repository and plugin cache, normally under `~/Workspace/Machines`. Never retain pairing codes or private ADB keys in documentation. Preserve an explicitly managed ADB server socket; do not restart a shared server as routine setup.

## Companion components

| Component | Purpose | Required setup | Permissions and limitations |
| --- | --- | --- | --- |
| Android Use Unicode IME (`dev.androiduse.ime/.UnicodeIme`) | Chinese and other Unicode input | Build and approve installation, enable and select this input method | No network, storage or Accessibility permission. Requests require an authorized shell with `DUMP`. Refuses password editors. |
| Android Use Read-only UI | Faster on-demand UI hierarchy capture | Build and approve installation, manually enable the service in Accessibility settings | Reads window/keyboard structure; no network permission or gesture/action endpoint. Password text/descriptions are masked. UIAutomator remains the fallback. |

The IME is required for Android Use Unicode text operations, but not for observing or tapping. The read-only UI service is optional. Explain each component before installing it and obtain setup authorization; ordinary app tasks do not authorize provisioning. Phone-side prompts and Accessibility enablement remain operator actions.

Both APKs are currently source-built and development-signed for local qualification. They are not production-signed releases. Build prerequisites include an official Android SDK and compatible JDK; SDK licenses must be accepted by the operator. Actual device qualification covers one Android 11 phone, not every OEM/editor.

Follow [IME provisioning](ime.md) for build/install commands and [the accessibility guide](performance.md#read-only-accessibility-companion-opt-in) for optional capture setup. The disposable fixture APK is only for explicit development tests and is not required for normal installation.

## Restore or disable

Save the original input method before switching. Restore it when finished; `phone.close()` does not restore the keyboard. Disable the optional Accessibility service when no longer needed. See [IME restoration commands](ime.md#operator-provisioning). If removing a companion APK, select the normal keyboard or disable the service first.

## Verify readiness

Run `doctor`, then open only the explicitly enrolled phone through MCP and inspect a fresh screenshot and structure. Under the user's test authorization, verify a tap and Unicode input in a disposable, non-password field when those capabilities are needed. Do not treat a successful ADB command or IME acknowledgement as proof of the visible result. Keep debug logging off unless requested; save any requested evidence locally.
