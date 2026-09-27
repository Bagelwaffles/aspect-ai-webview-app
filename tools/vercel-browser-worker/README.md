# AMS Vercel Cloud Browser Worker

This project moves the Browser Control executor off the owner's Windows computer while preserving the existing AMS control plane.

## Architecture

- The main AMS Next.js app still owns browser jobs, provider allowlisting, risk classification, approvals, kill switch, audit history, screenshots, and worker result state.
- This separate Vercel project runs the execution worker.
- The Vercel Function uses `@vercel/sandbox` to create/resume one persistent named Sandbox.
- Chromium and Playwright are installed inside the Sandbox, not bundled into the AMS website.
- The Sandbox keeps a dedicated Chromium profile on its persistent filesystem.
- A daemon polls the existing AMS worker APIs while the Sandbox session is awake.
- When the Sandbox session stops, Vercel persists its filesystem and restores it on the next dispatch.

## Why a separate project

The browser runtime does not belong in the customer-facing AMS deployment. Isolation keeps browser dependencies, session state, and execution failures away from the public website.

## Environment

Set on the cloud-worker Vercel project:

```
AMS_BASE_URL=https://www.aspectmarketingsolutions.app
AMS_CLOUD_BROWSER_DISPATCH_KEY=<independent 32+ character random secret>
AMS_CLOUD_BROWSER_SANDBOX_NAME=ams-browser-worker
```

Set the same dispatch key and the deployed worker URL on the main AMS project:

```
AMS_CLOUD_BROWSER_ENABLED=false
AMS_CLOUD_BROWSER_WORKER_URL=https://<cloud-worker-project>.vercel.app
AMS_CLOUD_BROWSER_DISPATCH_KEY=<same independent random secret>
```

Keep `AMS_CLOUD_BROWSER_ENABLED=false` until controlled preview proof is complete.

Vercel supplies Sandbox OIDC automatically in production. Do not create or store a Vercel access token for normal Sandbox operation.

## Pairing

The cloud Sandbox uses the existing AMS Browser Control worker pairing mechanism.

1. Generate a one-time pairing code from the AMS Browser Control owner UI.
2. Send that code through the owner-protected AMS cloud-pair endpoint.
3. AMS calls this project's protected `/api/pair` endpoint server-to-server.
4. The Sandbox pairs as `AMS Vercel Cloud Browser Worker`.
5. Its worker token is stored only inside the persistent Sandbox filesystem and is never returned by this project.
6. The cloud daemon starts.

## Supported actions

Cloud worker:

- open
- describe
- inspect
- screenshot
- focus_browser (headless acknowledgement)
- click
- fill
- upload only when an approved file is already staged inside the Sandbox upload directory
- submit

Cloud worker deliberately refuses:

- `capture_secret`
- `fill_secret`

The current Windows worker protects those values with Windows DPAPI. Do not weaken that protection by moving raw credentials into a cloud filesystem. Cloud secret operations remain blocked until a separate Vercel-grade vault design is implemented and reviewed.

## Human security checks

The worker detects and stops on:

- login
- MFA / 2FA
- CAPTCHA / human verification
- OAuth consent
- security / identity checks

No bypass logic is implemented.

## Network security

The Sandbox is installed with normal network access only during first-time Chromium setup. Before browser jobs run, the Vercel Sandbox egress firewall is changed to an allowlist covering the same approved AMS providers plus their required static/CDN domains.

Top-level navigation is independently revalidated inside the worker against the AMS provider list.

## Session persistence

The browser runs as a daemon during an active Sandbox session, preserving the live tab across normal multi-step Browser Agent approvals.

The Chromium profile and last approved URL are persisted. If Vercel suspends the Sandbox between steps, the next dispatch resumes the Sandbox and restores the authenticated browser profile.

## Production gate

Do not retire the Windows worker until all are verified in preview:

1. Sandbox provisions and installs Chromium successfully.
2. Worker pairing succeeds without exposing its token.
3. Read-only `open`, `describe`, and `screenshot` jobs pass.
4. One approved click/fill write passes on an AMS-owned or low-risk test target.
5. Twitch Video Producer can be reached when the cloud profile is authenticated.
6. Login/MFA/CAPTCHA/consent stops are proven.
7. Kill switch prevents new cloud jobs.
8. A Sandbox sleep/resume preserves the browser login profile.
9. Runtime logs contain no credentials.
10. Windows worker remains available but is not concurrently polling during the final cutover.
