# Android Use plugin installation

Implemented package format: Codex `.codex-plugin/plugin.json`, repository marketplace `.agents/plugins/marketplace.json`, two skills and a stdio MCP declaration. The existing android_repl interface is unchanged. The CLI commands below were inspected on Codex CLI 0.160.0; use `codex plugin --help` to check your host. This is a Git-distributed plugin, not an official marketplace listing or a claim of an npm registry publication.

## Agent installation

For a private repository, the agent needs existing authorized GitHub read access. Use configured Git credentials; installation does not change repository visibility or grant repository access.

Register the repository and install its plugin:

```sh
codex plugin marketplace add https://github.com/jjyr/android-use.git --json
codex plugin add android-use@android-use-marketplace --json
```

Read the JSON result to locate the installed plugin root. In that directory, prepare its independent pinned toolchain and runtime when `dist/src/cli.js` is absent:

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise run build
```

The plugin starts MCP with `mise exec -- node scripts/plugin-start.mjs`, with the installed plugin root as cwd. Install mise and official ADB if needed under the user's setup authorization. Do not execute setup or download dependencies on every MCP call. Plugin startup never builds, pairs a device, installs an APK or enables phone permissions. A packaged runtime already containing dist does not require a source rebuild.

Configure an enrolled phone using [connections.md](connections.md) and [the example](../examples/config.example.json). Keep its configuration and persistent shared state outside both repositories and plugin caches, preferably under `~/Workspace/Machines`. Default config path:

```text
~/Workspace/Machines/android-use/config.json
```

To reuse another enrollment path, set the host environment ANDROID_USE_CONFIG to an absolute path, or create:

```text
~/Workspace/Machines/android-use/plugin-runtime.json
```

```json
{
  "configPath": "/absolute/path/to/existing/android-use.json",
  "ANDROID_USE_HIERARCHY": "accessibility"
}
```

Only configPath, ANDROID_USE_HIERARCHY and ADB_SERVER_SOCKET are read from this file; the latter two are optional. Preserve any separately managed ADB server socket. ADB_SERVER_SOCKET is connection context, not a plugin default. Debug is off unless ANDROID_USE_DEBUG=1 is explicitly provided by the host. Full evidence additionally requires ANDROID_USE_TRACE_CONTENT=1.

Run `mise exec -- node dist/src/cli.js doctor --config /absolute/path/config.json` from the installed root. Then reload/restart the Codex host if it has not discovered the plugin. An empty android_repl call should return runtime documentation/session ID; opening the explicitly enrolled device should return compact state and a PNG. Plugin discovery and an offline phone are separate checks.

For text input, manually provision the [dedicated IME](ime.md). For the faster hierarchy path, manually provision the optional [read-only accessibility companion](performance.md). The user confirms phone pairing, permission prompts and enablement. Save original keyboard state before changing it. Normal app tasks do not authorize device setup changes.

## Standalone MCP package

The npm package manifest includes the compiled CLI/SDK, plugin metadata, skills and original icon. Create a local package with the pinned toolchain:

```sh
mise exec -- pnpm pack --pack-destination /absolute/output/directory
```

The allowlist excludes test recordings, device notes, credentials, APKs, signing keys and node_modules. Package creation does not publish to a registry. Once an operator installs the produced package, its android-use CLI supports the existing mcp command with an absolute configuration path. Git plugin installation remains the documented Git distribution path until an npm release is separately published.

## Local qualification

For discovery tests, use a clean copy of publishable files and a one-invocation CLI configuration override for a local marketplace. Inspect plugin list output without editing the user's plugin registry. Avoid snapshotting the development checkout's ignored machine/test files into a plugin cache. An integration test also launches the startup wrapper against a simulated ADB executable, exercises session/open, and verifies default-off tracing and portable paths. No real phone is required for packaging tests.

## Icon

[assets/icon.svg](../assets/icon.svg) is an original geometric smartphone/pointer mark: an abstract green robot made from basic shapes inside a mint panel, a dark teal case and a pointer over a touch target. It uses no official Android mascot, wordmark, Google artwork or external font. SVG source and any raster derivatives are covered by the repository MIT license. Android is a trademark of Google LLC; this independent project is not affiliated with or endorsed by Google. Original construction avoids copying branded artwork; no legal clearance of every potentially similar mark is claimed.
