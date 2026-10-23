# AMS Quick Audit delivery — security integration acceptance (2026-10-23)

**State: Draft / Preview only. Not a release approval or customer-mail acceptance.**

## Existing verified foundations

- Keep the existing $49 Quick Marketing Audit Checkout, signed Stripe webhook, native report, and paid result lookup unchanged. Do not repeat a previously passed Stripe payment.
- The owner-only test coupon already exists in **main AMS Stripe test mode**: `coupon_ams_owner_audit_pilot_20261021`, $44 USD once, max one redemption, unused as of October 23. It is applied directly by draft PR #290; it is not a user-entered promotion code.
- Draft PR #282 adds one-record-per-audit durable delivery queuing plus guarded owner-only Preview worker core and unit tests. It does not include a live authenticated route or Gmail transport.
- This branch reuses the exact `package.json` and `pnpm-lock.yaml` blobs from draft PR #294, patching `next` and `eslint-config-next` to **15.5.28** without lockfile regeneration or production changes.

## Re-check security gate

CI on PR #282's previous head was blocked by pnpm dependency audit on October 23 (one critical, three high, four moderate). The high/critical issues included `next` before 15.5.28 and `zod` 3.25.76, whose advisory points to patched Zod >=4.6.6.

The Zod fix is a **major-version compatibility decision**, not a safe blind override. It may affect the AI SDK, `@vercel/sandbox`, importers, validation semantics, and runtime behavior. Do not ignore or downgrade the pnpm audit. Evaluate and independently test a supported patch rather than claiming security is resolved because Next.js is updated. If audit fails, capture the actual advisory list and mark the combined branch blocked.

## Owner test gates still required

1. Main AMS **test-mode Stripe** has an enabled `checkout.session.completed` webhook targeting `https://www.aspectmarketingsolutions.app/api/webhooks/stripe`. **Do not create a hosted checkout or redeem the coupon** until event destinations are independently isolated from production.
2. The public site's Redis must not be used as the test database. Branch-scoped Preview settings on PR #290 are *configuration metadata*, not proof of independent datastore isolation.
3. Add the separately authorized primary Gmail sender (PR #262) through a protected server-to-server Preview route and verify encrypted-grant refresh and receipt; do not copy tokens from ChatGPT or connect the monitoring-only secondary account as a sender.
4. For one owner-only Preview delivery, require exact paid-result match, content checks (five findings and seven-day plan), provider submission ID, independent inbox receipt, replay suppression and an operator-visible recovery path.
5. Customer-facing automatic delivery requires separate customer destination/consent, verified sender reputation, alerts and failure recovery. No customer email is authorized by this document or branch.

## Explicit no-change bounds

No production merge, release, Vercel environment mutation, Stripe payment/price/coupon/webhook mutation, real customer mail, domain or OAuth change, n8n/Android/Twitch change, or shared Redis credential reuse.

**Verification distinctions:** Code committed is not CI passed; CI passed is not hosted Preview working; provider message acceptance is not inbox receipt; inbox receipt in a controlled owner test is not customer release readiness.
