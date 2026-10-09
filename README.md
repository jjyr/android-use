# Android Use

Android Use is a planned standalone TypeScript component for agents to operate a physical Android phone connected to the local machine over USB or Android wireless debugging. It is developed in an independent repository and must remain usable without Pot.

**Status: documentation proposal, 2026-10-09.** No SDK, CLI, MCP server, device adapter or tool registration is implemented. Proposed model-visible interfaces require explicit agreement before implementation under the repository [AGENTS.md](AGENTS.md).

## Documentation

| Goal | Read |
| --- | --- |
| Understand scope, dependencies and device ownership | [Architecture](docs/architecture.md) |
| Set up USB or wireless ADB and review transport abstraction | [Connections](docs/connections.md) |
| Review the proposed agent interaction and feedback contract | [Interaction design](docs/interaction.md) |
| Review implementation milestones and acceptance gates | [Development plan](docs/development-plan.md) |
| Compare Pot computer-use, Codex CUA and upstream Cua | [Reference findings](docs/references.md) |

## Intended delivery

One npm package exposes a TypeScript SDK, an operator CLI and an MCP server over stdio. They share a device-control core. A later Pot plugin adapter calls the same core; Android Use does not depend on Pot crates, storage or task types.

```text
android-use/
  mise.toml                 # Independent tools and tasks; not created yet
  package.json
  tsconfig.json
  src/
    core/                   # Sessions, observations, actions and outcomes
    connection/             # USB/wireless discovery, binding and lifecycle
    adb/                    # Android command adapters over a bound connection
    mcp/                    # Agent integration
    cli/                    # Operator diagnostics
  tests/
  docs/
  examples/
  README.md
```

The first implementation supports both USB and wireless ADB on macOS. The available phone will be qualified over wireless first; USB remains in first-version scope but cannot be called verified until a data cable and phone are available for testing. Linux and Windows remain unqualified until equivalent tests pass. Wireless setup without a cable targets Android 11+ wireless debugging; USB minimum API level and OEM coverage are determined by qualification.

## Development tooling

Android Use will declare its own `mise.toml` with pinned Node and pnpm versions and local `build`, `check`, `test` and `test:device` tasks. Run tasks from `android-use/`; root mise task wrappers are not required. Select exact tool versions and commit the package lockfile during the scaffold milestone.

Tasks use this repository's working directory and must not depend on Pot tasks, Rust tools or environment variables. Verify the effective mise configuration and test a fresh clone before claiming reproducible setup.

ADB comes from official Android platform-tools, with its configured path and version reported by diagnostics. Do not download SDKs, accept Android licenses, install an APK, or enable debugging as an implicit side effect of an agent call. External ADB setup commands are documented in [Connections](docs/connections.md); component commands will be added when the scaffold exists.
