# AMS Audit-on-AMS — Pilot Evidence and Acceptance
Prepared 2026-10-21. **INITIAL DESK REVIEW; NOT A COMPLETED PAID AUDIT, NOT A PRODUCTION END-TO-END PASS.**

## Pilot subject
- Business: **Aspect Marketing Solutions**
- Website: https://www.aspectmarketingsolutions.app/
- Audit offer: https://www.aspectmarketingsolutions.app/quick-marketing-audit
- Industry: marketing SaaS / AI-assisted marketing and services
- Goal: improve the clarity and trust of the path from public site → paid $49 audit → optional implementation quote.
- Source type: publicly rendered content and main-branch repository code. Current live deployment state and payment-ready runtime flags have not been independently verified by this document.
- Public source captures used in preflight: home indexed on 2026-10-21; audit page copy indexed earlier and verified separately in the 2026-10-21 main-branch source. **Re-fetch both on the actual pilot execution date** before treating observations as current.
- This is a self-audit for acceptance and should be reviewed critically. There are **no conversion, revenue, traffic or search-performance baselines** in the evidence.

## Five priority opportunities (supported observations vs. hypotheses)
### 1. Marketing-audit value proposition is buried among platform messages
**Observed:** Public home lead reads "Marketing feels easier when the right work is automated" and presents seven live agents alongside the $49 audit, with an agent-first CTA and a separate audit CTA. Source: https://www.aspectmarketingsolutions.app/ . The product catalog and automation categories are extensive.
**Hypothesis, NOT established fact:** Some visitors may not immediately understand whether AMS is selling software or marketing services.
**Fix:** Add an explicit "Done-for-you audit" bridge from home to sample report and make the audit result/implementation boundary unmistakable. Run an A/B test only with consent-safe genuine event data.
**Illustrative before:** "Start with seven production-verified AI agents from $29/month, or choose the $49 Quick Marketing Audit."
**Illustrative after:** "Not sure what's holding your marketing back? Start with five evidence-backed fixes and a seven-day action plan for $49. Use our tools—or ask AMS to implement the fixes separately."
**Effort:** Low/medium copy and journey restructure. **Impact:** unmeasured.

### 2. Current audit page opens with an internal status rather than customer proof
**Observed:** Audit hero labels itself "First live AMS revenue offer" and includes a section "Why this is the first AMS offer" describing staged automation work. Source: https://www.aspectmarketingsolutions.app/quick-marketing-audit and `app/quick-marketing-audit/page.tsx`.
**Hypothesis:** Technical launch context may distract customers who primarily need a clear, credible service.
**Fix:** Replace internal-stage copy with the method, evidence, exact scope and limitations. Keep the essential honesty about what is live; do not invent fulfillment autonomy.
**Effort:** Low copy change; gate public publication on verified native delivery.

### 3. No example visual report is linked on the current paid offer
**Observed:** The main audit page advertises five findings/fixes, improved headline/offer, one post and a seven-day plan, but no sample report appears in main-branch audit page source. Source: `app/quick-marketing-audit/page.tsx`.
**Hypothesis:** An honest preview may lower uncertainty before purchase.
**Fix:** Add the deliberately fictional `/quick-marketing-audit/sample` page on an isolated branch, then link only after accessibility, visual and claims review. Never present a fictional sample as a customer success story.
**Effort:** Medium UI/QA.

### 4. Report choices and audiovisual guidance are not currently buyer-selectable
**Observed:** Main checkout currently collects business name, site, industry, goals and notes. The results client offers a browser view, HTML download and print/save-to-PDF. There is no current format selector or personalized narrated walkthrough. Sources: `components/quick-audit-checkout-form.tsx`, `app/quick-marketing-audit/thanks/QuickAuditResultClient.tsx`.
**Fix:** Versioned customer preferences, same canonical report dataset, tested accessible PDF, later optional slides/video with transcript and separately disclosed production cost. Do not market unimplemented formats.
**Effort:** Medium/high depending on video.

### 5. No completed-audit implementation request funnel yet
**Observed:** Results client lists findings and plan, but not a "have AMS fix this" selection to create a nonbinding scoped quote. Source: `app/quick-marketing-audit/thanks/QuickAuditResultClient.tsx`.
**Fix:** Let customers select verified recommendations and request an implementation scope/quote. Do not modify accounts, bill, or post content without a separately approved service agreement and permission.
**Effort:** Medium frontend/workflow, high full operational integration.

## Data that cannot be inferred from this review
- Real unique visitors, leads, paid conversion rate, sales lost, ad efficiency, ROI, ranking performance, demographics, support satisfaction.
- Whether every CTA, analytics event, OAuth provider or email adapter works in the production runtime.
- Whether the current internal staging infrastructure has private Redis and webhook isolation fully configured.
- Whether a real buyer would pay more for a video or implementation until sampled with consent.

## Critique of current native audit methodology
- `collectQuickAuditEvidence` presently fetches and regex-checks HTML. It may misclassify client-rendered content, false negatives due to dynamic rendering, and false positives due to navigation/footer text.
- `buildNativeQuickAuditResult` fills to five findings with strategic suggestions if fewer directly evidenced problems exist. These **must not** be mislabeled as verified failures.
- LocalBusiness schema should not be required for a national SaaS vendor without a local discovery strategy.
- Manual QA must inspect findings for truth, relevance and correct labeling before announcing that AMS delivers "professional-grade autonomous audits."

## Private test-mode pilot steps
1. Build and inspect sample in Vercel Preview. Run typed/lint/test/build/secret scan checks.
2. Obtain owner-verified preview admin login. Configure distinct private preview Redis, test Stripe secret/test $49 audit price, and signed **test-mode** webhook routing only to the preview. Prevent production data writes or notifications.
3. **ALREADY CREATED in the original AMS account TEST mode:** one $44 off coupon for the original $49 test audit price, duration once, USD, max redemptions=1, ID `coupon_ams_owner_audit_pilot_20261021`. Coupon is not redeemed. **This does not establish safe webhook routing; do not use it to open a real hosted test session yet.**
4. Set `AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL` to the existing verified owner identity, `AMS_QUICK_AUDIT_OWNER_PILOT_COUPON_ID` to the test coupon, and only then `AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED=true` plus `AMS_QUICK_AUDIT_FULFILLMENT_READY=true` in the isolated Preview. Do not set public-sales flag or live keys.
5. Open protected `/dashboard/quick-audit-pilot`; submit prepared AMS intake. Confirm Stripe Checkout explicitly says **test mode**, amount $5. Use only Stripe's **test card** data, never a real card.
6. Verify exactly one paid TEST Checkout Session, matching original $49 audit price line item + $44 coupon, valid signed webhook, one native audit result in PREVIEW Redis, correct result view, print/PDF, no PII leaks, one duplicate replay without second fulfillment.
7. Have the owner inspect the five recommendations against the actual public pages, explicitly recording true vs hypothetical findings. Mark acceptance PASS only when useful, accurate and attractive.
8. Verify mock implementation CTA cannot charge or mutate external platforms. Keep the pilot gate and all external sends OFF when not actively testing.
9. Only after all gates pass, independently consider a **legitimate external live-customer purchase** as live acceptance, using the normal $49 public price or a separately approved customer promotion. Do **not** use the business owner's real card to stage self-payment testing.

## 2026-10-21 controlled continuation — current safety gates

- Existing main-account **test-mode** Stripe webhook points to `www.aspectmarketingsolutions.app` (production domain).
- A *separate* AMS Stripe sandbox account is available but has **two enabled webhook destinations**, including the production-domain AMS endpoint and an existing worker. This is **not** an isolated sandbox payment path.
- The connected Upstash account contains only `ams-scheduled-tasks-preview`, already used by another Preview workflow. Pricing confirms one free database per free tier. **No second potentially charged database was provisioned, no shared preview credentials copied.**
- Current branch-specific Preview environment variables: test price ID and one-use coupon ID present; `AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED=false` and `AMS_QUICK_AUDIT_FULFILLMENT_READY=false`. Google owner login, signed test webhook, test key and private Redis are not yet configured for this specific branch.
- Signed webhook validation and secure result lookup are covered by existing fixtures; a new explicit AMS-on-AMS synthetic test also checks Checkout intent → one native result → duplicate suppression → private lookup. Mock tests are **not** evidence of a hosted Stripe delivery.
- Prior exact commit built in both Vercel projects and passed secret scans. GitHub reconciliation on later commits encountered **registry transport failures** during Corepack and dependency audit; the feature branch now includes fail-closed network-only retries. The most recent exact-head verification status must be rechecked.
- **The paid test is on HOLD.** Isolate a fresh Stripe sandbox with no production-domain webhook subscriptions (or explicitly verify all event listeners have no side effects, with evidence and owner approval), plus an isolated no-charge Redis fixture, owner OAuth and signing secret, before enabling Preview flags.
- Never point Stripe test events at the live AMS audit webhook, change production Stripe subscriptions, or reuse the other task Preview Redis merely to make a test pass.
- The report currently includes five actionable findings with automated-signal vs. strategic labels, source URL + timestamp where applicable, and the existing HTML/print report. Dedicated video narration, slides and polished dedicated PDF generation remain **future work**.

## Critical warning
Stripe's official testing documentation warns that real payment method data must not be used to test in live mode. The separate owner preview flow is **sandbox-only** and deliberately will not issue a real charge. This cannot prove a live production acquiring/payout event, but it can verify payment/webhook/application behavior without prohibited card testing.
Documentation: https://docs.stripe.com/testing

## Gates / current status
| Gate | Status | Notes |
| --- | --- | --- |
| Public-site preflight | LIMITED REVIEW | Rendered pages and code inspected, not runtime or metrics |
| Fictional sample asset | BRANCH CODED, VERCEL PREVIEW BUILDS READY | Browser accessibility review and actual route confirmation pending |
| Owner preview test screen + API | BRANCH CODED | Disabled; now includes read-only seven-gate owner diagnostic |
| Unit tests | CODED / NOT YET VERIFIED | Exact-head GitHub CI needed |
| Production/webhook isolation | NOT VERIFIED | Must be proven with private Preview data |
| $44 TEST coupon | CREATED AND UNREDEEMED | Existing main account test mode only; one redemption; **do not use until webhook isolation** |
| Test paid Checkout | NOT RUN | Owner must complete sandbox test interactively |
| Audit generated automatically | NOT PROVEN IN PILOT | Needs signed test webhook result |
| Premium PDF/video/slides | NOT VERIFIED | Future milestones |
| Live external-customer payment | NOT RUN | Separate approval and genuine purchase |

**Acceptance:** Never translate a green mock/unit suite or public screenshot into "live payments and autonomous delivery work." Capture one valid end-to-end test and manual professional-quality review before calling the pilot complete.
