# Android Use

<img src="assets/icon.svg" alt="Android Use — original phone and pointer icon" width="96" height="96">

Android Use is a standalone TypeScript SDK, operator CLI and stdio MCP server for controlling an enrolled physical Android phone through official ADB. It has no Pot dependency.

**Status: MVP implemented, qualification in progress (2026-10-09).** Automated protocol/core checks and real wireless device tests have passed on macOS with one Android 11 phone. The actual MCP path has completed a mobile-browser round-trip flight search using Chinese input, screenshot-based navigation and date selection. A single-platform flexible-month search covered all 30 departure/return pairs and rechecked its minimum. USB, additional OEMs, other host operating systems and cross-platform fare comparison remain unqualified. Local device details and screenshots are excluded from Git.

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

The SDK and MCP support app inventory/launch/stop, browser URL opening, click/long press/swipe/drag, Back/Home/Recents, Unicode insertion/append/replacement/clear, and manual pause/resume. The CLI supplies diagnostics, observation, stale-lease reconciliation and MCP startup. It does not expose direct action subcommands.

## Install the plugin with your agent

Copy this short paragraph to your agent:

> Install the Android Use plugin from https://github.com/jjyr/android-use. Use my existing GitHub access if the repository is private. Read docs/plugin.md, register its Codex marketplace, install android-use@android-use-marketplace, and prepare the installed MCP runtime with the repository’s pinned mise tools. Reuse or configure my enrolled phone under ~/Workspace/Machines, keep debug logging off, and verify plugin discovery plus a fresh phone observation. Ask me only for necessary phone-side pairing or permission actions.

The plugin bundles MCP, operation/setup skills and an original icon. See [the installation guide](docs/plugin.md). It is distributed from Git; private repositories require authorized GitHub read access. No official marketplace or npm registry listing is claimed.

## Setup

Install official Android platform-tools and pair/authorize the phone as described in [Connections](docs/connections.md). Tool calls never install APKs, accept licenses, pair devices or change the selected keyboard.

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise run build
mise run check
mise run test
```

This repository pins Node 24.11.0 and pnpm 10.18.3. Tests do not operate a real phone or invoke a paid model. Copy [the enrollment example](examples/config.example.json) to your machine inventory directory, fill in explicit identity and transport settings, and keep it outside the repository. Set `stateDir` to a persistent private directory for journal retention across host restarts; the default is an OS temporary directory. Do not delete request history to retry an uncertain action.

```sh
mise exec -- node dist/src/cli.js doctor --config /absolute/path/android-use.json
mise exec -- node dist/src/cli.js observe --config /absolute/path/android-use.json \
  --device test-phone --connection wireless --out /absolute/path/evidence
mise exec -- node dist/src/cli.js mcp --config /absolute/path/android-use.json
```

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

## Text input and real-device qualification

Unicode input requires the source-built dedicated IME to be installed, enabled and selected by the operator. See [IME provisioning](docs/ime.md). Password fields are refused. Replacement/append require an editor that exposes complete extracted text; the component refuses unsupported editors rather than using ADB text fallback.

[Qualification](docs/qualification.md) distinguishes automated checks, actual device evidence and pending coverage. Real-device smoke tests require explicit configuration, selected device/transport and artifact destination. They operate only the disposable fixture, which must be provisioned first.

## Performance and optional diagnostics

MCP feedback returns one compact final observation/image per phone per invocation. Full observations remain accessible as `phone.observation`; deterministic, guarded operations can share one code invocation while each still captures fresh state. See the approved [contract](docs/mcp-contract.md).

Diagnostic traces are disabled by default. Enable `ANDROID_USE_DEBUG=1` for detailed timings; additionally set `ANDROID_USE_TRACE_CONTENT=1` to retain full input/output/screenshots locally. Request replay-prevention journals and leases remain active in normal mode.

Independent device probes run concurrently without caching lock, foreground, orientation or display size. An optional manually provisioned read-only AccessibilityService can replace UIAutomator hierarchy capture with `ANDROID_USE_HIERARCHY=accessibility`; unavailable service falls back to UIAutomator. See [performance options and qualification](docs/performance.md). Neither provider promises atomic screenshot/tree capture.

## Documentation

| Topic | Document |
| --- | --- |
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
