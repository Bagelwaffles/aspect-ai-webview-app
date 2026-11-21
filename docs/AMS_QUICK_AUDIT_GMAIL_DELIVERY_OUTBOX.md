# AMS Quick Audit transactional delivery — controlled outbox

Status: DRAFT / HOLD. Not deployed; sending disabled.

## Existing components kept

- Native $49 Stripe Checkout, signed event verification, protected idempotent fulfillment, native report, durable Redis result and paid customer result page stay unchanged.
- Primary owner Gmail OAuth/send is **only in unmerged PR #262**; the ChatGPT Gmail connector does not supply credentials to Vercel. Secondary Gmail is monitoring-only.
- The 27 owner tasks, Stripe prices/webhooks, n8n, subscriptions, Shopify, Twitch and Android remain unchanged.

## New seam

The native completion event optionally queues one durable audit delivery record per request ID in Redis AFTER the native report and paid session record are committed. The event hook is enabled only by `AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED=true` (default absent/off). Queue failure logs only a generic warning and never reverses payment or sends duplicates. This adds an outbox without turning on delivery.

`QuickAuditDeliveryOutbox.claim` takes explicit `enabled`, `ownerOnly` and `ownerEmail` policy. Its default-off caller must be implemented behind an independently authenticated server-to-server scheduled worker after PR #262 is approved. It claims atomically; records provider submission/uncertain outcomes, and **never** automatically retries a provider timeout or ambiguous send. No route exists to perform an arbitrary send. Only a paid persisted result can be enqueued by the webhook integration; passing `paidAndPersisted` from any untrusted interface is prohibited. Do not log report content or customer email addresses.

## Remaining blockers / acceptance

1. Finish and release PR #262's primary Gmail grant, including genuine refresh and persisted encrypted-token verification. Do not merge it as a side effect of this PR.
2. Implement an approved owner-only worker that retrieves **existing paid native result** and uses the reusable primary sender adapter; never fetch arbitrary URL, accept raw arbitrary emails or bypass verified checkout. On owner-only preview, mail only `kimberleyaversbiz@gmail.com`, verify receipt, message ID and replay; leave secondary without send privileges.
3. Verify the outbox queue and worker together against isolated staging Redis with one controlled owner-paid fixture (or verified prior paid session) without another real charge, and tests for conflicts, lost claims, ambiguous send and explicit Gmail rejection.
4. Before any customer email: verify Google API authorization/compliance, transactional consent or proper legal basis, customer recipient binding to Stripe, unsubscribe controls for marketing messages (not transactional audit delivery), HTML escaping, privacy, support contact, deliverability, and independent owner approval. All customer sends remain disabled.
5. Reconcile pending/sent/failed states and add protected owner operator dashboard/alerts so a report is never silently lost. Then promote preview to production only after all end-to-end gates pass.

Do **not** claim full end-to-end Gmail delivery or customer-ready automation from this outbox-only release.

## 2026-10-23 — owner-only Preview delivery core added (still Draft / HOLD)

- `lib/server/quick-audit-delivery-worker.ts` now contains the disabled-by-default `deliverQuickAuditOwnerPreview` core. It requires both `VERCEL_ENV=preview` and an independently enabled `AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED=true` flag; neither is enabled by this commit.
- Only a test-mode Checkout Session and a delivery record addressed to the configured `AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL` can pass the guard. Customer addresses and live sessions are rejected, even when the feature flag is set.
- Before the Redis claim and any sender call, the worker verifies the stored completed Stripe webhook session record **and** the matching persisted native audit result. Mismatched audit IDs, request IDs, or missing reports are held without sending.
- It renders the existing five findings, improved headline, offer, promotional post, and seven-day plan as text-only email to avoid unsafe HTML rendering. A provider response is stored as `submitted`, not `delivered`. Uncertain outcomes are held and never automatically retried.
- The worker accepts a server-provided `QuickAuditTransactionalSender`; there is **no public route, Cron schedule, actual Gmail transport, customer delivery, feature-flag change, or webhook/payment call** in this release. The existing primary Gmail OAuth sender in PR #262 must be connected after it passes its own owner-only acceptance.
- New tests in `tests/quick-audit-delivery-worker.test.ts` cover default-off, production block, owner-only destination, paid-record and report integrity, one-time submission, ambiguous response, duplicate suppression, and complete text generation. Treat the implementation as code-complete only after exact-head CI succeeds.

## Reuse the existing one-time coupon; do not pay yet

Stripe TEST account `acct_1Smr2bGloGM6sjzB` already contains valid, unredeemed coupon `coupon_ams_owner_audit_pilot_20261021`: $44 off, duration once, maximum one redemption. The Preview pilot in Draft PR #290 applies this **directly**, so no promotion code or replacement coupon is required.

**Known webhook isolation blocker:** The test account still has an enabled `checkout.session.completed` destination at the **production hostname** `https://www.aspectmarketingsolutions.app/api/webhooks/stripe`. This must be independently isolated before any hosted pilot checkout. The coupon's presence does not establish safe test routing.

## Remaining release gates (unchanged)

1. Independently isolate preview Redis and test Stripe event routing from production. Do not rotate or disable existing production endpoints for a pilot.
2. Complete PR #262 owner sender OAuth/refresh persistence and integrate it with this worker behind a server-to-server authenticated preview route; never copy ChatGPT's Gmail connector grant to AMS.
3. Verify first owner-only Gmail submission **and independent inbox receipt**, persistence, replay suppression, and uncertain-send operator resolution, with no new real-money charge.
4. Add reliable queue scanning/reconciliation, alerts and customer destination binding, scope compliance, consent/suppression for relevant messages, and failure recovery before implementing customer auto-delivery. The owner-only Preview worker is not a customer sender.
5. Merge/deploy only after full exact-head CI/security checks and independent owner release approval. Production and other services remain unchanged.
