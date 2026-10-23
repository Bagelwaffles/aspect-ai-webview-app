# AMS upsell ladder — audit, Live agents, subscriptions, roadmap

**Status:** Draft proposal and feature-flagged code. Not a price approval, entitlement change, production launch, advertising instruction, campaign enrollment, or authorization to charge.

## Commercial source of truth checked 2026-10-23

Stripe LIVE primary AMS account:
- $49 Quick Marketing Audit: existing active one-time price `ams_quick_marketing_audit_49`.
- Existing active Starter/Growth/Pro monthly price points: $29/$79/$149. All seven currently Live agents are included within every plan's monthly shared-credit pool.
- Existing subscriber-only, web-only one-time credit top-ups: 100 credits $19, 300 credits $49, 1,000 credits $129. Do not invent an extra standalone agent access fee.
- Staged and retired legacy creator, SMS, NFT, Command Center and individual-agent products remain **inactive**. Avoid recreating or relaunching them without product-readiness approval.
- Main AMS TEST account's existing one-use owner pilot $44-off coupon is separate from commercial upsells; it remains for isolated Checkout testing, not an upsell price reduction.

Published AMS pricing page and `lib/subscription-agent-catalog.ts` corroborate the current seven agent slugs.

## The $49 Quick Marketing Audit: scope-first implementation ladder

A completed audit is valuable on its own. Only after the paid result is verified and visible may a customer optionally request:
| Offer | Starting quote | Bounded work | Customer authorization |
|---|---:|---|---|
| Quick Fix | $149 | One agreed homepage headline, primary CTA, on-page metadata, or comparable bounded fix | Written quote / SOW and specific access |
| Growth Sprint | $499 | Up to three agreed fixes with review and limited revisions | Written quote / SOW, customer approves changes |
| Full Implementation | $999 | Up to five individually scoped fixes; not a whole-site rebuild by default | Written quote / SOW and acceptance criteria |
| Ongoing AMS management | Quoted, or existing $29/$79/$149 SaaS plans for self-service | Monitoring, agreed content, periodic changes within an approved plan | New subscription agreement or scoped service order |

Prices are **starting proposals**, NOT active Stripe prices, and must be validated against labor, support costs and capacity before launch. No automatic $49 audit credit, no forced upsell, and no automatic implementation charge.

### Existing request path reuse
The draft audit result component shows three cards **only after** the verified audit has completed, and **only** when `NEXT_PUBLIC_AMS_UPSELLS_ENABLED=true`.

Each card links to the existing `/ethical-agent-farm/request?offer=business-cleanup-plan&package=<allowlisted-package>`, passing a predefined scope explanation to the notes field. The existing backend's `selectedOffer` remains the accepted `business-cleanup-plan` key; package type travels as a **quoted request in notes**, not as a new backend enum, Stripe product, price, or payment authorization. The backend's actual persistence and response still require testing in isolated Preview. Invalid package values are ignored.

*Important:* The quote request itself needs an operator response. Don't advertise implementation as immediate fully automated fulfillment until operator acceptance and execution have been independently validated.

## All seven verified Live agents: outcomes, not duplicate entitlements

| Agent | Optional next outcome | Current verified request or checkout |
|---|---|---|
| Content | Done-for-you Social Content Pack | Existing request-only `social-content-pack` |
| Lead Magnet | Offer + landing conversion cleanup | Existing request-only `business-cleanup-plan` |
| Email Campaign | Larger/shared-credit plan or separately scoped campaign support | Existing subscription pricing page |
| Nurture | Ongoing marketing and higher shared-credit capacity | Existing subscription pricing page |
| Outreach | Offer + follow-up process cleanup | Existing request-only `business-cleanup-plan` |
| SEO | Website / Google Profile Review | Existing request-only `website-profile-review` |
| Product Creator | Product positioning / launch checklist | Existing request-only `business-cleanup-plan` |

These are optional next outcomes; every currently Live agent remains accessible within the active, verified subscription offering. No plan upgrade or second charge occurs from viewing an agent page.

## Rest of the 33-agent catalog: create the offer strategy, not premature checkout

Maintain one draft expansion pathway per agent category, conditional on the specific agent reaching **Live** and proving its own fulfillment:
- **Marketing:** Implement a narrowly defined content/funnel change or upsell approved ongoing marketing.
- **Sales:** Scoped manual-review sales process tune-up; never automatically purchase scraped leads or blast outreach.
- **Automation:** Approved integration/automation setup with bounded triggers, credentials, retries, and audit logs.
- **Content:** Approved content package implementation or additional campaign assets.
- **Commerce:** Product merchandising/listing setup after Shopify authorization and actual draft-publish acceptance.
- **Operations:** Scoped support workflow deployment once ticket source, privacy controls and escalation exist.
- **Research:** Authorized research/monitoring retainer, with source evidence and non-restricted datasets.
- **Creator:** Clip/overlay/video service only after render/export/publish/delivery rights and costs are proven; Twitch Shorts remains owner-controlled Beta.
- **Platform:** Enterprise onboarding/implementation quote, not unverified full-agent lifetime access.

Do not attach a public purchase price, checkout link, autonomous sender, or guaranteed deliverable to any Beta/Setup Required/Planned/Blocked agent. Existing older Stripe products are staged/retired for a reason.

## Auto-send decision and phased activation

**Now:** Automate delivery of an already paid, completed, validated, authorized digital artifact (for example the audit) through a transactional sender, with recipient binding, one event claim per order, independent receipt confirmation and operator alert for failure. No customer should manually approve their own delivery, but the *system* must first be fully verified. Receipt and fulfillment are not marketing opt-in.

**Next:** Allow each Live agent to offer optional **save, download, owner-directed send to own address**; no unrequested third-party messages.

**Later:** Offer separately opted-in recurring campaigns and reply automation only where Google OAuth/scopes, explicit recipient authorization, identity, suppression/stop-on-reply, preview/approval, inbox deliverability, rate limits, cost ceilings, abuse checks, human escalation, and provider terms are satisfied. The marketing plan must not exploit transactional consent.

**Publishing, payments, external account changes:** Require explicit transaction-level approval even if an AI agent recommends or drafts the action. Keep Fiverr communication and checkout on Fiverr.

## Release checklist

1. Review package promises, starting quote prices, terms, revisions, taxes and delivery feasibility with owner; keep Draft until approved.
2. Resolve blocking dependency audit (Next 15.5.28 is staged in PR #295, while Zod remains blocked) before depending on automatic CI passes.
3. Run `node --import tsx --test tests/ams-upsell-offers.test.ts` and TypeScript, lint, build and secret scan against this exact branch in isolated CI; do not mark PASS until tool evidence confirms it.
4. Preview `NEXT_PUBLIC_AMS_UPSELLS_ENABLED=true` only in isolated branch. Confirm paid audit result displays three optional packages, other statuses don't sell unavailable agents, request prefill works, existing backend accepts the documented notes, and no payment/send occurs.
5. Integrate the separate verified primary Gmail transactional delivery work (PR #282), after Preview Stripe webhook + Redis isolation. The one-use pilot coupon is reserved, not to be casually redeemed.
6. Add telemetry for `audit_completed`, `upsell_shown`, `quote_requested`, `quote_accepted`, `implementation_delivered`, and opt-in separately, keyed by non-PII IDs. Do not count card views as revenue.
7. Only after owner approval: activate and promote. This branch changes **no Stripe products**, no customer billing, no OAuth scopes, no live Vercel env, no sending policy, no agent status, no public production code.
