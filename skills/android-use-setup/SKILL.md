---
name: android-use-setup
description: Install, configure or repair the Android Use plugin and its local MCP runtime, including explicit phone enrollment and optional input and hierarchy companions.
---

Read [the plugin installation guide](../../docs/plugin.md) for this plugin's supported install commands and startup/configuration paths. This skill applies to setup requests, not routine app navigation.

For Codex, register the Git marketplace and install `android-use@android-use-marketplace`. Use the current CLI's `--help` to check availability. Inspect its JSON install result to locate the installed plugin root; prepare that root with its own pinned mise configuration. Do not build a different checkout and assume the cached plugin has the output. Do not edit Codex plugin registry internals or replace unrelated MCP entries.

The user's installation request authorizes preparing host dependencies and registering the plugin. Reuse existing official ADB and enrollment where available. Store device setup in the user's machine inventory, default `~/Workspace/Machines`; keep a persistent shared state directory for all aliases of the phone. Never place enrollment or keys in the plugin cache. The startup wrapper accepts an absolute ANDROID_USE_CONFIG or machine-local plugin-runtime.json.

Phone pairing, permission toggles, APK installation, keyboard changes and AccessibilityService enablement require authorization appropriate to the user's setup request. Explain the concrete next device action when user involvement is needed. Do not automatically accept SDK licenses, disable security checks or restart a shared ADB server. Preserve an existing ADB_SERVER_SOCKET when configured.

Run the operator CLI doctor before opening the selected device. Verify plugin discovery, the skill and MCP registration separately from live phone success. A missing/offline phone does not mean plugin installation failed. Ask the user to restart/reload the host when it has not picked up the new registration; do not claim it is active until tools are available.

Use the dedicated IME only when text input is needed; save the original keyboard before changing it. The read-only accessibility companion is optional and manually enabled, with UIAutomator fallback. Debug remains off unless explicitly requested. Record verified machine state and pending limitations in the machine inventory.
