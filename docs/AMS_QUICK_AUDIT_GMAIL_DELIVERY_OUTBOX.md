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
