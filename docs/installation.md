# Agent installation

Implemented distribution: Git checkout, stdio MCP and operation/setup skills. Codex plugin installation and its real-phone MCP path have been verified. Claude Code command syntax was checked against the installed CLI, but full Claude Code and other-client operation remain unqualified. Clients must support MCP image feedback and sufficiently large tool responses.

## Shared preparation

1. Read [phone setup and permissions](phone-setup.md). Reuse authorized ADB, enrollment and any existing companions; explain missing phone setup before changing it.
2. Clone `https://github.com/jjyr/android-use.git` into a persistent local directory using existing authorized GitHub credentials. SSH is also supported. A private repository requires read access; do not change repository visibility.
3. Read the checkout's README and relevant guides. Prepare its pinned toolchain:

   ```sh
   mise install
   mise exec -- pnpm install --frozen-lockfile
   mise run build
   mise which node
   ```

4. Keep an explicit enrollment configuration outside the checkout, normally under `~/Workspace/Machines`. Use [the example](../examples/config.example.json), a persistent shared `stateDir` and the exact intended phone identity/transport. Preserve any existing `ADB_SERVER_SOCKET`.

Use absolute paths to the pinned Node executable, built CLI and enrollment file. Keep the checkout and runtime dependencies available after registration. Debug logging is off by default; do not enable debug or trace-content flags during installation.

## Codex

Use the recommended [plugin installation guide](plugin.md), which bundles MCP and both skills. Do not additionally register a duplicate standalone MCP server for the same plugin.

## Claude Code

Complete shared preparation, then inspect `claude mcp add --help`. Register stdio MCP at user scope with the resolved absolute paths:

```sh
claude mcp add --scope user --transport stdio android-use -- \
  /absolute/path/to/pinned/node \
  /absolute/path/to/android-use/dist/src/cli.js mcp \
  --config /absolute/path/to/machine-inventory/android-use.json
```

If an independently managed ADB server or optional hierarchy provider is configured, use the CLI's supported `--env` options before the server name. Preserve those explicit settings without copying unrelated environment variables or credentials. Inspect existing registrations first and avoid replacing unrelated servers. Reload the client and complete verification below.

Install both skill directories from the checkout into Claude Code's user skills directory, normally `~/.claude/skills/android-use` and `~/.claude/skills/android-use-setup`; check the host's current skills documentation if its location differs. Inspect existing directories before updating them. The setup skill contains relative links to repository documentation: in the installed copy, replace its `../../docs/plugin.md` link with an absolute link to this installation guide in the persistent checkout. Preserve the sibling operation/setup skill link. This is a client adaptation, not a Codex plugin install.

Reference: [Claude Code skills](https://code.claude.com/docs/en/skills). Registration syntax was inspected locally; end-to-end Claude Code discovery and real-phone operations are pending verification.

## Other Agents

Complete shared preparation. Use [the MCP configuration example](../examples/mcp.json) and the client's documented stdio registration mechanism. Preserve existing MCP entries and use absolute paths; do not assume the client expands `~` or supplies a checkout working directory. Configure explicit ADB/hierarchy environment values only when already required by the enrollment.

Install `skills/android-use` and `skills/android-use-setup` using the client's supported skill mechanism. Keep sibling links working and adapt the setup skill's documentation link to this guide in the persistent checkout. If the client has no skills support, load these instructions through its documented persistent instruction mechanism and state that native skill discovery is unavailable. Do not claim compatibility without exercising the actual client.

## Verification

1. Run `mise exec -- node dist/src/cli.js doctor --config /absolute/path/config.json` from the runtime checkout.
2. Confirm that the client discovers MCP and the operation/setup instructions. An offline phone and a missing MCP registration are separate failures.
3. Call `android_repl` without arguments; read its documentation and session ID.
4. Open the explicitly enrolled phone/connection and verify fresh PNG and UI structure feedback. See [README quick start](../README.md#quick-start).
5. For authorized input testing, follow [phone readiness verification](phone-setup.md#verify-readiness). Record what was actually verified and any pending permissions in the machine inventory.

`android_repl` executes authorized host Node code and is not a sandbox. Configure only a trusted client. Never replay an uncertain mutation after a disconnect or clear request history to force a retry.
