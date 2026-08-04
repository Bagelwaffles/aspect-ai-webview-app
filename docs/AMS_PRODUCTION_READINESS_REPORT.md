# AMS Production Readiness Report

Date: 2026-08-04

## Candidate

- Repository: `Bagelwaffles/aspect-ai-webview-app`
- Branch: `feat/ams-controlled-reconciliation`
- Pull request: draft PR #14
- Production status: unchanged
- Merge status: blocked pending owner approval and final validation

## Zero-cost launch decision

The owner cannot fund xAI credits or licensing at this time. AMS therefore uses an honest, fail-closed launch mode instead of pretending the provider-backed Content Agent is available.

Paid Content Agent execution is opt-in through:

```text
NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE=true
```

Any missing, false, or malformed value keeps the website in zero-cost private-beta mode.

## Behavior while provider execution is disabled

- Content Agent provider execution is unavailable.
- The Content Agent form is visibly marked private beta and cannot submit.
- Existing saved-run history remains readable for the authenticated owner.
- The API refuses new Content Agent execution before entitlement lookup, credit reservation, provider calls, or run creation.
- New paid AI subscription checkout is disabled at the server route and in pricing/billing UI.
- Existing subscribers retain access to the Stripe billing portal so they can manage or cancel their subscription.
- Request-based marketing services and beta-list lead capture remain available without automatic payment.
- Stripe, entitlements, credits, saved runs, reconciliation logic, and provider implementation remain preserved for later activation.

## Available launch scope

- Public AMS marketing website
- Customer sign-in and account surfaces
- Pricing and agent-status pages with accurate availability language
- Request-only marketing service intake
- Content Agent beta-list intake
- Existing subscriber billing portal access
- Protected saved Content Agent history
- Redis-backed entitlement, credit, and run infrastructure
- Internal admin authentication and throttling
- Fail-closed health and security controls

## Deferred scope

- New paid AI subscriptions
- Live xAI-backed Content Agent generation
- Outreach Agent
- Analytics Agent
- Relevance-backed agent execution
- Android and Google Play publication

## Safety controls

- No unavailable AI plan can start checkout while the launch flag is disabled.
- No Content Agent credit can be reserved while provider execution is disabled.
- No raw xAI 403 response, API key, model credential, or secret is exposed to customers.
- Provider activation requires both the explicit public launch flag and valid `XAI_API_KEY` / `XAI_MODEL` values.
- Production remains untouched until separate owner authorization.

## Validation required for this commit

- Dependency install and audit
- TypeScript
- Lint
- Full test suite, including zero-cost launch tests
- Production build
- Docker Compose staging topology validation
- Runtime smoke and security smoke
- Credential scan
- `git diff --check`

## Provider activation later

Before setting `NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE=true`:

1. Fund or license a staging-only provider account.
2. Configure `XAI_API_KEY` and `XAI_MODEL` securely.
3. Complete one real successful Content Agent run.
4. Prove exact-once credit reservation and commit.
5. Prove saved-run persistence and two-account isolation.
6. Prove provider failure refunds or reconciles exactly once.
7. Repeat the full validation suite.
8. Obtain separate production approval.

## Credential rotation

Historical Relevance credentials remain scheduled for provider-side rotation or revocation. Relevance is not required for the zero-cost launch and must remain disabled until rotation is complete.

## Rollback

The change is isolated to PR #14. Until merge, rollback is simply leaving the PR draft and unmerged. After any future approved merge, the previous Vercel production deployment must remain available as the immediate rollback target.

## Current recommendation

**DO NOT MERGE OR DEPLOY YET.**

The zero-cost launch implementation removes the xAI funding blocker from website readiness, but the new branch commit must complete CI and staging smoke before owner review. Production promotion still requires separate explicit approval.
