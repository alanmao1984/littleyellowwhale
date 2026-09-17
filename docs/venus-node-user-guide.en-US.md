# Little Yellow Whale Venus Node User Guide (English)

Applies to: Venus Node 2.8.0 and later compatible releases  
Website: [xiaohuangjing.com](https://xiaohuangjing.com)  
Official downloads: [GitHub Releases](https://github.com/alanmao1984/littleyellowwhale/releases)

## 1. What the client does

Venus Node connects your local Ollama, OpenAI-compatible service, FFmpeg, or dedicated ComfyUI instance to the Little Yellow Whale task network only while you explicitly allow it.

The client runs interactively in the foreground:

- it does not install a system service or startup item;
- it does not download models automatically;
- it does not modify your firewall;
- it connects only to loopback model services, not public endpoints;
- it stops accepting work when you close the terminal or press `Ctrl+C`.

The public repository contains the website, protocol boundaries, installers, and release workflow, but not the task-execution core source. Building the public source externally neither produces nor runs the closed-source core. Runnable clients are assembled, signed, and published only by this project’s protected GitHub Actions using a private Package. Never download a claimed “complete core” from a third party.

## 2. System requirements

| Platform | Supported system | Installer |
| --- | --- | --- |
| Windows | Windows 10/11 x64 | `venus-node-windows-x64-setup.exe` |
| macOS Apple Silicon | macOS 12+, M1/M2/M3/M4 | `venus-node-macos-arm64.pkg` |
| macOS Intel | macOS 12+, Intel x64 | `venus-node-macos-x64.pkg` |

You also need:

- network access to `https://xiaohuangjing.com`;
- a Venus account;
- a local inference or media service that you install and start yourself;
- legal permission to use the models, media, and compute resources you provide.

## 3. Download and verify safely

Use only these entry points:

- [Windows x64](https://xiaohuangjing.com/api/downloads/node/windows)
- [macOS Apple Silicon](https://xiaohuangjing.com/api/downloads/node/macos-arm64)
- [macOS Intel](https://xiaohuangjing.com/api/downloads/node/macos-x64)
- [All GitHub Releases](https://github.com/alanmao1984/littleyellowwhale/releases)

If the site says that a verified installer is being prepared, that platform has not passed the signed-release gate. Do not substitute an unsigned build or disable operating-system security checks.

Every production Release includes `SHA256SUMS`. After downloading, open a terminal in the download directory and verify the file.

Windows PowerShell:

```powershell
Get-FileHash .\venus-node-windows-x64-setup.exe -Algorithm SHA256
Get-AuthenticodeSignature .\venus-node-windows-x64-setup.exe | Format-List Status,SignerCertificate
```

macOS:

```sh
shasum -a 256 venus-node-macos-arm64.pkg
pkgutil --check-signature venus-node-macos-arm64.pkg
spctl --assess --type install --verbose=2 venus-node-macos-arm64.pkg
```

Use `venus-node-macos-x64.pkg` on an Intel Mac. The SHA-256 value must exactly match `SHA256SUMS`. Windows must report a `Valid` signature; macOS must show a trusted Developer ID and a successful assessment. If any check fails, do not install. Report the Release URL and filename in GitHub Issues, but never upload an account token or pairing code.

## 4. Install

### Windows

1. Download `venus-node-windows-x64-setup.exe` and complete the checks above.
2. Double-click the installer.
3. Confirm that the publisher signature is valid, then complete the wizard.
4. Open “Venus Node” from the Start menu. The desktop shortcut is optional.

The default location is `%LOCALAPPDATA%\Programs\Venus Node` for the current user. Administrator access is not required.

### macOS

1. Download the correct `.pkg` for your Mac and complete the checks above.
2. Double-click the package and finish the system installer.
3. Open `Venus Node` from Applications.
4. The app opens Terminal and runs the foreground node there.

Production packages are Developer ID signed, notarized, and stapled. Do not globally disable Gatekeeper to install software from an unknown source.

## 5. Prepare a local capability

Start at least one supported service on the same computer, for example:

- Ollama: `http://127.0.0.1:11434`
- OpenAI-compatible: `http://127.0.0.1:8000/v1`
- ComfyUI: `http://127.0.0.1:8188`
- FFmpeg: an executable and directories explicitly approved during node setup

The client accepts only `127.0.0.1` or `[::1]`. Do not put a username, password, API key, query, or fragment in the URL, and do not expose the local service directly to the public internet.

## 6. Pair the node

1. Sign in to the [Venus console](https://xiaohuangjing.com/tasks).
2. Open “My nodes” and select Windows or macOS.
3. Enter an optional node name and choose “Generate pairing code.”
4. Start Venus Node and read the permission and data notices in the terminal.
5. When prompted, enter the platform HTTPS root URL, local service URL, allowed models or capabilities, and local concurrency limit.
6. Confirm the foreground session locally, then enter the one-time pairing code shown on the website.
7. Return to “My nodes → Resource policy” and authorize only the capabilities, models, and task scope you intend to provide.

A pairing code expires quickly and works once. Never share it in chat, screenshots, tickets, or public issues. Node credentials remain only in the current client process; pair again after the next launch.

## 7. Run and stop

Keep the Venus Node terminal open. The node accepts only tasks assigned to it and permitted by its resource policy.

While it runs:

- keep the local inference service running;
- do not move approved media directories;
- monitor status, models, and task scope under “My nodes”;
- press `Ctrl+C` or close the terminal to stop immediately;
- pause or revoke the node on the website to prevent later use.

Task content is not end-to-end encrypted. Never put passwords, private keys, API keys, sensitive personal information, or data you are not authorized to process in prompts, media templates, or paths.

## 8. Hermes (optional)

Hermes can be enabled only when hardware, model context, and local isolation requirements are satisfied. Port `9119` remains inside the Docker network. The browser entry point is `127.0.0.1:9120` and requires a one-time platform grant.

Choosing “Open Hermes” on the website creates a short-lived, single-use link and attempts to open the local endpoint. Do not forward this link. Sessions, memories, and skills in a single-node Hermes deployment are a shared workspace, not strong multi-user isolation.

## 9. Upgrade and uninstall

To upgrade:

1. Stop the old client with `Ctrl+C`.
2. Download a newer production-signed installer from GitHub Releases.
3. Verify its SHA-256 value and signature again.
4. Run the new installer over the existing installation, then pair again.

On Windows, uninstall Venus Node from Settings → Apps → Installed apps. On macOS, remove `/Applications/Venus Node.app`. Uninstalling Venus Node does not remove Ollama, ComfyUI, models, Docker data, or media files; the device owner manages those separately.

## 10. Troubleshooting

### The download endpoint returns 503

No production-signed stable installer is currently available for that platform. Check GitHub Releases later; do not bypass the signing gate.

### The node stays offline

Confirm that its terminal is still running, the platform URL uses HTTPS, the system clock is correct, and the computer can reach `xiaohuangjing.com`. Then generate a new one-time pairing code.

### The client cannot reach the local model service

Open the loopback URL on the same computer first. Check the port, model name, and service status. Rejecting remote endpoints, credential-bearing URLs, and redirects is intentional security behavior.

### macOS cannot verify the package

Confirm that it came from the official Release, then run the `pkgutil` and `spctl` checks. If a production package still fails, stop and report it. Do not bypass the issue with `xattr -dr` or by disabling Gatekeeper globally.

### Windows SmartScreen shows a warning

Check the Authenticode status and SHA-256 value first. Stop if the production signature is invalid or the publisher does not match; do not choose “Run anyway.”

## 11. Get help

Open an issue: [GitHub Issues](https://github.com/alanmao1984/littleyellowwhale/issues)

Include your platform, CPU architecture, client version, exact error, and a safe log excerpt. Remove usernames, local paths, prompts, filenames, node credentials, API keys, pairing codes, and other sensitive information before posting.
