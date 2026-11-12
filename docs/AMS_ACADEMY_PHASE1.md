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
- Reuses existing NextAuth and existing `UPSTASH_REDIS_REST_*` / `KV_REST_API_*` configuration conventions. No schema, external database, dependencies, billing, or AI usage added.

## Safety gates

1. The page and completion action are available only when `AMS_ACADEMY_PREVIEW_ENABLED=true` **AND** `VERCEL_ENV=preview` (or local `NODE_ENV=development`). Both the page and its write action return 404 in Production even if an environment variable is accidentally enabled there.
2. Customer identity must come from the signed Google session and the existing validated customer-subject derivation. Never take a student identifier from client input.
3. Redis progress does not silently fall back to browser-only storage. When the store is unavailable, show an error and disable completion.
4. Do not enable the Preview flag until Preview OAuth origin/callback and a **positively identified Preview-only datastore** are verified. Never point at AMS Production Redis or a datastore reserved for unrelated previews.
5. Do not introduce unannounced monitoring of Stream Lab. Future student activity reporting must be transparent, permission-scoped, and based on authenticated server records.
6. Never merge or expose paid enrollment, public student accounts, live prices, invoices, emails, AI model calls, or publishing as part of this draft.

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
