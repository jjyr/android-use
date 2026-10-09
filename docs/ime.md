# Dedicated Unicode IME

Implemented companion: `dev.androiduse.ime/.UnicodeIme`, an Android InputMethodService with minimum API 23 and target API 35. Actual runtime qualification currently covers Android 11/API 30 only. There is no network, storage or AccessibilityService permission. Broadcast senders require Android `DUMP` permission, available to an authorized ADB shell.

## Operator provisioning

Install an official Android SDK with platform `android-35` and build-tools `35.0.0`, accept its licenses yourself, and set `ANDROID_SDK_ROOT`. Set `JAVA_HOME` to a compatible installed JDK if required. No tool call downloads an SDK or accepts a license.

```sh
mise run build:ime
# Optional disposable fixture for explicit device tests:
mise exec -- node scripts/build-ime.mjs --fixture
```

The script compiles, aligns, development-signs and verifies each APK. Build outputs and signing keys are Git-ignored. Development signing is for local qualification, not a release/update trust policy. Install only on the explicitly selected device:

```sh
adb -s ENROLLED_SELECTOR shell settings get secure default_input_method
# Save that original value outside the repository before changing it.
adb -s ENROLLED_SELECTOR install -r android/ime/build/android-use-ime.apk
adb -s ENROLLED_SELECTOR shell ime enable dev.androiduse.ime/.UnicodeIme
adb -s ENROLLED_SELECTOR shell ime set dev.androiduse.ime/.UnicodeIme
```

OEMs may require installation confirmation and a separate debugging-security setting for injected touch. The operator must authorize those settings. The selected IME is global phone state: switch back to the saved original IME after testing. `phone.close()` deliberately does not change it.

```sh
adb -s ENROLLED_SELECTOR shell ime set ORIGINAL_IME_COMPONENT
adb -s ENROLLED_SELECTOR shell ime disable dev.androiduse.ime/.UnicodeIme
```

## Semantics and limits

`insert` commits at the current selection; `append` selects the end; `replace` and `clear` select the complete editor content. The latter three require complete extracted text. Input is strict Unicode, bounded to 8 KiB UTF-8. Package and editor-generation probes must match, password editors are refused, and request IDs are never replayed. The IME retains 1,000 IDs per service lifetime without eviction; the host journal separately refuses duplicate dispatches across sessions while its state directory is retained. A commit acknowledgement requires verification against visible application state.

A WebView can expose an IME editor without exposing its field through UIAutomator. A fresh foreground observation plus the IME probe establishes the editor; the agent must still inspect the screenshot and displayed value. This is not a guarantee of all-app compatibility.

## Explicit device smoke task

```sh
adb -s ENROLLED_SELECTOR install -r android/fixture/build/android-use-fixture.apk
ANDROID_USE_CONFIG=/absolute/path/android-use.json \
ANDROID_USE_DEVICE=test-phone \
ANDROID_USE_CONNECTION=wireless \
ANDROID_USE_ARTIFACTS=/absolute/path/ignored-evidence \
mise run test:device
```

The script opens the fixture and verifies native application-owned text hashes and interaction state. Keep the phone unlocked. Restore the original IME and remove the disposable fixture when finished. Device tests are never part of ordinary `mise run test`.
