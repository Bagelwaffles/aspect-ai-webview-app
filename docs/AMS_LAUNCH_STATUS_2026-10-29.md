# AMS launch and GitHub triage — 2026-10-29

> **Operating record, not a launch authorization.** This is a read-only reconciliation of the repository, current public product pages, Vercel production metadata, and linked issues/PRs as checked 2026-10-29. Recheck dynamic runtime, payment, customer, and compliance evidence before a release. It contains no owner personal-finance or medical information.

## One source of truth

- **Commercial execution:** [Issue #313](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/313), "First 10 Paying Customers"; it expressly prioritizes an **automated, low-touch payment → fulfillment → branded transactional delivery → consent-safe upsell** loop. Do **not** convert this into an unapproved manual-only service or repeat prior Stripe payment tests.
- **Agent/customer readiness:** [Issue #285](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/285).
- **Security:** [Issue #302](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/302) for the Node runtime/container patch and [PR #248](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/248) for Node 24 migration. The separate Next.js Oct advisory [#293](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/293) has a patched main dependency to evaluate for closure.
- **Google Play:** [Issue #26](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/26) and [Draft PR #209](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/209).
- **Governed automation:** [Issue #279](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/279) + [Draft PR #280](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/280); [Issue #261](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/261) + [Draft PR #262](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/262). Preserve disabled task states and Gmail compliance gates.

## Verified baseline vs. unproven outcomes

| Area | Verified 2026-10-29 | Not established / must not claim |
| --- | --- | --- |
| GitHub | `main` is default branch; 35 open PRs at inspection, many intentionally Draft/HOLD; more than 100 named branches | That all Draft PRs are stale or safe to merge/delete |
| Vercel | `aspect-ai-overlord`; latest identified **production** deployment on 2026-10-26 is **READY**, `main` SHA `d6e7f98720ef9d96ab89906e1828187b36048659`; apex and www attached | Production readiness of every feature, customer conversion, or 24/7 runtime reliability |
| Public marketing | Modern Next.js AMS homepage and `/quick-marketing-audit` routes render; main catalog describes seven Live **draft-generation** agents | Automated customer emailing or posting by those seven agents |
| Main source | `package.json` pins Next.js `15.5.28`, Zod `4.6.7`, React `19.1.1`, pnpm `10.28.0`; `app/agents/agentCatalog.ts` describes Live, Beta, Setup Required, Blocked, Planned | That historical vulnerable Next.js `15.5.24` described in Issue #293 remains the deployed version |
| Quick Audit | `/quick-marketing-audit` advertises **$49 once** and promised deliverables. Main `isQuickAuditRuntimeLaunchEnabled` checks live Stripe config + Redis + explicitly enabled Redis launch key | That production public checkout is enabled, a new real purchaser completed checkout, and audit+email fulfillment finished |
| Stripe test | Prior controlled TEST webhook/payment replay and idempotency evidence was recorded; current project issue #313 treats [#306](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/306) sandbox receipt proof as PASSED | Live customer payment/fulfillment; test/owner self-payments are **not** genuine customer sales |
| Branded email | Resend company-domain proof and owner-only Preview send acceptance were recorded separately; work remains in [Draft #300](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/300) | Approved production transactional sending or unattended promotional Gmail sending |
| Subscriptions | [Draft #312](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/312) passed CI and proposes fail-closed checkout and truthful sales copy | Subscription checkout enabled or verified in current production; no customer subscriptions inferred from active Stripe prices |
| Android | [Issue #26](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/26), [Draft #209](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/209); version `20000` accepted for closed testing, `20001` prepared in Draft | Google Play public production launch; #209 still requires approved signing proof |
| Security | Patched Next/Zod main source; [Issue #302](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/302) identifies older pinned Docker/Node staging image and [PR #248](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/248) pre-patch Node24 baseline | Closure of Node runtime patch, or resolution of all future dependency advisories |

## Release sequence — revenue first, no shortcut

1. **Single red/green acceptance matrix:** use #313 and link *existing* receipts for TEST signed event, durable order record, actual native audit result + QA, outbox + owner-only branded Resend inbox receipt, authorization, replay suppression and rollback. Mark each stage `verified`, `historical only`, `blocked`, or `not tested`. Do not conflate end-to-end stages.
2. **Unify stacked Drafts instead of rebuilding:** #282 → #295 → #299 → #300 for audit fulfillment/sender, with separate receipt/sandbox evidence #306. Inspect bases and exact heads before any merge plan. Do not assume stacking order grants production approval.
3. **Check live purchase readiness** only after signed LIVE Stripe endpoint, durable persistence identity, customer intake, result authorization, refunds/support, and transactional delivery are independently verified. No new live/test charges without explicit owner consent.
4. **Constrain subscriptions/upsells** to properly provisioned, truthful offers: #273/#312 safety gates, #296/#298 upsell experimentation. No auto-subscribe, charges without explicit consent, or promises for unimplemented agents.
5. **Launch measured acquisition** after a complete verified purchase/delivery flow: first ten genuine, non-owner customers. Track gross revenue, fees, refunds, actual contribution margin, conversion, fulfillment, repeat buyers, and retention. Don't treat Stripe product configuration or owner tests as sales.
6. **Preserve privacy:** OAuth/Gmail restrictions and Google restricted-scope verification remain separate from the Resend transactional lane. No private financial, SSA, medical, inbox contents, credentials, or customer data in this public repository.

## Open PR review queue (do not merge/delete based only on age)

**Commercial core — highest review priority**
- Audit fulfillment and sender: [#282](../../pull/282), [#295](../../pull/295), [#299](../../pull/299), [#300](../../pull/300), isolated sandbox [#306](../../pull/306).
- Subscription and upsell: [#273](../../pull/273), [#296](../../pull/296), [#298](../../pull/298), [#312](../../pull/312).
- Marketing/customer readiness: [#289](../../pull/289), [#290](../../pull/290), brand redesign [#292](../../pull/292). Review conflicts and truthful offer text; no automatic promotion.

**Security, privacy, and internal operations — gated**
- Security and runtime: [#248](../../pull/248), older [#210](../../pull/210) (compare with already-patched main before closure); maintenance [#280](../../pull/280).
- Owner-only Gmail and workflow scheduling: [#262](../../pull/262), [#275](../../pull/275), [#274](../../pull/274), governance [#233](../../pull/233). Privacy and exact-action approvals must survive.
- Android / Play: [#209](../../pull/209), still blocked by release gating; not a prerequisite to first web revenue.

**Creator/commerce/longer-horizon — preserve but deprioritize for AMS revenue release**
- Twitch/YouTube and creator: [#220](../../pull/220), [#221](../../pull/221), [#268](../../pull/268), [#277](../../pull/277), [#286](../../pull/286), [#303](../../pull/303), [#307](../../pull/307), [#308](../../pull/308).
- Shopify and future experiments: [#276](../../pull/276), [#265](../../pull/265), [#234](../../pull/234), customer site redesign [#180](../../pull/180), preexisting operational [#74](../../pull/74), [#171](../../pull/171), [#194](../../pull/194).
- These are classified **review/hold**, not obsolete. Before closing anything, compare against merged main and check whether an active workflow or owner authorization depends on it.

## Branch hygiene protocol

The repository returned >100 branches, including Dependabot branches, production-connected agent branches, and stacked PR heads. **No branches were deleted in this triage.** Do not delete a branch merely because it is old: verify that its commits are merged or preserved, that no open PR references it as head **or base**, and that no CI/release/Preview flow or external integration uses it. Remove only proven orphans in a separately documented cleanup.

## Documentation and safe operating rules

- README is a compact current-state entry point, this file is the detailed launch map, and Issue #313 is the actionable backlog. Do not paste this whole file into every PR.
- A passing test or a Vercel `READY` status must not be described as a verified paying-customer purchase.
- No hidden flag flips, no customer emails, no production merge/deploy, no OAuth reset, no agent public publishing, no new Stripe charges, and no private credential/data exports as part of **documentation cleanup**.
- After each actual release, update the matrix with a timestamp, exact production SHA, acceptance link, and known rollback; only then change a `blocked` or `not tested` designation.
