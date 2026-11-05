# AMS Email Campaign — unattended owner-only Preview worker

Status: **Draft / OFF**. Implements the missing scheduled-worker entrypoint for the
existing owner-only PR #275; does **not** activate or schedule it, modify PR #262,
or authorize customer campaign sending.

## Existing functionality reused
- PR #262 primary-only Gmail OAuth, encrypted tokens, refresh, sender and receipt
- PR #275 reviewed three-step campaign, test-inbox recipient restriction, unique
  per-step durable Redis claims, independent exact-message inbox receipt
- No new sender, grant, customer list, Stripe charge or email-generation cost

## Preview-only worker
`POST /api/internal/owner-campaign-pilot/tick` is reachable only in Preview.
It requires all existing sender gates plus a distinct
`AMS_OWNER_CAMPAIGN_AUTOSEND_ENABLED=true` feature flag and a bearer secret
`AMS_OWNER_CAMPAIGN_WORKER_SECRET` (minimum 32 characters). Default: disabled.
No credentials or recipient content are in logs or response.
The worker uses bounded owner-namespace Redis scanning with a persistent cursor;
at most three already approved owner-inbox campaigns are processed per tick.
An approved due step is sent through the existing Gmail dispatch only once, **only after** the owner also authorizes that specific campaign through the session-authenticated trusted-origin `POST /api/owner/campaigns/pilot/authorize-autosend` with `confirmation: AUTHORIZE_OWNER_ONLY_PREVIEW_SCHEDULE`. Merely approving a draft does not authorize automated sends.
A previously accepted step triggers independent receipt verification instead
of sending the next message. An ambiguous outcome is held for manual review.
Stopped or draft campaigns are never sent. No marketing customer addresses are
accepted by PR #275's existing validation.

## Remaining acceptance and release requirements
1. Stacked branch depends on PR #262 and PR #275; those remain Draft/HOLD.
   Do not merge this independently or to production.
2. Confirm the exact Preview branch's NextAuth OAuth redirect, session, primary
   encrypted Gmail grant and genuine token refresh persistence.
3. With an owner-approved three-step pilot in Preview, install the separate
   worker secret in Preview ONLY, activate flags ONLY for controlled owner test,
   invoke one authenticated tick when first message is due and verify inbox
   receipt. Repeat the tick: no duplicate; after receipt the second step does
   not send until due.
4. Configure a separate authorized **Preview** scheduler to call this route
   at the desired interval only after manual acceptance; there is no Cron or
   GitHub Actions schedule active from this branch. A route is not a running job.
5. Production/customer campaigns require distinct customer sender authorization,
   recipient consent, suppression/unsubscribe, bounce handling, opt-out and
   stop-on-reply, per-tenant rate limits, abuse controls, Google OAuth
   verification/policy approval, owner authorization, and a further release.
6. The Quick Audit outbox is separate PR #282 and is not automatically connected
   by this worker. Integrate only after above owner-path acceptance.

No existing 27 scheduled tasks, production mail, customer data, or payment
systems are modified.


## Redis Preview isolation and credentials

Use the **existing free Upstash Preview** database, not production.
Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` scoped only to
`feat/ams-owner-campaign-pilot-20261012`. Set
`AMS_OWNER_GMAIL_PREVIEW_NAMESPACE=ams-campaign` on the same Preview branch
so campaign drafts, OAuth records and receipts cannot collide with PR #262
monitoring data. A namespace cannot be enabled in Production.
Generate a fresh Preview-only `AMS_CONNECTION_ENCRYPTION_KEY` for this
namespace; never copy PR #262 or production keys. A new namespace requires an
independent owner-approved Gmail consent/authorization and exact authorized
redirect URI. Keep `AMS_GMAIL_SEND_ENABLED`,
`AMS_OWNER_CAMPAIGN_PILOT_ENABLED`, and
`AMS_OWNER_CAMPAIGN_AUTOSEND_ENABLED` unset or false until the controlled
owner-login, refresh and send/receipt gates all pass. No settings grant an
email sender permission automatically. Missing OAuth client credentials are a
separate unresolved owner-approval/deployment dependency.

## Verified environment and remaining authorization — October 19, 2026

- Campaign Preview deployment `19742d060b59` was **READY**; GET `/api/health` returned HTTP 200 with Redis status `ready` against the existing free Upstash Preview database. A read-only bounded Redis `EVAL SCAN` against the campaign namespace succeeded with an empty first page; it did not access existing owner monitoring records.
- Scoped only to this Preview branch: Redis URL and protected token, a fresh unrelated encryption key, `AMS_OWNER_GMAIL_PREVIEW_NAMESPACE=ams-campaign`, and the existing Google OAuth **client ID**, the primary/secondary owner account identities, and `AMS_GMAIL_CONSENT_MODE=testing`. No OAuth refresh tokens or grant records were copied from PR #262.
- **The protected `AMS_GMAIL_CLIENT_SECRET` remains unavailable for programmatic export from the separate PR #262 Vercel environment.** An owner must securely provision the existing Google OAuth client secret into THIS branch's Preview environment, without posting it in PRs, GitHub, ChatGPT or logs. Reuse the existing OAuth app; do not create another one.
- Ensure the existing Gmail OAuth client's authorized redirect URIs include the **exact stable Preview alias** for the primary slot: `https://aspect-ai-overlord-git-3bef93-kimberleyaversbiz-4131s-projects.vercel.app/api/owner/gmail/primary/callback`. The secondary callback, only if needed, ends with `/api/owner/gmail/secondary/callback`. Keep the NextAuth login redirect `https://aspect-ai-overlord-git-3bef93-kimberleyaversbiz-4131s-projects.vercel.app/api/auth/callback/google` correctly registered with its respective login OAuth client.
- After branch-scoped secret provisioning, a new Git-backed Preview deployment must pick up settings. Owner signs into `/owner/campaign-pilot` and authorizes the primary Gmail slot inside the isolated namespace. Do not equate ChatGPT's Gmail connector or Cloudflare forwarding with AMS OAuth authorization.
- Only after a validated encrypted Gmail grant and refresh may the owner approve one three-step campaign, separately authorize its Preview-only schedule, and temporarily enable the three sending gates and independent worker secret for one real owner-inbox send, receipt and duplicate-replay verification. No scheduled job or customer send is active.
- Cloudflare routing was independently verified using one email from the secondary owner Gmail account to `kimberley@aspectmarketingsolutions.app`; it appeared in the primary Gmail INBOX with a Cloudflare Received header. Inbound forwarding **does not** establish an outbound send-as identity or AMS sender readiness.
- Vercel direct deployment creation was forbidden by the active Vercel connection (403); ordinary Git branch pushes still create authorized Preview deployments automatically. Leave production untouched.


## Owner-authored Preview test source (no credits)

When no qualifying generated email exists, the primary owner may save a manual
Preview rehearsal through the same authenticated, trusted-origin campaign API.
Use `source: {"kind":"owner-authored-preview-test","creditUsage":"none"}`
instead of `sourceRunId`. The strict union rejects mixed provenance and billing
claims. No Content Agent run is created, read or committed by this path. It is
restricted to `VERCEL_ENV=preview` and `AMS_GMAIL_CONSENT_MODE=testing`.
Every subject must begin `[AMS PREVIEW TEST] ` and every body must begin
`Owner-authored Preview test. No AI generation or credits used.`
The two owner-inbox restriction, exactly three steps, future dates and minimum
one-day cadence remain enforced. Generated sources retain their existing
owner-owned succeeded/committed/email validation.

Saving remains draft-only. Present the persisted recipient, exact subjects,
bodies and ISO timestamps for owner copy approval; then obtain separate
campaign-specific Preview schedule authorization. Neither provenance nor a
global feature flag grants permission to send. Keep all sending flags off until
these gates pass. The existing worker, receipt checks, durable duplicate claims,
ambiguous-send hold and stop controls are reused unchanged.
