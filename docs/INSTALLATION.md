# Install, update and remove Plico

Plico's public package builds a small native app locally. It is not signed with an Apple Developer ID or notarized. A local ad-hoc signature verifies the built bytes but does not provide a stable trusted publisher identity. Do not disable Gatekeeper, change TCC databases or import someone else's signing key.

## Before you start

- Install stock [Helium](https://helium.computer/) in Applications and open a normal profile at least once.
- Install Apple's Command Line Tools with `xcode-select --install`. Finish that installer before continuing. It provides Clang and Python 3.
- Clone the public repository or extract its source ZIP into a writable folder. Paths with spaces work.
- The public build targets your current Mac architecture. The release qualification describes the architecture/OS actually tested; deployment metadata alone is not a compatibility guarantee.

From Terminal, change to the extracted folder, then run:

```sh
bash Install.command
```

The installer refuses an existing or modified installation instead of overwriting it. It installs:

| Component                                 | Location                                                       |
| ----------------------------------------- | -------------------------------------------------------------- |
| Companion app                             | `~/Applications/Plico Helium Companion.app`                    |
| Frozen extension copy and recovery stages | `~/Library/Application Support/Plico Helium Companion/`        |
| Native messaging registration             | Helium's `NativeMessagingHosts/cc.helwig.plico.companion.json` |

No browser databases, cookies, preferences or unrelated registrations are replaced.

## Connect once

1. In Helium, open `helium://extensions` and enable **Developer mode**.
2. Choose **Load unpacked**. Select the `extension` folder printed by the installer, not the source checkout's extension folder. In the folder picker, Command+Shift+G lets you paste its path.
3. In **System Settings → Privacy & Security → Accessibility**, add the installed Plico app and enable it.
4. Open the Plico extension popup. Choose **Connect** if it is disconnected.
5. Focus Helium and press Command+B. The centered navigator should appear.

Plico starts through the enabled extension when Helium starts. You do not need a login item or to launch Plico's app directly. Launching the native messaging executable without Helium's expected origin is deliberately refused.

Without Accessibility permission, Plico must leave keys alone. If a changed ad-hoc build loses its permission, remove only Plico's Accessibility entry, add the newly installed app again, and enable it. This inconvenience is a limitation of the source-build distribution path.

## Update

Use the new release's extracted folder. First build it:

```sh
bash scripts/build.sh --app-only
python3 scripts/update.py prepare --allow-ad-hoc
```

Preparation verifies content and identity and prints an **update stage path**. It does not replace the installed release. In Helium's Plico popup choose **Disconnect**, then run:

```sh
python3 scripts/update.py publish "THE PRINTED UPDATE STAGE PATH"
```

In `helium://extensions`, press **Reload** on Plico, then check its popup says Connected. Re-grant Accessibility if required by the changed ad-hoc signature. Settings stay in the same Helium extension identity.

If your existing installation uses a persistent signing certificate, builds must use that same identity. The updater refuses a silent switch from certificate signing to ad-hoc signing.

## Rollback and interruption recovery

Each update retains the prior app, extension and receipt together. Disconnect Plico, then:

```sh
python3 scripts/update.py rollback "THE UPDATE STAGE PATH"
```

Reload the extension and reconnect. If an update process was interrupted during its atomic exchanges, use `recover` instead of `rollback`. Recovery inspects all files before changing any; unknown bytes cause refusal.

```sh
python3 scripts/update.py recover "THE UPDATE STAGE PATH"
```

For an interrupted **first installation**, run:

```sh
python3 scripts/install.py recover "THE INSTALL STAGE PATH"
```

Then retry installation. Stages are under the support folder listed above. Keep retained stages until you no longer need rollback. Do not manually mix files from different releases.

## Verify or uninstall

```sh
python3 scripts/install.py status
```

Status checks the signature, installed app/extension hashes and native-host registration. It does not prove that a physical shortcut works; test Command+B in Helium too.

To remove Plico, Disconnect it in the extension popup, then:

```sh
python3 scripts/install.py uninstall
```

Owned files and retained rollback copies go to Trash. Remove the Plico extension in Helium and its Accessibility entry in System Settings. Helium and unrelated registrations remain intact. Modified installation files cause a safe refusal for manual inspection.

## Troubleshooting

- **Disconnected:** check that the extension was loaded from the installed frozen folder, then choose Connect. Explicit disconnection does not auto-retry in a loop.
- **Accessibility permission required:** enable the installed app in Accessibility, then reconnect. The popup distinguishes an open native connection from a ready keyboard hook.
- **Keyboard hook unavailable:** reconnect once. If it remains unavailable, check macOS permissions; do not disable system protections.
- **Connected but no navigator:** focus the actual paired Helium window. Secure Input in password fields can block navigation.
- **Command hold works only after another input:** check keyboard-remapping rules. Karabiner's [`to.lazy`](https://karabiner-elements.pqrs.org/docs/json/complex-modifications-manipulator-definition/to/lazy/) withholds modifier key-down until another input. Plico cannot start its reveal timer before receiving that event. Setting `lazy: false` sends the modifier immediately while retaining `to_if_alone` tap actions. To prevent a short hold from both revealing Plico and triggering a tap action on release, align the tap timeout with Plico's reveal delay. Rules can be scoped to Helium (`^net\.imput\.helium$`) to preserve other apps' behavior. Test brief taps, holds and any overlap with Plico's tap-to-commit gesture. Plico does not edit remapper settings automatically.
- **Native host not found:** rerun `status`; do not write a registration into a guessed profile folder.
- **Signature changed:** use a matching persistent signing identity or explicitly accept the documented ad-hoc update path. Do not turn off OS protections.
- **Unknown modified files:** preserve them and the recovery stage. The installer will not guess which copy is safe to overwrite.
