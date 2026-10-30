# AMS Quick Marketing Audit — one production go/no-go checklist
**Prepared:** 2026-10-29 | **Status:** HOLD — no live customer launch authorization
**Owner tracker:** [Issue #313](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/313) | **Report upgrade:** [Issue #288](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/288)

## Do not repeat already accepted paid TEST checkout

**Isolated TEST account:** `acct_1UTtFMGuhFCl8JHa`. This is NOT the original main LIVE account `acct_1Smr2bGloGM6sjzB`. Two historical TEST purchases served different acceptance stages:
- [Oct 25 receipt-only TEST](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/306#issuecomment-6405822071) proved genuine Stripe-origin signed receipt/duplicate durable intake; intentional HTTP 503, no fulfillment.
- [Oct 28 audit-eligible TEST](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/300#issuecomment-6484887604) reused its existing completed $49 payment and immutable event to prove: signed receipt, one native-v1 audit, one durable outbox, ACK, same-event HTTP 200 retry and replay suppression.
- [Oct 28 owner inbox delivery](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/300#issuecomment-6485595907) proved Resend business-domain authentication and exactly one owner-only audit mail reaching Gmail (Promotions category, not promised Primary).
- Cleanup: temporary admin credential revoked, one-time authorization expired, both sandbox destinations disabled, Preview checkout/handoff/fulfillment/outbox/send OFF, gateway protected, no Production mutation. None of these TEST orders count as genuine customer revenue.

**Avoid creating a third test checkout or charging a real card as a rehearsal.** No live self-payment without a separate, reviewed authorization. Never treat the earlier #295 separate Redis ACL experiment as an unmet requirement for the successful #300/#306 audit acceptance.

## Upgrade release acceptance (not yet signed off)

| Gate | Current evidence | Required before release |
| --- | --- | --- |
| Real report baseline | Main native-v1 result includes five finding/fix pairs, strengths, headline, offer, post, seven-day plan; authorized result UI supports HTML and browser Print/Save PDF | Confirm exact currently supported artifacts and truthful sales copy; avoid premium file/video claims |
| Executive snapshot | Draft PR #315 adds first three stored priorities and counts using existing native-v1 data | Exact-head CI/secret scan and protected Preview/mobile/print review; old records readable |
| Machine evidence | Draft #315 shows recognized page signals as detected / not detected / not verified; no invented traffic, sales, scores or ROI | Verify actual private paid-result fixture; missing/null older data; ensure no unsupported citation/metrics claims |
| Premium presentation | Issue #288 requests evidence references, accessible PDF, slides, narrated walkthrough, optional format choice | Scope, implement, and individually accept each actual artifact; **do not** turn on slides/video selection until generated/QA-proven |
| Authorization | `/api/quick-marketing-audit/result` currently verifies a complete paid Stripe session ID, expected price and request ID before reading the result | **Partial mitigation in Draft #315:** thanks page explicitly noindex/nofollow; its HTML and the result API receive no-referrer, noindex and private no-store response headers; the result API rejects mismatched verified Stripe-request and stored result IDs. **Still blocked for LIVE:** possession of a Stripe session ID in a query string can disclose a customer report. Add and validate a buyer-bound or scoped expiring access mechanism, verify referrer and analytics behavior, cross-device delivery, expiry/revocation and data privacy before claiming private customer access. No customer-sensitive data in analytics or error logs |
| Real checkout | Original LIVE Stripe integration exists; public $49 checkout is gated by live infrastructure and a Redis launch key | Verify right *main account*, exact LIVE product/price, amount, webhooks, raw-body Stripe signature, metadata, one durable order and event; no inherited sandbox destination |
| Runtime fulfillment | In isolated TEST Preview, signed event → native-v1 report/outbox/ACK/replay PASSED | Confirm exact production runtime, Redis identity, idempotency, quality threshold, delivery SLA, failure recovery and provider/cost limits; no silent n8n dependency |
| Transactional delivery | One owner-only Resend Preview audit delivered, authentication passed | Verify safe customer recipient authorization, customer emails only for paid orders, sender domain, suppression/retry/idempotency, bounce and dispute support. Never equate Resend with the unverified Gmail restricted-scope workflows |
| Customer protections | Existing checkout is fail-closed; other subscription PRs Draft | Privacy, terms, refund/chargeback/support path, incident/on-call owner, contact route, data retention and secure report access before switching the public flag |
| Upsells | Proposed $29/$79/$149 plans and $19/$49/$129 packs are configured only in separate TEST sandbox; other quote offers are hypotheses | Only truthfully show supported, explicitly consented, provisioned entitlements; no auto-enrollment or billing based on audit completion |
| Google | Branding verified but restricted Gmail scope verification incomplete | Keep Gmail owner-monitoring and restricted-scope send controls separate and OFF. Resend approved transactional domain is not a substitute for unverified Google permissions |
| Mobile | Google Play track is not a dependency for first web revenue | Finish independently after core customer experience is proven |

## Buyer report access — new isolated Draft implementation (NOT ENABLED)

New source in Draft #315: `lib/server/quick-audit-report-access.ts`, result handler and customer result UI. A separately configured `AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED=true` can require a purpose-specific signed HMAC token bound to exact verified checkout session ID, request ID, and normalized buyer-email hash. Token lifetime: **14 days**. The UI extracts `#report_token=<opaque-token>` from the email link's **fragment** (not server query), removes it from history, and sends it in an Authorization Bearer header. Missing/mismatched/expired/tampered tokens fail closed. A missing or short `AMS_QUICK_AUDIT_REPORT_ACCESS_SECRET` fails closed with 503. Neither signing secret nor link is created automatically; code mints tokens **only through an internal trusted helper**, never a public mint endpoint.

**Still NOT complete:** #300's proven sender is owner-only Preview and currently sends the report *body*, not a signed link to real buyers. Before activating this gate, integrate token generation *after* the verified paid live order with the production-authorized Resend transactional sender, and deliver to the **same Stripe checkout email** only. Protect secure-link message content from logs; independently test the actual recipient and wrong-buyer denial. Ensure customers can retrieve the report after token expiration via a safe reissue process; verify security for browser back/refresh/cross-device, and support. Do not set either gate/secret in live Production or claim launch-ready without these proofs. When gate is OFF, legacy session-ID access remains for compatibility and is not fully buyer-bound.

## LIVE Stripe read-only identity proof

Official connected main LIVE account: `acct_1Smr2bGloGM6sjzB`, distinct from isolated TEST sandbox. Two active LIVE one-time **$49** prices exist and must NOT be mixed:
- Quick Marketing Audit: `price_1U0wqxGloGM6sjzBGDu7MhHR`, product `prod_V0yop4P1DLZZDH`.
- Unrelated subscriber 300-credit top-up: `price_1U8XfmGloGM6sjzBgXQbvpGy`, product `prod_V8pKAwcWMGb6br`.
The original main LIVE Stripe webhook `we_1U2Z2UGloGM6sjzBMzAIZJT6` is enabled for `https://www.aspectmarketingsolutions.app/api/webhooks/stripe`; two other historical LIVE destinations were disabled at last read. These are provider configuration facts, NOT proof the native audit/email release is wired in Production. Verify actual environment variable binding and product ownership, not just matching price amount.

## Go/no-go order — review, not an instruction to execute

1. **Read-only discovery:** check final exact heads, CI, Vercel PREVIEW readiness, domain status, security gates, pending Stripe endpoint lists and rollout notes. Reuse existing asset registry `docs/acceptance/ams-launch-assets-registry-20261027.md` in Draft #300.
2. **Validate upgraded output:** authorized old/new native-v1 fixtures in protected Preview on phone and desktop; render online + export + print; inspect copy, evidence coverage, accessibility and privacy. Do not pay again. PR #315 stays Draft pending review.
3. **Converge STACKED changes deliberately:** inspect bases and selected commits across #282/#295/#299/#300 and isolated #306; don't merge experimental test gateway, old sample $5 coupon code, or disabled Gmail automation indiscriminately. Document exact intended production diff and migration dependencies.
4. **Independent final commercial preflight:** LIVE account/price/webhook endpoint identity, durable Redis, auth, result link safety, rate/cost controls, refunds/support, email identity and consent, replay prevention, fulfillment quality. Validate rollback plan and owner alert route. A passing sandbox is necessary evidence, not production certification.
5. **Owner-controlled release:** only after explicit scoped authorization for production merge/deploy, environment toggles and actual customer charging; stage a deployment with correct release protections, verify, then promote tested build and monitor. Do not flip switches merely because this doc exists.
6. **First real non-owner buyer:** count revenue only once LIVE Stripe actually confirms paid, correct amount/price, successful authorized personalized delivery and no refund. Monitor failures and support events, then grow via honest advertising and consented offers.

## Operational stop conditions

Stop before activation if billing account/price mismatch, untrusted public bypass, credentials exposed, unexpected webhook, stale/missing deployment check, unknown Redis identity, missing durable audit or customer access isolation, email recipient ambiguity, absent rollback, unapproved paid customer attempt, or external privacy/compliance blockers. Preserve original production runtime and customer state; never close historical evidence just to make an issue list appear green.

**No production merge, live payment, active webhook, customer email, new vendor resource or paid ads are authorized by this document.**
