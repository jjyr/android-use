# USB and wireless connections

Proposal dated 2026-10-09. Both USB and wireless ADB are first-version implementation targets. Wireless will be tested first with the available phone; USB support remains unverified until a data cable and phone can be used. No Android Use connection code exists yet.

## Prerequisites and operator setup

Install official Android platform-tools. On the current macOS host, Homebrew supplies them:

```sh
brew install --cask android-platform-tools
adb version
```

Node and pnpm will be pinned by this repository's independent mise configuration. scrcpy is optional for watching and takeover:

```sh
brew install scrcpy
```

The core does not require Android Studio, Appium, root or a phone-side companion APK. These are external setup instructions, not implemented Android Use commands. Do not run installation or change debugging settings as an implicit consequence of agent discovery or opening a session.

## Wireless debugging without a cable

Use Android 11+ with wireless debugging available on the device. Connect phone and host to the same reachable local Wi-Fi network. OEM settings names differ; guest networks, client isolation, firewalls or VPN routes may prevent connectivity.

1. Enable Developer options and Wireless debugging on the phone.
2. Choose **Pair device with pairing code**. Note its pairing address/port.
3. Run the pairing command and enter the code at the local interactive prompt:

   ```sh
   adb pair PHONE_IP:PAIRING_PORT
   ```

4. Return to the main Wireless debugging page and read its connection address/port. This port usually differs from the pairing port:

   ```sh
   adb connect PHONE_IP:CONNECTION_PORT
   adb devices -l
   ```

5. Confirm the intended endpoint is listed with state `device`. Diagnose `offline`, unreachable or revoked authorization before attempting UI actions.

Pairing establishes host trust; connecting attaches the ADB transport. Discovery via mDNS may attach a paired device automatically on some hosts, but the first implementation must also work with explicit operator-selected endpoints. A pairing endpoint must never be used as the UI command endpoint.

ADB stores its pairing trust in its normal host key store. Android Use must not log pairing codes, copy private ADB keys or ask the model to handle a code. Pairing is an operator workflow; subsequent device operations use the enrolled connection. Do not assume private-server/key-store isolation in version one: host ADB is shared, and the component must avoid global restart or trust-store changes.

Wireless debugging can turn off or its address/port can change after network changes or restart. Re-establishing an ADB transport does not resume old observations or unknown mutations. Android Use requires identity confirmation and a new session generation before resuming control.

Android below 11 may require USB-assisted `adb tcpip` setup or vendor-specific mechanisms. This is outside initial cable-free wireless support. Do not silently enable a legacy TCP listener or expose ADB over a public network.

## USB debugging

Use a data-capable cable, enable USB debugging in Developer options, connect the phone and accept its debugging authorization prompt. Then inspect:

```sh
adb devices -l
```

State `unauthorized` requires phone-side authorization; `offline` or absent devices require connection diagnostics. The session must bind to the exact selected USB device, even when additional phones or wireless endpoints are present. USB and wireless expose the same basic Android commands after connection; actual timing and availability are qualified separately.

## Connection abstraction

Keep connection establishment separate from Android command execution and the model-facing phone handle.

```text
Core / observations / actions
          |
Android command adapter: screenshot, hierarchy, input, launch
          |
Bound connection: exact ADB target and connection generation
          |
     USB or wireless
```

The proposed internal connection contract supplies:

| Capability | Meaning |
| --- | --- |
| Inventory | Candidate transports and enrolled device availability; discovery never grants control |
| Bind | Resolve a configured device and connection kind to one exact authorized ADB transport |
| Identity | Enrolled device ID, connection kind, current selector/transport ID and generation |
| Execute | Dispatch bounded argument arrays to that bound target; no global default selector |
| Health/invalidation | Classify unavailable/offline/unauthorized targets and invalidate observations on disconnect |
| Release | Release owned references and processes without resetting host ADB or deleting device trust |

These are internal responsibilities, not approved method names. Keep USB-specific discovery and wireless endpoint handling behind separate implementations. Command semantics, output normalization, UI settling and task verification belong above this layer.

## Device identity and selection

The operator enrolls a logical device ID with explicit USB and/or wireless connection settings. IP:port and ADB `transport_id` are transient routing identifiers; neither is a durable phone identity. Manufacturer/model labels are not unique identifiers either.

Bind a session to an enrollment, chosen connection kind and currently resolved target. Verify available device attributes against enrollment and preserve unknown/unavailable attributes; do not manufacture a secure identity guarantee from serial or model alone. If identity cannot be established sufficiently to match the selected enrollment, stop for operator reconciliation. The implementation must specify and test its enrollment evidence before enabling automatic rebinding.

A phone attached through both USB and wireless must use one enrollment and one controller lease. Two transport selectors must not create independent controllers for the same phone. An endpoint update cannot quietly redirect a session to another device. First version uses explicit operator reconciliation and rebinding; automatic endpoint discovery/recovery is a later convenience only after identity evidence is qualified.

## Failure and ownership rules

Never switch connection kinds or targets silently. Wireless failure does not trigger USB fallback; cable loss does not choose a reachable network device. Every new binding increments generation and obtains a fresh observation. No mutation is replayed after lost transport, even if the next connection has the same selector.

Closing a session releases its controller lease. Host ADB connections may be shared with scrcpy or other tools: do not run global `adb disconnect` or kill the shared server. If an adapter creates a network connection, its cleanup policy must track ownership and shared users before disconnecting that exact endpoint. Paired trust remains until the operator revokes it.

Measure capture latency, action settling and disconnect detection per connection kind. Do not treat the greater variability of Wi-Fi as a different action API or hide timeouts as successful UI effects.
