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

## Missing recovery evidence

The following artifacts were not found in the AMS workspace or Codex attachments:

- `staging-branch.bundle`
- Phase 0 final audit report
- Phase 1A Safe Staging Bootstrap report

Commit `bc3c440439a188d4ce7e0b54ebf9335c581aab51` is not reachable from either GitHub repository. No Phase 1A changes were recreated or applied by assumption.

## Implemented controls

- Atomic credit reservation, commit, and refund with account-bound idempotency and a bounded ledger stream.
- Customer ownership derived from the signed Google provider subject rather than email or client-supplied IDs.
- Distributed, atomic, fail-closed AI rate limiting.
- Customer authentication, entitlement checks, and credit accounting on executable AI routes.
- A real Content Agent with strict brief/output schemas, provider execution, account-isolated run history, safe retries, and explicit reconciliation states.
- Subscription-only checkout with server-side price allowlists, identity metadata, and return URLs.
- Stripe signature verification, mode checks, object re-fetching, identity agreement, event claims, lifecycle updates, cancellation/failed-payment revocation, and once-per-cycle credit reset.
- One-time Ethical Agent Farm checkout disabled with HTTP 410; public offers are request-only.
- Unfinished agent, deployment, Relevance, analytics, and command surfaces are either authenticated `NOT_IMPLEMENTED` endpoints or honest unavailable pages.
- Current-tree credential redaction and a provider-side rotation checklist for credentials still present in Git history.

## Verification run

- `pnpm install --frozen-lockfile`: pass.
- `pnpm audit --audit-level=high`: pass, no known vulnerabilities.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm lint`: pass with seven legacy warning instances and no errors.
- `pnpm test`: pass, 102 assertions and 0 failures.
- `pnpm run build`: pass; 32 static pages generated and dynamic/API routes compiled.
- `git diff --check`: pass; only Windows line-ending notices.
- Built-server runtime smoke: pass for health, empty unfinished agent catalog, customer/internal authentication gates, disabled one-time checkout, Content Agent page, and reviewer page.
- Current tracked and intended-new-file credential scan: clean.
- Historical credential scan: rotation required for Relevance credentials in prior `README.md` content.
- Database generation/migration: not applicable. This repository has no Prisma schema or relational database client; the reconciled state uses Upstash/KV.

## Staging sequence status

The required ten-step sign-in, Stripe test checkout, signed webhook, entitlement, Content Agent execution, saved-run isolation, refund, and cancellation sequence has **not** been executed against a deployed staging environment. Deterministic local tests cover those state transitions, but they are not a substitute for the real staging sequence.

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

- Ready to update draft PR #14: yes, after the new commit passes GitHub CI.
- Ready for isolated test-mode staging: yes, after CI and staging secrets are configured by name in an isolated environment.
- Ready to merge: no.
- Ready for production: no.

Merge remains blocked by provider-side Relevance credential rotation and completion of the real ten-step staging sequence. Missing Phase 0/1A evidence remains an explicit recovery gap.

## Next highest-value action

Rotate the exposed Relevance credentials, then deploy this draft branch to an isolated test-mode staging environment and execute the full ten-step sequence with real Google sign-in, Stripe test events, Upstash/KV persistence, and the configured xAI provider.
