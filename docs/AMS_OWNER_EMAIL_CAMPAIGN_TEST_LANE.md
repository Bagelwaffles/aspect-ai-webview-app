# AMS-owned email campaign test lane (October 12, 2026)

## Purpose
Reuse the already-tested **primary Gmail sender** in existing Draft PR #262. Do not rebuild Google OAuth, change the two owner grants, or suggest that the ChatGPT Gmail connector grants backend send access. No customer-facing emails should be triggered by merely creating/reviewing a campaign.

## Implemented in this stacked Draft PR
- An owner-authenticated API at /api/owner/campaigns/pilot, with trusted-origin protection on create/review/stop.
- Pilot drafts are linked to an existing **successful, committed, owner-owned email-channel Content Agent run**; no new AI generation or customer credit debit.
- Exactly three owner-reviewed plain-text messages, 1+ days apart, with bounded 30-day schedule previews.
- Recipient restricted to AMS primary or secondary **owner-controlled test inboxes only**, not customers, prospects, or lists.
- Owner-scoped Redis records with 90-day TTL, idempotent create and compare-and-set status revisions.
- Three-stage pilot sender adapter reusing existing primary Gmail send OAuth, default OFF behind **AMS_OWNER_CAMPAIGN_PILOT_ENABLED=true**, AMS_GMAIL_SEND_ENABLED=true, Testing consent and Vercel Preview **all required**.
- Durable per-step claims before remote I/O; ambiguous Gmail sends never retry automatically. Accepted provider message ID is proof of Gmail API acceptance, **not** an independently received inbox message. Added an owner-only, Preview-only metadata verifier at /api/owner/campaigns/pilot/verify-receipt. It checks the provider-accepted message's actual RFC Message-ID, then reads the specific authorized owner recipient inbox and confirms INBOX status, From, To, Subject and Message-ID before storing a verified receipt. Subsequent steps **cannot** run while any previous step is merely accepted or unconfirmed. This verifier never sends messages.
- The pilot sender is exposed only through an explicit owner-authenticated, trusted-origin, PREVIEW-only one-step test POST at /api/owner/campaigns/pilot/send-test. It requires the separate disabled-by-default feature switch and a literal user confirmation. The phone-friendly owner page /owner/campaign-pilot exposes the test button only when this flag is enabled. No Cron or automatic sender is wired up, so saving or approving a draft never sends. The existing 27 scheduled tasks and all monitoring/auto-reply settings are untouched.

## Next gates before owner test messages
1. CI type/lint/tests/build, security and Preview checks.
2. The owner explicitly reviews the exact messages and timestamps. No broad campaign recipients or marketing lists.
3. Verify the preview-only owner-authenticated/CSRF-protected send-test trigger with an approved existing test inbox; independently confirm received message and saved state. Do not register new live Cron or enable flags without owner approval.
4. Verify pause/stop/duplicate handling, recipient match, retries/ambiguous acceptance, delivery receipts, and rate limiting. The pilot is manual one-step-at-a-time; no scheduled worker exists yet.
5. Clear Google Gmail restricted scope/production verification requirements before any production rollout. Testing grants must not be treated as permanent.
6. Subscriber-facing campaign delivery is a SEPARATE later release with customer-specific sender grants, consented audiences, suppression/unsubscribe, bounce/complaint, stop-on-reply and full tenant isolation.

## Boundaries
Leave PR #262 Draft/HOLD and do not cherry-pick it. This PR is STACKED with base branch feat/scheduled-task-migration, and should never merge ahead of PR #262. PR #274 remains separate customer review-only planning work; PR #273 remains separate checkout-safety work. Stripe, Quick Audit, paid credits, Android, n8n, Twitch, Shopify, production, the two owner Gmail grants and 27 existing task states are unchanged.


## October 12 — owner-preview login diagnosis and remediation

An owner-provided phone screen recording shows that Preview /login?next=/owner/campaign-pilot blocks Google sign-in because its NEXTAUTH_URL pointed to the production site. The page previously offered a production login link with the draft-only path as its next route, which produced a production 404 for a signed-in owner. This is not evidence of a failed Gmail connection.

- Stable Preview branch alias: https://aspect-ai-overlord-git-3bef93-kimberleyaversbiz-4131s-projects.vercel.app
- Scoped only to feat/ams-owner-campaign-pilot-20261012: NEXTAUTH_URL and PUBLIC_APP_URL set to the exact stable alias. Production settings and PR #262 stay unchanged.
- The login fallback no longer carries a preview-only path into production. Production login alone cannot authenticate the Preview.
- Exact Google Cloud Web OAuth authorized redirect URI requiring owner approval (preserve all others): https://aspect-ai-overlord-git-3bef93-kimberleyaversbiz-4131s-projects.vercel.app/api/auth/callback/google
- This is AMS NextAuth login, not a Gmail monitoring grant/callback. No external OAuth redirect registration, successful Preview owner session or inbox receipt is yet confirmed.
- Check the next Git-backed Preview deployment after branch variables apply, then complete exact owner browser login, owner campaign protected-route acceptance and isolated grant/storage checks.
- Never expose or clone production/PR #262 Gmail grant secrets. Do not enable automatic replies, campaign sender flags, or a scheduled worker. Keep both PR #262 and PR #275 Draft/HOLD and leave all 27 tasks unchanged.


## October 19 — preview-only unattended owner scheduler

A separately gated bounded worker now exists at `POST /api/internal/owner-campaign-pilot/tick` (see `docs/AMS_OWNER_CAMPAIGN_AUTOSEND_PREVIEW.md`). It scans only the owner pilot namespace, sends approved due steps, verifies the exact recipient inbox before advancing and holds ambiguous sends. It is default OFF and not yet invoked by any active Cron/Actions schedule. The Preview authorization and exact receipt test must pass before any activation. Customer-facing mail remains disabled.

Review-only approval is **not** sending authorization. Scheduled sending additionally requires owner-authenticated `POST /api/owner/campaigns/pilot/authorize-autosend` with a literal confirmation, tied to that reviewed campaign fingerprint. The existing Stop action prevents further steps. Both the per-campaign grant and default-off Preview worker flags are required.
