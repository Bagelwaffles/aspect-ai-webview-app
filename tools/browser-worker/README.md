# AMS Browser Worker v1

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
- Red actions (`submit`) require owner approval.
- The AMS emergency stop prevents workers from claiming new jobs.

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

The installer creates a current-user `AMS Browser Worker` scheduled task that starts at Windows logon. If Windows blocks task creation, run `start.ps1` manually.

## Login sessions

Do not put website passwords, API keys, recovery codes, or payment details in source code or chat. If a business website requires login, sign in manually inside the dedicated AMS browser profile. The session remains on the workstation.

## Local data

- Credentials: `%LOCALAPPDATA%\AMS\BrowserWorker\credentials.json`
- Browser profile: `%LOCALAPPDATA%\AMS\BrowserWorker\EdgeProfile`
- Logs: `%LOCALAPPDATA%\AMS\BrowserWorker\logs\worker.log`

## Browser selection

The worker tries Microsoft Edge first and Chrome second. You can override the Playwright channel before startup:

```powershell
$env:AMS_BROWSER_CHANNEL = "msedge"
```

## Stop locally

You can use the AMS dashboard emergency stop for new jobs, end the `AMS Browser Worker` scheduled task, or close the local worker process.
