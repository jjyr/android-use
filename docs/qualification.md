# Qualification status

Updated 2026-10-09. Implemented behavior and actual evidence are distinct. Local raw evidence is kept under Git-ignored `docs/notes/`; enrolled device/network details belong in the machine inventory, not this repository.

## Verified

| Layer | Evidence |
| --- | --- |
| Independent setup | Frozen-lockfile dependency installation, build, type check and tests passed in an isolated source copy with no shared node_modules or Pot checkout/toolchain |
| Automated core | 23 tests: XML/Unicode/bounds, PNG limits, metadata, edge-point/element and stale/locked/changed-foreground admission, emitted observations, deduplication, alias leases, disconnect/modern transport-ID error, pause/concurrency, post-input capture failure, unsupported IME, process limits and recovery |
| Actual MCP protocol with simulated device | Tool discovery, persistent top-level await/reset; normalized JSON plus typed PNG, stale async error then continued evaluation, actual 30-second worker timeout and owned lease cleanup |
| Native physical device | 20 checks on one unlocked Android 11/API 30 phone over wireless: launch/inventory, focus, Unicode replace/append/clear, multiline/insert, long press native callback, swipe/drag displacement and duration, scroll offset, pause/resume, Recents/Back, stale refusal, explicit stop and Home |
| Actual MCP with physical device | Browser launch/URL opening, fresh typed images and state after actions, screenshot-based controls missing from hierarchy, Chinese WebView editor input, airport/date selection, 30 dated round-trip result pages in ascending price order, a reopened minimum and vendor total confirmation |
| Real transport recovery | Duplicate wireless aliases cannot bypass the lease; explicit selected-route disconnection invalidates the handle; explicit reconnect/open obtains a new generation and usable observation |
| Companion build | Source-built IME and fixture APKs aligned, development-signed and signature-verified with official platform/build-tools 35 |

Native checks use application-owned SHA-256 text labels and gesture/scroll state, not only ADB exit codes. The 25 automated tests use simulated device failures where appropriate and never discover a real phone. Isolated-copy reproduction establishes the package toolchain, not Android SDK installation portability or published package readiness.

## Known limitations

- Browser price search is platform-dependent. Website blocking, app-only entry points, empty results and incomplete date coverage must be reported. A single date pair cannot establish a monthly/global minimum. All 30 selected departure/return combinations were covered on one platform; the displayed minimum was re-opened and its adult tax-inclusive vendor total confirmed. Detailed itinerary coverage remains in local evidence.
- Sequential screenshot/hierarchy capture can disagree during rendering. WebView hierarchy can omit overlays, retain old nodes or be empty. Foreground/geometry stability does not prove page loading finished. Agents inspect pixels and refresh before relying on inconsistent feedback.
- Lock/keyguard detection uses recognized Android dumpsys fields. Unknown state is partial and refuses mutations. Physical lock/wake/secure capture and OEM differences still need expanded qualification.
- Text depends on an installed, enabled, selected dedicated IME and compatible editor extraction. Passwords are refused; unsupported complete-text operations are refused. Modern Android runtime and additional apps remain unqualified.
- ADB touch is positional. Drag is one bounded single-finger gesture; no multi-touch or AccessibilityService semantic action is provided.
- Ownership only excludes Android Use controllers sharing the state directory, not other ADB clients or human input. Serial/model enrollment checks are not cryptographic authentication. The state directory must remain shared and private.
- Durable no-replay history lasts while its directory is retained. Configure persistent `stateDir` for reboot retention; the default OS temporary directory can be cleaned externally. Journals/IME caches cap at 1,000 IDs without automatic eviction.
- REPL host execution is unsandboxed. Timeout terminates owned processes but cannot undo dispatched phone input. CLI abrupt termination may leave a dead lease needing explicit reconciliation.

## Pending qualification

Real USB cable behavior, second physical phone routing, Android 12+ runtime/other OEMs, Linux/Windows hosts, actual Wi-Fi loss/revoked trust/reboot, protected screens, physical rotation with the implemented core, long-duration sessions, permission-dialog matrix and cross-platform fare coverage remain separate acceptance work. Historical direct-ADB prototype checks do not qualify the implemented core for those cases.

Pot adapter, AccessibilityService, DOM/CDP, multi-touch, automated setup and release distribution are proposed later scope, not implemented features.

After acceptance, the original keyboard was restored, the dedicated IME was disabled and the fixture was uninstalled. The source-built IME APK remains installed for explicit development use. The test MCP/HTTP bridge was stopped and no reverse ports remain. The separately owned diagnostic ADB server remains available for development; connection settings are recorded in the machine inventory. The shared ADB server was not restarted.
