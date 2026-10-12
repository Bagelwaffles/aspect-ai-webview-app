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
- Durable per-step claims before remote I/O; ambiguous Gmail sends never retry automatically. Accepted provider message ID is proof of Gmail API acceptance, **not** an independently received inbox message.
- The pilot sender is exposed only through an explicit owner-authenticated, trusted-origin, PREVIEW-only one-step test POST at /api/owner/campaigns/pilot/send-test. It requires the separate disabled-by-default feature switch and a literal user confirmation. The phone-friendly owner page /owner/campaign-pilot exposes the test button only when this flag is enabled. No Cron or automatic sender is wired up, so saving or approving a draft never sends. The existing 27 scheduled tasks and all monitoring/auto-reply settings are untouched.

## Next gates before owner test messages
1. CI type/lint/tests/build, security and Preview checks.
2. The owner explicitly reviews the exact messages and timestamps. No broad campaign recipients or marketing lists.
3. Verify the preview-only owner-authenticated/CSRF-protected send-test trigger with an approved existing test inbox; independently confirm received message and saved state. Do not register new live Cron or enable flags without owner approval.
4. Verify pause/stop/duplicate handling, recipient match, retries/ambiguous acceptance, delivery receipts, and rate limiting.
5. Clear Google Gmail restricted scope/production verification requirements before any production rollout. Testing grants must not be treated as permanent.
6. Subscriber-facing campaign delivery is a SEPARATE later release with customer-specific sender grants, consented audiences, suppression/unsubscribe, bounce/complaint, stop-on-reply and full tenant isolation.

## Boundaries
Leave PR #262 Draft/HOLD and do not cherry-pick it. This PR is STACKED with base branch feat/scheduled-task-migration, and should never merge ahead of PR #262. PR #274 remains separate customer review-only planning work; PR #273 remains separate checkout-safety work. Stripe, Quick Audit, paid credits, Android, n8n, Twitch, Shopify, production, the two owner Gmail grants and 27 existing task states are unchanged.
