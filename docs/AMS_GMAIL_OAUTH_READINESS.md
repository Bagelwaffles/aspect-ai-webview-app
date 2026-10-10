# AMS Gmail OAuth readiness

Date: 2026-10-09
Candidate: draft PR #262 at `0edf1921a29599db7da0f0f06c8167df48ea1a1b`
Decision: **HOLD**

## Preserved live acceptance evidence

Primary verification `d16c4707-c185-44fa-896a-87723542a8d6` is **inconclusive**, not failed. It recorded a real Google token exchange with HTTP 200, encrypted replacement-token persistence and readback, access-token replacement, a successful monitoring read, 12 repeated messages, successful replay deduplication, an unchanged secondary grant, unchanged task state, zero notification sends, and automatic replies disabled. It did not pass because no successful primary monitoring history contained a numeric checkpoint.

Secondary verification `e86ee8ad-dc16-4ebc-92c0-62effa5d508a` is **failed**. Google returned HTTP 400 `invalid_grant`; the verifier reported `GMAIL_REAUTHORIZE_REQUIRED`. The primary grant and task state remained unchanged, notification sends remained zero, and automatic replies remained disabled.

These identifiers and booleans are evidence references only. Tokens, authorization codes, message identifiers, and other credentials must never be copied into this document.

## Exact cold-start checkpoint solution

The missing primary checkpoint must not be invented or copied from another account. After explicit owner approval, add a Preview-only, owner-authenticated `initialize-checkpoint` operation with all of these invariants:

1. Require trusted same-origin owner authentication, `VERCEL_ENV=preview`, automatic replies off, and an explicit per-request UUID.
2. Acquire the existing task lease for exactly one Gmail slot and reject the operation if a successful history entry already contains a valid numeric checkpoint.
3. Read and retain the entire original task state. Require the task to remain disabled for the complete operation.
4. Run one bounded `runGmailMonitor` read with automatic replies forced off and a fetch allowlist restricted to Google token exchange plus Gmail `GET` list/metadata endpoints. Block all sends.
5. Persist one genuine initialization run whose result contains the returned `windowStart`, `windowEnd`, `nextPageToken`, numeric `checkpoint`, alert metadata, and deduplication fingerprints. Mark notification state `none` regardless of discovered alerts. Do not call the delivery subsystem.
6. Preserve `enabled`, `nextExecution`, retry fields, scheduled-trigger fields, and every unrelated task record exactly. Store an explicit trigger/audit label such as `initialization`, rather than misrepresenting the record as a scheduled or manual production run.
7. Read the state back under the lease and verify the checkpoint and findings were durably persisted before returning a privacy-safe result.
8. Release the lease in `finally`. A retry with the same request UUID must return the durable prior result without another mailbox scan.

This is a real persisted task-state mutation and therefore requires explicit owner approval before implementation is exposed or invoked. The current branch must not silently initialize during refresh verification, because that would weaken checkpoint-preservation acceptance and conflate initialization with verification.

After initialization, wait for the primary access token to expire naturally and run the existing refresh verifier unchanged. Passing still requires a real HTTP 200 refresh, encrypted replacement-token persistence, monitoring read, preservation of the newly established checkpoint, repeated-message replay deduplication, isolation, and zero sends.

## Secondary reauthorization sequence

1. Use the existing `AMS PR14 Staging` Google Cloud project and existing AMS Gmail client; do not create a new client or project.
2. From the authenticated Preview, select **Authorize secondary**.
3. The owner must select and consent as `whitestarline1@gmail.com`. Confirm the consent screen requests only OpenID/email plus `gmail.readonly`; the secondary account must not request `gmail.send`.
4. After callback, confirm the secondary connection is `connected`, the expected account identity matches, the offline refresh token is present, and the encrypted vault record was persisted. Do not print credentials.
5. Do not run refresh acceptance immediately. Record the new natural access-token expiry, wait beyond it without forcing expiry, and then run the existing secondary refresh verifier once.

## No-cost Google OAuth readiness audit

Observed in the actual Gmail OAuth project `aspect-marketing-solutions` (project number `13801315898`) on 2026-10-09. The separate `AMS PR14 Staging` project is not the Gmail client project and must not be changed for this flow.

- [x] Existing Gmail web client was reused. The secondary authorization request identifies that project, uses PKCE, requests offline access, disables incremental scope carryover, and has the exact reviewed Preview callback.
- [x] The secondary request contains only `openid`, `email`, and `gmail.readonly`; it does not request `gmail.send`.
- [x] OAuth audience is External and the publishing status is **In production**, with 3 lifetime users against the 100-user unverified cap. This does not mean the requested Gmail scopes or branding are verified.
- [x] App name is `Aspect Marketing Solutions`.
- [x] Homepage is `https://www.aspectmarketingsolutions.app`.
- [x] Privacy-policy URL is `https://www.aspectmarketingsolutions.app/privacy` and the terms URL is `https://www.aspectmarketingsolutions.app/terms`; both appear on Google's account chooser.
- [x] User support and developer contact are `kimberleyaversbiz@gmail.com`; Google reports current contacts and properly configured project owners/editors.
- [x] The project uses secure OAuth flows and has an associated Cloud billing account. No purchase, paid verification, or new service was initiated.
- [x] Data Access declares `gmail.send` as sensitive and `gmail.readonly` as restricted. Neither scope is verified.
- [x] The authorized domains include `aspectmarketingsolutions.app` and the existing reviewed Preview domain.
- [ ] Branding is not verified, so the configured branding is not shown to users even though the OAuth audience is marked In production.
- [ ] Confirm Search Console ownership for `aspectmarketingsolutions.app` with a project owner/editor account.
- [ ] Review and justify or remove the legacy authorized domain `v0-aspect-ai-v0-handoff20250830-bedrv7dkn.vercel.app`; do not change it during this audit.
- [ ] Complete the empty sensitive-scope and restricted-scope justification fields, and select the applicable restricted-scope feature category.
- [ ] Verify every OAuth client assigned to this project and every authorized redirect URI included in the reviewer demonstration. Do not expose client secrets.
- [ ] Publish the drafted Gmail-specific privacy disclosure on the configured privacy URL before requesting verification.
- [ ] Prepare a reviewer demonstration showing: owner sign-in; separate primary/secondary consent; the exact scopes; mailbox metadata-only monitoring; encrypted credential storage; disconnection/deletion path; automatic replies off; no unauthorized send; and the user-facing benefit.
- [ ] Document scope justifications and Limited Use compliance. `gmail.readonly` is restricted and server-side handling may require restricted-scope verification and an annual approved security assessment before public production use.
- [ ] Keep testing and production projects/clients separated before any public launch.

## Remaining release gates

- Owner-approved, genuine primary cold-start checkpoint initialization.
- Primary natural-expiry refresh acceptance rerun and PASS.
- Secondary owner consent and encrypted connection persistence confirmation.
- Secondary natural-expiry refresh acceptance PASS.
- Privacy disclosure review and publication on the owned domain.
- Consent-screen links, declared scopes, domain ownership, contacts, client redirects, and reviewer demonstration complete.
- Applicable Google sensitive/restricted-scope verification and security assessment completed before public production use.
- Draft PR CI green after any approved code changes.
- Separate explicit authorization for merge and production deployment.
