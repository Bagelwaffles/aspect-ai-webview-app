# AMS Controlled Reconciliation Readiness

Date: 2026-08-03

## Scope

- Repository: `Bagelwaffles/aspect-ai-webview-app`
- Branch: `feat/ams-controlled-reconciliation`
- Pull request: draft PR #14 into `main`
- Worktree: `C:\AMS_Vault\_reconciliation_pr14`
- Production, DNS, live Stripe, databases, Vercel configuration, Android, and `main` were not changed.

## Access confirmed

- `Bagelwaffles/aspect-ai-webview-app`: accessible with administrative repository permission.
- `Bagelwaffles/Aspect-AI-Overlord`: accessible with administrative repository permission.
- Draft PR #14 and its source branch: accessible and writable.
- Existing PR CI result before this reconciliation commit: successful.

## Recovered Phase 1A evidence and architecture decision

- The preserved bundle and patch were recovered and verified.
- Phase 1A commit: `bc3c440439a188d4ce7e0b54ebf9335c581aab51`.
- Phase 1A parent: Overlord commit `698282e7f2d1bd873bd6b6a7ceb5ece379576e2d`.
- Phase 1A remains Overlord-specific and was not cherry-picked into this PR.
- Only compatible concepts were adapted: isolated containers, persistent Redis, an Upstash-compatible REST proxy, and dependency-aware readiness.
- PostgreSQL and wsproxy remain excluded until AMS approves a relational schema.

## Implemented controls

- Atomic credit reservation, commit, and refund with account-bound idempotency and a bounded ledger stream.
- Customer ownership derived from the signed Google provider subject rather than email or client-supplied IDs.
- Distributed, atomic, fail-closed AI rate limiting.
- Customer authentication, entitlement checks, and credit accounting on executable AI routes.
- A real Content Agent with strict brief/output schemas, provider execution, account-isolated run history, safe retries, and explicit reconciliation states.
- Subscription-only checkout with server-side price allowlists, identity metadata, and return URLs.
- Stripe signature verification, mode checks, object re-fetching, identity agreement, event claims, lifecycle updates, cancellation/failed-payment revocation, and once-per-cycle credit reset.
- One-time Ethical Agent Farm checkout disabled with HTTP 410; public offers are request-only.
- Legacy paid AI chat and Grok chat execution routes are disabled with HTTP 410 after customer authentication so launch traffic is forced through the saved Content Agent route.
- Unfinished agent, deployment, Relevance, analytics, and command surfaces are either authenticated `NOT_IMPLEMENTED` endpoints or honest unavailable pages.
- Current-tree credential redaction and a provider-side rotation checklist for credentials still present in Git history.
- Webview-native staging Compose stack with pinned web, Redis, and Redis REST proxy versions.
- No host-published datastore ports; the web port binds to loopback only.
- Redis readiness uses a real `PING` and returns HTTP 503 when configuration or connectivity is unavailable.
- Approved Sites marketing source integrated as page-scoped frontend code without replacing secure SaaS routes.

## Verification run

- `pnpm install --frozen-lockfile`: pass.
- `pnpm audit --prod --audit-level high`: pass, no known vulnerabilities.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm lint`: pass with seven legacy warning instances and no errors.
- `pnpm test`: pass, 113 tests discovered, 112 passed, one real-Redis integration test intentionally skipped in the normal suite, and zero failures. The test script uses Node's native runner with the `tsx` import hook and does not require a local IPC socket.
- Linux Docker production image build: pass; 32 static pages generated and dynamic/API routes compiled.
- `pnpm staging:preflight .env.staging`: pass without printing credential values.
- `git diff --check`: pass; only Windows line-ending notices.
- Isolated Compose runtime: web, Redis, and Redis REST proxy are healthy; Redis is not published to the host and the web service binds to loopback.
- Public HTTPS runtime smoke: health, login, pricing, billing, and Content Agent pages return HTTP 200 without loopback URL leaks.
- Redis fail-closed and recovery proof: readiness returned HTTP 503 while Redis was stopped, returned HTTP 200 after restart, and a persistence marker survived the restart.
- Protected-route smoke: unauthenticated checkout and Content Agent requests return HTTP 401; an unsigned Stripe webhook returns HTTP 400.
- Internal admin runtime: valid authentication returns HTTP 200 with secure HttpOnly cookies; repeated invalid attempts are throttled with HTTP 429.
- Real Redis cycle-race integration test: pass; a refund restores top-up credits but does not mint plan credits from an earlier billing cycle.
- Current tracked and intended-new-file credential scan: clean.
- Historical credential scan: rotation required for Relevance credentials in prior `README.md` content.
- Database generation/migration: not applicable. This repository has no Prisma schema or relational database client; the reconciled state uses Upstash/KV.

## Staging sequence status

The isolated HTTPS staging environment executed the following real provider-backed checks:

- Two distinct allowlisted Google test accounts completed OAuth and returned to the staging application.
- A Stripe test-mode subscription Checkout Session used a recurring test price, stable customer metadata, and staging HTTPS return URLs.
- Stripe test checkout completed without a real charge. The signed webhook processed `invoice.payment_succeeded`, `customer.subscription.created`, and `checkout.session.completed`.
- Redis reflected the active Starter entitlement, 2,000 cycle-bound plan credits, and immutable subscription ownership.
- A signed replay returned the duplicate-safe result without granting access twice.
- Test subscription cancellation was processed and revoked access.

The full ten-step sequence remains incomplete at the provider execution step. A dedicated 90-day xAI staging key and model are configured, but the dedicated staging team has zero credits/licenses and the provider returns HTTP 403. No credits were purchased. Real successful Content Agent execution and live saved-run isolation therefore remain blocked; deterministic tests cover provider failure, exact-once refund, retry, reconciliation, and account isolation without claiming a live provider success.

## Required staging environment names

Core customer and app configuration:

- `PUBLIC_APP_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Content Agent and limits:

- `XAI_API_KEY`
- `XAI_MODEL`
- `AMS_AI_REQUESTS_PER_MINUTE`

State store, using either naming pair:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Stripe test staging:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `AMS_STRIPE_WEBHOOK_MODE`
- `AMS_STRIPE_STARTER_PRICE_ID`
- `AMS_STRIPE_GROWTH_PRICE_ID`
- `AMS_STRIPE_PRO_PRICE_ID`

Optional protected/internal surfaces:

- `AMS_INTERNAL_API_KEY`
- `AMS_BACKEND_URL`
- `AMS_STRIPE_FULFILLMENT_SECRET`

Relevance credentials are not required for this launch candidate and must remain disabled until rotated.

## Readiness decision

- Ready to update draft PR #14: yes, after the reconciliation commit passes GitHub CI.
- Ready for isolated test-mode staging: yes; the stack and dedicated test credentials are configured and verified.
- Ready to merge: no.
- Ready for production: no.

Merge remains blocked by provider-side Relevance credential rotation and completion of the real Content Agent provider execution sequence. Phase 1A evidence is preserved as an Overlord-specific reference and must not be cherry-picked. The separately requested `staging-branch.bundle` was not available in this workspace and was not reconstructed or used.

## Next highest-value action

Push the isolated reconciliation commit and let draft PR #14 run GitHub CI. After separate owner approval to fund the xAI staging team, execute one successful Content Agent run plus the invalid-key refund/retry and two-account saved-run isolation checks. Keep the PR draft and unmerged until that evidence and the Relevance credential rotation are complete.
