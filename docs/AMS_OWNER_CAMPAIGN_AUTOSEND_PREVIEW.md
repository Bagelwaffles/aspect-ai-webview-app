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
