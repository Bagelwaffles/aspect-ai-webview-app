# AMS Launch Asset Registry — Stripe → Audit → Resend → Gmail → Upsells

**Verified October 27, 2026.** Applies only to existing Draft branches and protected Preview environments. This document lists provisioned resources, exact identities and remaining runtime proofs. **Asset presence is NOT permission to send, collect live payments, or publish.** No credentials, key values, customer PII, OAuth tokens or paid Checkout URLs are included.

## Operating decision

Reuse the **three existing** paid Upstash databases and **two existing** Vercel projects; do not create a fourth database or an unrelated Worker. There is no evidence that additional Redis databases are necessary for the remaining real-provider acceptance. All three databases returned `PING=PONG` on this date. All key writes, customer record operations and payment flows remain gated.

## Physical stores — Upstash (metadata-only inventory)

| Use | Existing database | Database ID | Host | Plan/state | `DBSIZE` on inventory |
| --- | --- | --- | --- | --- | ---: |
| Main TEST audit pilot | `ams-main-test-audit-pilot-preview` | `29cec591-1f84-450a-8d64-e0b684ca6a32` | `pretty-crab-239388.upstash.io` | paid / active | 1 |
| Gmail/scheduled-task Preview and non-payment domain proof | `ams-scheduled-tasks-preview` | `1ab3b3ae-d427-4453-8f2a-ffe1b656685b` | `accepted-quetzal-206056.upstash.io` | paid / active | 52 |
| Isolated Stripe receipt and audit pilot | `ams-stripe-audit-pilot-preview` | `94009b86-eed9-4c43-be83-64227e5164e0` | `internal-chicken-238070.upstash.io` | paid / active | 1 |

- All three responded `PONG`; their original keys and resources remain intact.
- **OWNER-APPROVED SPENDING CAPS VERIFIED on October 27, 2026:** the main TEST audit database retained its original **$20/month** cap. The scheduled-tasks Preview database (`1ab3b3ae-d427-4453-8f2a-ffe1b656685b`) and Stripe audit Preview database (`94009b86-eed9-4c43-be83-64227e5164e0`) each received a new **$20/month** cap through the Upstash budget API (both writes returned `OK`). A separate `redis_get_database` for **each** database read back `budget=20`, `auto_upgrade=false`, and `state=active`. All three responded `PONG` and preserved their original `DBSIZE` counts **1, 52, 1** respectively. No new database or billing-tier upgrade was made.
- The three monthly caps total **$60/month as a maximum combined limit for these three Redis databases**, not as a charge or guarantee of availability. Upstash can rate-limit individual databases at the spending cap; monitor 70%/90% warnings and keep critical acceptance in bounded windows. Do not increase/remove caps without a new explicit budget approval.
- These databases are NOW listed as paid. Historical notes referring to the scheduled-tasks database as "free" are stale. Update future acceptance notes accordingly.
- REST tokens and database credentials are never copied from one store to another without an explicit audited migration and identity check. The Resend **proof** store may use the named non-payment namespace on the scheduled-tasks database, but must not be represented as a physically isolated payment store.
- A newly created disposable database `amspr295drill20261027a` was previously deleted and independently returned 404. **Do not recreate it**; it is not a launch dependency.

## Application / ingress — Vercel

| Project | ID | Role | Control |
| --- | --- | --- | --- |
| `aspect-ai-overlord` | `prj_ovsfsfElhC0eywpVlk3dHSBi4qFZ` | AMS Next.js application and protected Preview acceptance | Vercel authentication protection is enabled except custom domains; don't create a public bypass |
| `ams-stripe-ingress-sandbox` | `prj_oFp6cC0HNFfwfCq98WJHrF19k7Ig` | Existing independent signed, receipt-only TEST ingress | SSO protection previously verified, intake disabled after #306 acceptance; webhook receipt ≠ audit fulfillment |

- Draft [PR #300](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/300) branch: `feat/ams-resend-transactional-preview-20261023`. Its Stripe and Resend keys already existed in Vercel; those keys' **presence** was read without decrypting or validating bearer secrets.
- Draft [PR #262](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/262) branch: `feat/scheduled-task-migration`. Its OAuth keys already existed. Existing scheduled tasks and owner grants are unchanged.
- Do not change Production environment, aliases, original webhooks, domain or OAuth callbacks in order to mask an incorrect Preview route. Env changes require a properly scoped Preview redeployment to take effect.

## New Vercel Preview configuration assets (created and independently re-listed)

**Branch: PR #300 only**, each one `target=preview`, exact branch scope and **plain `false`**. Nothing was enabled:

| Setting | Persisted value |
| --- | --- |
| `AMS_STRIPE_PILOT_FULFILLMENT_ENABLED` | `false` |
| `AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED` | `false` |
| `AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED` | `false` |
| `AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED` | `false` |

**Branch: PR #262 only**, exact `target=preview`:

- `AMS_GMAIL_INQUIRY_ALIAS=kimberley@aspectmarketingsolutions.app` is an exact-match *inbound To-address* allowance, **Preview-only by source guard**. Not a Gmail Send-As identity and not a business-domain sender grant.
- `AMS_GMAIL_POLICY_APPROVED=false` is deliberately restrictive. Existing `AMS_GMAIL_AUTOREPLY_ENABLED=false` remains unchanged. Existing `AMS_GMAIL_SEND_ENABLED` is `true` in the historical Preview configuration, but the stricter auto-reply gate still blocks unattended responses. Don't portray sender grant/scope presence as verified outbound production compliance.

## Isolated Stripe sandbox catalog — newly provisioned / provider readback PASS

**Sandbox:** `acct_1UTtFMGuhFCl8JHa`, Stripe `livemode=false`. Confirmed that before provisioning the isolated sandbox held **one** $49 Quick Audit TEST product/price. It now has **seven** active TEST prices/products, one unchanged audit and six new upsell items. No customer, charge, subscription, payment link, coupon or Checkout Session created.

| Offer | Price ID | Amount | Charge type | Validation |
| --- | --- | ---: | --- | --- |
| Existing Quick Marketing Audit | `price_1UTu1FGuhFCl8JHacYf5y5BL` | $49 | one-time | Original untouched |
| Starter / 100 monthly credits | `price_1UVHFfGuhFCl8JHa7iFzzPSh` | $29 | monthly | `AMS_STRIPE_PILOT_STARTER_PRICE_ID` |
| Growth / 500 monthly credits | `price_1UVHGBGuhFCl8JHaHU3finKH` | $79 | monthly | `AMS_STRIPE_PILOT_GROWTH_PRICE_ID` |
| Pro / 1500 monthly credits | `price_1UVHGNGuhFCl8JHaFhwYQSYW` | $149 | monthly | `AMS_STRIPE_PILOT_PRO_PRICE_ID` |
| Extra 100 credits | `price_1UVHGTGuhFCl8JHa9DMlkXx3` | $19 | one-time | `ams_credit_topup_100` |
| Extra 300 credits | `price_1UVHGYGuhFCl8JHaa9ou0jb6` | $49 | one-time | `ams_credit_topup_300` |
| Extra 1000 credits | `price_1UVHGfGuhFCl8JHadAVsXIu0` | $129 | one-time | `ams_credit_topup_1000` |

All six new IDs are also registered under **Preview-only and sandbox-prefixed** Vercel variables on PR #300:
`AMS_STRIPE_PILOT_STARTER_PRICE_ID`,
`AMS_STRIPE_PILOT_GROWTH_PRICE_ID`,
`AMS_STRIPE_PILOT_PRO_PRICE_ID`,
`AMS_STRIPE_PILOT_TOPUP_100_PRICE_ID`,
`AMS_STRIPE_PILOT_TOPUP_300_PRICE_ID`,
`AMS_STRIPE_PILOT_TOPUP_1000_PRICE_ID`.

- Provider readback verified six new amounts, `USD`, three monthly recurring prices, three one-time prices, `livemode=false` and `active=true`. Every credit top-up uses the precise lookup key and `offer_type=credit_topup`, `topup_units`, `subscriber_only=true`, `non_expiring=true` on both product and price as required by `lib/server/credit-topup-checkout.ts`, plus `checkout_enabled=true` on TEST product metadata. TEST catalog visibility does **not** enable production sales.
- Do **not** substitute the sandbox-prefixed IDs into the general/live `AMS_STRIPE_STARTER_PRICE_ID`/Growth/Pro entitlements; those use the app's separately verified Stripe account and credential. No cross-account price ID mixing.
- Subscription lifecycle and credit-balance top-up fulfillment must still pass idempotent, signed TEST webhook/evidence and ownership assertions before public upsells. Android WebView credit purchases remain excluded by the existing Google Play billing control.

## Resend (transactional, distinct from Gmail)

- Company domain `aspectmarketingsolutions.app` had previously passed verification, and Preview branch has sending-only key and domain-ID environment **records**. This read-only inventory did not independently query the current Resend provider domain state, sender validity or mail deliverability. **Current external provider proof: PENDING.**
- Current code uses a short-lived, owner-authorized, independently persisted domain status attestation; intentionally do not create fake/permanent proof keys. Its 15-minute expiration requires a real owner-only refresh near the *actual* sending attempt.
- Only the owner-controlled recipient should be eligible in initial Preview dispatch. Confirm true provider acceptance plus independent inbox receipt; a Resend API 200/message ID is **not** email delivery proof.
- Resend is the planned branded transaction sender; owner Gmail OAuth is **not** an approved substitute for sending branded mail from the company-domain address.

## Google, Cloudflare and customer inquiries

- Cloudflare Email Routing forwards the public AMS business address to primary Gmail. Preview exact alias metadata is configured; a real inbound message header must still be observed. Gmail read grants, natural refresh and monitor were previously accepted, but policy for production restricted Gmail scopes and branded Send-As must be separately checked.
- The current public `/contact` page offers product paths; it is **not** a functional contact-submission form. No new contact intake endpoint has been invented by this registry. An incoming-email test and its generic, idempotent acknowledgement must be proven separately from a paid audit.
- Secondary Gmail stays monitoring-only. Preserve all 27 existing owner scheduled tasks and their paused/completed state. No unrestricted AI reply, auto campaigns or promotional mail enabled.

## Required owner-controlled operational acceptance, in order

1. **Read-only identity matrix:** in the protected Preview, verify that the existing Stripe pilot URL+token belong to the *intended physically separate* Stripe test database, not the scheduled-tasks proof DB or Production. Do not expose any secret during this check. Distinguish Vercel env existence from runtime connectivity.
2. **Protected intake:** deploy the exact Draft branch under Vercel SSO and confirm security deny defaults. Set bounded Preview-only fulfillment/outbox flags **only** during owner-approved acceptance, not now.
3. **Genuinely eligible TEST order:** old `#306` receipt-only $49 Checkout lacks required `ams_offer`, request ID and business metadata; it can never count as real audit fulfillment. Reuse the code regression as negative proof. Only owner-approved new, valid TEST order may create actual paid audit, after independent rollback and endpoint isolation.
4. **Audit/outbox:** verify exactly one durable `native-v1` report, five findings, seven-day plan, matching paid Checkout/event/request and one queued recipient-approved email, including replay/concurrency deny tests.
5. **Resend receipt:** after fresh real domain proof and explicit test send approval, deliver one owner-only report through branded Resend, read actual inbox and verify sender/reply-to/authentication, no duplicates; switch sending OFF afterward.
6. **Inbound inquiry:** separately send one real test message to public AMS address from non-monitored external owner-controlled address, independently read Google monitor and verify any generic reply at most once, with consent and sender identity gates resolved.
7. **Upsells:** test sandbox subscription and credit pack catalog against actual entitlement grants, replays, rate limiting, proration, refund and cancellations. Do not treat catalog creation as completed upsell checkout or LIVE readiness.
8. **LIVE $5 final gate:** owner will run one $5 live transaction **only when exact payment mechanism, discount, taxes/refund handling and provider-level fulfillment are green** and owner explicitly approves that amount and Checkout. Never change $49 public price or silently use a separate $5 product as an audit payment.

### Readiness and cost decisions

- **Physical assets created this session:** ZERO new Upstash DBs, ZERO new Vercel projects; six new TEST-mode Stripe products/prices, twelve new exact-branch Preview env entries.
- **Previously present resources preserved:** all three existing Upstash DBs, both Vercel projects, live Stripe products/webhooks, owner OAuth accounts, Resend sender key, 27 tasks, Vercel protection.
- **Still requires explicit external/provider proof:** Stripe-origin *eligible* TEST fulfillment, signed webhook-to-native audit handoff, actual inbox Resend delivery, Google compliant customer-facing replies, validated subscriptions+topups, live launch checklist.
- **No cost is incurred merely by creating Stripe product/price catalog or Vercel variable records**; Upstash databases are paid and may incur metered usage. No new database was created. In a subsequent owner-approved cost-control step, **two existing Preview databases received $20 monthly caps each**; the main audit DB already had $20. These limits were independently read back and all three original DBs passed `PING`.
- **Stop criteria:** never mark customer-facing pipeline LIVE solely because these assets exist. Keep #262/#275/#300/#306 Draft and all Production changes on HOLD until independent acceptance plus explicit deployment authorization.

**Single-source rule:** Use this registry for asset identities; use [automated revenue integration runbook](./ams-automated-revenue-loop-20261027.md) for each stage's functional acceptance. Do not recreate existing resources when a runtime binding, policy decision, branch-deployment reload or owner-only provider verification is the actual missing step.
