# AMS Academy — Phase 1 controlled development

Status: **DRAFT / NOT LAUNCHED**. No merge, Production release, pricing, email, app store submission, or paid AI usage is authorized by this change.

## Objective

Build an AMS-branded platform that teaches beginners how to create, test, market, and eventually monetize software-as-a-service products using the **existing AMS Next.js application**.

### Existing trainer reconnaissance (read only)

The separate **SmokyBanana03 Stream Lab** website was identified in the Vercel project `smokybanana03-training` and returned HTTP 200. It already provides a dashboard, 12 lessons, six missions, voice guidance, stream journal, VOD film room, and browser-local progress.

The deployed frontend stores training state using browser `localStorage` (`smoky-training-fixed-v1` and `smoky-vod-work-v1`). No centrally accessible student progress records or Vercel Web Analytics dataset were verified. Consequently **the owner's son's actual use is unconfirmed**: neither usage nor non-use should be inferred. Inspection of progress is only possible on the same device/browser unless a separately authorized, transparent sharing workflow is added later.

**Do not alter or redeploy the Stream Lab application**. It is a UX reference, not a multi-tenant data backend. Preserve the separately held Draft PR #308 (public coaching feed), which remains disabled and unmerged.

## Phase 1 contents

- `lib/academy/catalog.ts`: six source-controlled practical lessons; no speculative course generator or provider calls.
- `lib/server/academy-progress.ts`: idempotent Redis set of completed curriculum IDs, keyed by a SHA-256 hash of the stable Google customer subject, not email; no shared student reads.
- `app/academy/page.tsx`: signed-in, no-index learning interface with server actions and explicit self-reported completion.
- `tests/academy-progress.test.ts`: isolated unit tests for valid lessons, per-customer separation, idempotence, stale-data filtering, and fail-closed missing Redis.
- Reuses existing NextAuth. Progress requires **dedicated** `AMS_ACADEMY_REDIS_REST_URL` / `AMS_ACADEMY_REDIS_REST_TOKEN` configuration; explicitly refuses shared `UPSTASH_REDIS_REST_*` and `KV_REST_API_*` fallback. No schema, external database, dependencies, billing, or AI usage added.

## Safety gates

1. The page and completion action are available only when `AMS_ACADEMY_PREVIEW_ENABLED=true` **AND** `VERCEL_ENV=preview` (or local `NODE_ENV=development`). Both the page and its write action return 404 in Production even if an environment variable is accidentally enabled there.
2. Customer identity must come from the signed Google session and the existing validated customer-subject derivation. Never take a student identifier from client input.
3. Redis progress does not silently fall back to browser-only storage. When the store is unavailable, show an error and disable completion.
4. Do not enable the Preview flag until Preview OAuth origin/callback and a **positively identified Preview-only datastore** are verified. Never point at AMS Production Redis or a datastore reserved for unrelated previews.
5. Do not introduce unannounced monitoring of Stream Lab. Future student activity reporting must be transparent, permission-scoped, and based on authenticated server records.
6. Never merge or expose paid enrollment, public student accounts, live prices, invoices, emails, AI model calls, or publishing as part of this draft.

## November 12 no-cost datastore approval / provider findings

- Owner approved a separate Academy Preview datastore, while retaining no-billing/no-Production boundaries.
- Attempted explicit **Upstash Free** creation (`plan=free`) in the authorized account. Provider returned **HTTP 400: "free plan is not available for this account"**. No new Upstash database was created, no pay-as-you-go fallback was attempted and no billing terms changed.
- Read-only Upstash inventory confirms four **paid / assigned** preview databases, all for other held work. Do not reuse them.
- Aiven Free Valkey is advertised at $0 but restricted to one free service of a given type per organization. The existing AMS Gmail-monitoring Valkey is reserved; Aiven connector inventory attempts returned internal errors, so separate no-cost entitlement cannot be proven. Do not repurpose that service.
- Remaining blocker: identify a **newly approved, nonbillable, distinct Academy database** before setting Preview secrets or enabling real progress.
- Academy code now cannot silently use the existing generic AMS Redis/KV variables. Feature flag stays OFF, and no Preview environment values have been set by this work.

## Acceptance checklist (NOT yet completed)

- [ ] Verify branch-head CI (TypeScript, lint, unit tests, build, security scan).
- [ ] Recheck the six lesson outcomes and assignments with the owner.
- [ ] In isolated Preview, verify Google OAuth callback is **Preview-specific**, not Production-only.
- [ ] Identify an approved Preview Redis instance and demonstrate real progress SET/GET + idempotent replay across refresh and a second device.
- [ ] Independently verify that customer A cannot see or complete student B's record.
- [ ] Verify 404 for `/academy` on Production with and without the feature flag.
- [ ] Check mobile keyboard/screen-reader usability, request origin, auth expiry and unexpected Redis errors.
- [ ] Obtain distinct owner approval for any Production rollout or paid product changes.

## Future phases (proposed; not implemented)

1. Assignment submissions, quizzes, grading rubric, student consent and instructor feedback.
2. Source-grounded AI tutor with token usage limits, course-specific knowledge, and failure reporting.
3. Course-authoring UI, lesson versioning, retention and account deletion.
4. TEST-mode member billing, webhook replay protection and cancellations.
5. Owner-approved Public/Google Play launch and measured customer activation.

Never label course completion as certified mastery; students self-mark progress in Phase 1.


## November 12 — owner-approved isolated pay-as-you-go Preview database

Owner specifically approved **one new Academy-only Upstash Redis pay-as-you-go database** with a **$20 monthly spending cap**, configured solely on the Academy Preview branch. No Production rollout was authorized.

- Created new database `amsacademypreview` in `us-east-1` (a separate database; no existing AMS datastore reused).
- Independent readback confirmed database **active**, **Pay as You Go**, and **budget 20**.
- Real datastore verification on the new database: `PING=PONG`, `SET=OK`, matching `GET`, `DEL=1`, final `GET=null`. Synthetic key fully cleaned up.
- Applied only three **branch-specific Preview** Vercel environment variables: `AMS_ACADEMY_REDIS_REST_URL`, `AMS_ACADEMY_REDIS_REST_TOKEN`, and `AMS_ACADEMY_PREVIEW_ENABLED=false`. Dedicated Redis token is marked sensitive; never put credentials in this repository, comments, or log output.
- Verified all three variables target Preview and the Academy branch, not Production or other PRs. General AMS Redis environment variables are never accepted by Academy code.
- The exact-head GitHub reconciliation CI and secret scan were successful before environment configuration. New Vercel builds are required to incorporate new environment settings.
- Attempt to redeploy directly with Vercel's deployment API received HTTP 403. Do not repeat this API call without revised authorization. Use the existing GitHub→Vercel Preview build integration when this documentation commit is pushed to the existing draft branch.
- **Important:** The Academy gate remains OFF. Direct Upstash connectivity does not prove the Preview app's authenticated progress reads and writes. Owner-only OAuth sign-in, session origin, per-customer persistent progress and Production 404 still require separately verified Preview acceptance before activation.
- No merge, Production change, public enrollment, live student activity, paid AI calls, Stripe changes, credentials rotation or customer communication.

