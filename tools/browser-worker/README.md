# AMS Browser Worker v1.1

This is the workstation-side browser executor for AMS Browser Control.

## Design

- Runs on the owner's Windows workstation.
- Uses a dedicated Microsoft Edge/Chrome profile under `%LOCALAPPDATA%\AMS\BrowserWorker`.
- Pairs with the AMS control plane using a 10-minute one-time code.
- The raw worker token is returned once and stored locally; AMS stores only a SHA-256 digest.
- Sends a heartbeat every ~15 seconds.
- Polls the AMS queue for approved jobs.
- Does not accept arbitrary JavaScript execution.
- Uses an explicit hostname allowlist enforced by the AMS server.
- Green actions (`open`, `inspect`, `screenshot`) can queue immediately.
- Yellow actions (`click`, `fill`) require owner approval.
- Red actions (`upload`, `submit`) require owner approval.
- The AMS emergency stop prevents workers from claiming new jobs.

## Multi-step forms

Interactive jobs can opt into **Use current page**. In this mode, the worker does not reload the target page before a `click`, `fill`, `upload`, or `submit` action. This preserves live form state across a sequence of approved jobs.

Safety rules:

- Current-page mode is rejected for read-only `open`, `inspect`, and `screenshot` actions.
- The worker verifies that the currently open page and the job URL have the same HTTPS origin before acting.
- Current-page actions remain approval-gated according to their risk level.
- CAPTCHA, MFA, security-check, login, and consent states still stop and return `owner_action_required`.

## Safe local uploads

The worker can upload only files placed in:

`%LOCALAPPDATA%\AMS\BrowserWorker\Uploads`

The dashboard sends only the filename (for example `ams-logo.png`), never an arbitrary local path. The worker rejects path traversal, symlinks, unsupported extensions, and files over 200 MB before calling the target site's file input.

Approved extensions currently include PNG, JPEG, WebP, GIF, PDF, CSV, TXT, ZIP, AAB, and APK.

## Install on Windows

1. Open the protected AMS Browser Control page at `/dashboard/browser-control`.
2. Create a one-time pairing code.
3. From this folder in PowerShell, run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1 -ControlUrl "https://www.aspectmarketingsolutions.app"
```

4. Paste the one-time code when asked.
5. Return to the dashboard and wait for `Worker Online`.
6. Run the harmless proof test. It opens `/collaborate`, reads the title, takes a screenshot, and reports the evidence to AMS.

The installer first attempts a limited-privilege current-user scheduled task. If Windows denies task creation, it falls back to a current-user Startup entry and launches the worker immediately. Existing pairing credentials are reused on subsequent installs/upgrades.

## Login sessions

Do not put website passwords, API keys, recovery codes, or payment details in source code or chat. If a business website requires login, sign in manually inside the dedicated AMS browser profile. The session remains on the workstation.

## Local data

- Credentials: `%LOCALAPPDATA%\AMS\BrowserWorker\credentials.json`
- Browser profile: `%LOCALAPPDATA%\AMS\BrowserWorker\EdgeProfile`
- Safe uploads: `%LOCALAPPDATA%\AMS\BrowserWorker\Uploads`
- Logs: `%LOCALAPPDATA%\AMS\BrowserWorker\logs\worker.log`

## Browser selection

The worker tries Microsoft Edge first and Chrome second. You can override the Playwright channel before startup:

```powershell
$env:AMS_BROWSER_CHANNEL = "msedge"
```

## Stop locally

Use the AMS dashboard emergency stop to prevent new jobs. You can also close the local worker process or remove/disable the current-user startup entry created by the installer.
