# Aspect Marketing Solutions (AMS)

AMS is a Next.js/React SaaS platform for small-business marketing, human-reviewed AI draft generation, and an approval-first creator/operations workflow.

> **Launch operating record:** [AMS launch status — October 29, 2026](docs/AMS_LAUNCH_STATUS_2026-10-29.md) (proposed documentation change; see [commercial execution Issue #313](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/313)). This README distinguishes deploy readiness from customer-sales readiness.

## Current baseline (verified 2026-10-29)

- Framework: Next.js **15.5.28** App Router, React **19.1.1**, TypeScript, pnpm **10.28.0**.
- Vercel project: `aspect-ai-overlord` on the public `aspectmarketingsolutions.app` and `www.aspectmarketingsolutions.app` domains. A production deployment from `main` was **READY** on 2026-10-26 (SHA `d6e7f98720ef9d96ab89906e1828187b36048659`).
- The agent catalog contains **seven Live, draft-generation agents** with previously documented authenticated production evidence: Content, Lead Magnet, Email Campaign, Nurture, Outreach, SEO and Product Creator. **Live does not imply automatic email sending or public posting.** Other catalog entries explicitly distinguish Beta, Setup Required, Planned and Blocked.
- Customer identity, Redis-backed credits/entitlements, saved generation runs, Stripe integration, and creator integrations are developed with explicit runtime and authorization gates.
- **$49 Quick Marketing Audit:** public landing page and runtime-gated checkout path are present. The existence of the route, a configured Stripe product, or a successful historical sandbox purchase **does not prove the complete live customer checkout → personalized fulfillment → secure branded email delivery loop is currently released**.
- Transactional Resend, Gmail owner-monitoring, subscriptions, and several other operational improvements remain in **Draft/HOLD** PRs. Production sending and subscription checkout must not be enabled on the basis of CI success alone.
- Android Google Play remains a separate controlled release path (closed-testing evidence; public production publication not established).

### Priorities

1. **Revenue launch:** [Issue #313](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/313) — verify one complete low-touch customer sales/fulfillment/delivery loop, then pursue the first 10 **genuine** paying customers. Customer self-tests and sandbox charges do not count.
2. **Agent/customer readiness:** [Issue #285](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/285) — prove the current seven draft-generating workflows, not an imaginary autonomous agent farm.
3. **Runtime security:** [Issue #302](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/302), [PR #248](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/248) — address pinned staging Node versions with verified images and tests.
4. **Google Play:** [Issue #26](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/26) and [Draft PR #209](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/209).

See the launch status document for the full PR dependency map and safety holds. No Draft PR is an implicit approval to merge or change production.

## Local development

Requirements: Node.js **22** (see current project runtime and security advisories), pnpm **10.28.0**.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Copy `.env.example` to `.env.local` and supply only approved development/test credentials. Never commit environment files, tokens, or personal/customer data.

## Verification

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm run build
```

`GET /api/health` is the configured readiness endpoint. The Redis dependency must be available for a passing readiness response; do not interpret a landing-page response alone as backend health.

## Isolated Docker staging

The test-only stack uses:
- A web container defined by `deploy/web.Dockerfile`.
- Redis `7.4.10`.
- Upstash-compatible Redis REST proxy `0.0.10`.

No database port is exposed to the host. See [docs/AMS_WEBVIEW_STAGING_RUNBOOK.md](docs/AMS_WEBVIEW_STAGING_RUNBOOK.md). The pinned staging Node image needs the separately tracked runtime patch; do not infer this means managed Vercel production is vulnerable.

## Release boundary

For a live customer-facing feature: independently verify auth, provider availability, signed Stripe events where applicable, persistent durable state, idempotency, customer-visible delivery, pricing truthfulness, applicable consent/compliance, and rollback **on the exact intended environment**. No automated customer sends, new charges, production flag flips, or public publishing from documentation changes.
