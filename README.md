# Aspect Marketing Solutions

The reconciled AMS web platform: public marketing, customer authentication, subscription billing, persistent credits and entitlements, saved Content Agent runs, and the Android/Google Play web source.

## Current launch scope

- Next.js 15 App Router with React 19 and TypeScript.
- Google/NextAuth customer identity.
- Stripe subscriptions in test mode for staging.
- Redis-backed entitlements, credits, idempotency, rate limits, and saved runs through the Upstash-compatible REST protocol.
- One executable launch product: Content Agent.
- One-time Ethical Agent Farm checkout disabled until fulfillment is implemented.
- Unfinished agents and operational surfaces fail honestly instead of returning mock success.

PostgreSQL and Neon wsproxy are intentionally excluded. AMS has not approved a relational schema for this repository.

## Local development

Requirements:

- Node.js 22
- pnpm 10.28.0

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Copy `.env.example` to `.env.local` and use test/development credentials only. Never commit environment files or secrets.

## Verification

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm run build
```

`GET /api/health` is the readiness endpoint. Redis is required: it returns HTTP 200 only after a real Redis `PING`, and HTTP 503 when Redis configuration or connectivity is unavailable.

## Isolated Docker staging

The webview-native staging topology contains exactly:

- Web container built from `deploy/web.Dockerfile`
- Persistent Redis 7.4.10
- Upstash-compatible Redis REST proxy 0.0.10

No datastore port is published to the host. The web port binds to loopback only. See [docs/AMS_WEBVIEW_STAGING_RUNBOOK.md](docs/AMS_WEBVIEW_STAGING_RUNBOOK.md).

## Production status

PR #14 has been merged after the approved controlled reconciliation sequence. The public Next.js site and Redis readiness path are deployed. Provider-backed Content Agent execution and credit deduction have passed controlled testing, while public SaaS checkout remains gated until the production provider configuration is present and deliberately enabled. Google Play release work remains a separate blocked track.
