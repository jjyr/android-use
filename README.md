# Android Use

<img src="assets/icon.svg" alt="Android Use — original phone, robot and pointer icon" width="96" height="96">

Android Use is a standalone TypeScript SDK, operator CLI and stdio MCP server for controlling an enrolled physical Android phone through official ADB. It has no Pot dependency.

**Status: MVP implemented, qualification in progress (2026-10-09).** Automated protocol/core checks and real wireless device tests have passed on macOS with one Android 11 phone. The actual MCP path has completed a mobile-browser round-trip flight search using Chinese input, screenshot-based navigation and date selection. A single-platform flexible-month search covered all 30 departure/return pairs and rechecked its minimum. USB, additional OEMs, other host operating systems and cross-platform fare comparison remain unqualified. Local device details and screenshots are excluded from Git.

## Installation

### Phone Setup and Permissions

| Requirement | When needed | Phone-side action |
| --- | --- | --- |
| Developer options and debugging authorization | Required | Enable USB or Wireless debugging and authorize/pair the host. |
| OEM debugging security / installation settings | On some phones | Authorize injected touch and companion APK installation; on tested Xiaomi/MIUI, touch required **USB debugging (Security settings)**. |
| Android Use Unicode IME | Required for Unicode text input, including Chinese | Approve installation, enable it and select it as the keyboard; save the original keyboard for restoration. |
| Android Use Read-only UI | Optional, for faster UI capture | Approve installation and manually enable its Accessibility service. |

Your agent can prepare the host and guide setup. Phone authorization and companion installation are explicit setup steps. See [phone setup and permissions](docs/phone-setup.md) for component purposes, permissions and restoration.

### Codex — Recommended Plugin

```text
Install Android Use as a Codex plugin by following:
https://github.com/jjyr/android-use/blob/main/docs/plugin.md
Reuse my existing phone setup and keep debug logging off.
```

The plugin bundles MCP, operation/setup skills and the icon. [Detailed guide](docs/plugin.md).

### Claude Code — MCP + Skills

```text
Install Android Use MCP and skills for Claude Code by following:
https://github.com/jjyr/android-use/blob/main/docs/installation.md#claude-code
Reuse my existing phone setup and keep debug logging off.
```

### Other Agents — MCP + Skills

```text
Install Android Use MCP and skills for this agent by following:
https://github.com/jjyr/android-use/blob/main/docs/installation.md#other-agents
Reuse my existing phone setup and keep debug logging off.
```

Git installation requires authorized read access if the repository is private. No official marketplace or npm registry listing is claimed.

## Quick Start

After [installation verification](docs/installation.md#verification), ask your agent to observe your enrolled phone and verify a simple authorized operation.

An MCP client should start the built CLI with its absolute path and configuration. See [the MCP configuration example](examples/mcp.json). `android_repl` executes authorized host Node code; it is not a sandbox. Its first call without arguments returns documentation and a session ID. Subsequent calls send `session_id` and `code`:

```javascript
let phone = await android.open({ deviceId: 'test-phone', connection: 'wireless' });
// Inspect the automatically returned JSON and PNG before deciding the next action.
await phone.launchApp({
  observationId: phone.observation.id,
  requestId: 'launch-example-unique',
  packageName: 'com.example.app'
});
```

Every mutation needs the latest observation ID and a new request ID. Actions capture fresh observations; MCP emits the final state per phone per invocation. Screenshot coordinates use the original PNG pixels; account for any client-side resizing. Stale, partial, paused and unavailable sessions refuse input. After disconnect, explicitly close/reopen and inspect fresh state; never replay an uncertain mutation. Closing does not undo phone actions or change the keyboard.

## Capabilities and Limits

The SDK and MCP support app inventory/launch/stop, browser URL opening, click/long press/swipe/drag, Back/Home/Recents, Unicode insertion/append/replacement/clear, and manual pause/resume. The CLI supplies diagnostics, observation, stale-lease reconciliation and MCP startup. It does not expose direct action subcommands.

Unicode input requires the dedicated IME. Password fields are refused; append/replacement/clear require complete extracted text. See [input semantics](docs/ime.md).

## Architecture

```text
Agent                 Operator / application
  |                            |
android_repl (MCP)          CLI / SDK
  |                            |
Persistent Node worker         |
  +------------+---------------+
               |
        Device-control core
        leases + request journal
        observe -> act -> observe
               |
        Exact ADB transport ID
               |
         USB or wireless
               |
       Enrolled Android phone
       + UIAutomator + screenshots
       + dedicated Unicode IME
```

## Performance and optional diagnostics

MCP feedback returns one compact final observation/image per phone per invocation. Full observations remain accessible as `phone.observation`; deterministic, guarded operations can share one code invocation while each still captures fresh state. See the approved [contract](docs/mcp-contract.md).

Diagnostic traces are disabled by default. Enable `ANDROID_USE_DEBUG=1` for detailed timings; additionally set `ANDROID_USE_TRACE_CONTENT=1` to retain full input/output/screenshots locally. Request replay-prevention journals and leases remain active in normal mode.

Independent device probes run concurrently without caching lock, foreground, orientation or display size. An optional manually provisioned read-only AccessibilityService can replace UIAutomator hierarchy capture with `ANDROID_USE_HIERARCHY=accessibility`; unavailable service falls back to UIAutomator. See [performance options and qualification](docs/performance.md). Neither provider promises atomic screenshot/tree capture.

## Development

Build and check this checkout with its independent pinned toolchain (Node 24.11.0 and pnpm 10.18.3):

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise run build
mise run check
mise run test
```

Automated tests do not operate a real phone or invoke a paid model. Explicit device smoke tests require the disposable fixture and a local artifact destination; see [IME provisioning](docs/ime.md). See [qualification](docs/qualification.md) for verified behavior and pending coverage.

## Documentation

| Topic | Document |
| --- | --- |
| Agent installation | [Installation](docs/installation.md) |
| Permissions and phone companions | [Phone setup](docs/phone-setup.md) |
| Codex plugin installation | [Plugin](docs/plugin.md) |
| Components, ownership and integration | [Architecture](docs/architecture.md) |
| Enrollment, USB and wireless setup | [Connections](docs/connections.md) |
| Approved tool names, arguments and behavior | [MCP contract](docs/mcp-contract.md) |
| Observation and verification discipline | [Interaction](docs/interaction.md) |
| IME build, install and restoration | [IME provisioning](docs/ime.md) |
| Verified behavior and known limits | [Qualification](docs/qualification.md) |
| Remaining milestones | [Development plan](docs/development-plan.md) |
| Local call/stage timing and provider token correlation | [Telemetry](docs/telemetry.md) |
| Design references | [Reference findings](docs/references.md) |

Changes to the model-visible interface still require explicit agreement under [AGENTS.md](AGENTS.md). Pot integration, AccessibilityService semantic actions, DOM/CDP, multi-touch and automated provisioning are later work.
