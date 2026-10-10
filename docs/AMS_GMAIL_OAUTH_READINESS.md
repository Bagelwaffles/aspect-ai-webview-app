# AMS Gmail OAuth readiness

Date: 2026-10-09
Candidate: draft PR #262 at `77c9266d283df78e5fb0c08c2317e8c3c645a75b`
Decision: **HOLD**

## Current live acceptance decision

Both owner Gmail connections passed the independent natural-expiry refresh acceptance test on 2026-10-09. These are the current acceptance records and must not be replaced by the historical failures below:

- Primary `2fdce49b-e3e8-46c1-99b4-80754a4a772b`: **PASS**. Google refresh HTTP 200; encrypted replacement token persisted and replaced the expired access token; monitoring read succeeded; initialized checkpoint and paused task state were preserved; one repeated message was suppressed on replay; the secondary grant was unchanged; zero notifications were sent; automatic replies remained disabled.
- Secondary `e95d56a4-7146-4cae-9ea6-77837712d46b`: **PASS**. Google refresh HTTP 200; encrypted replacement token persisted and replaced the expired access token; monitoring read succeeded; historical checkpoint and paused task state were preserved; ten repeated messages were suppressed on replay; the primary grant was unchanged; zero notifications were sent; automatic replies remained disabled.

The Gmail refresh acceptance gate is complete. It should be repeated only if a later change affects the OAuth, token-vault, monitoring, checkpoint, or deduplication path.

## Preserved live acceptance evidence

The following records are retained as historical evidence of the pre-remediation state. They do not supersede the PASS records above.

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

Observed under the project-owner account in the actual Gmail OAuth project `aspect-marketing-solutions` (project number `13801315898`) on 2026-10-09. The separate `AMS PR14 Staging` project is not the Gmail client project and must not be changed for this flow.

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
- [x] Search Console reports `kimberleyaversbiz@gmail.com` as a verified owner of the `sc-domain:aspectmarketingsolutions.app` property.
- [x] The configured app name is `Aspect Marketing Solutions`; support and developer contact are `kimberleyaversbiz@gmail.com`; homepage, privacy, and terms URLs use the owned `https://www.aspectmarketingsolutions.app` domain.
- [x] The existing `Aspect Marketing Solutions Web` client contains the expected Preview primary and secondary callbacks and the production primary and secondary callbacks. It also contains the standard production Google sign-in callback.
- [x] Data Access still marks `gmail.send` sensitive and `gmail.readonly` restricted and unverified. The two justification fields were completed and saved without submitting verification; feature category is `Email reporting and monitoring`.
- [ ] Branding is not verified and is not shown to users. Verification Center requires brand verification/publication before data-access verification can be requested.
- [ ] Review and justify or remove the legacy authorized domain `v0-aspect-ai-v0-handoff20250830-bedrv7dkn.vercel.app`; do not change it during this audit.
- [ ] Review the bare redirect URI `https://aspectmarketingsolutions.app`, which is not an OAuth callback path, before any cleanup. It was not changed during this audit.
- [ ] Decide whether the separate `YouTube Upload` web client belongs in the same verification request. Google requires the demonstration video to include every OAuth client assigned to the project; the console also warns this client has been unused for five months and may be deleted after 30 more days. Do not delete it without a separate YouTube impact review.
- [ ] Publish the drafted Gmail-specific privacy disclosure on the configured privacy URL before requesting verification.
- [ ] Prepare a reviewer demonstration showing: owner sign-in; separate primary/secondary consent; the exact scopes; mailbox metadata-only monitoring; encrypted credential storage; disconnection/deletion path; automatic replies off; no unauthorized send; and the user-facing benefit.
- [ ] Document scope justifications and Limited Use compliance. `gmail.readonly` is restricted and server-side handling may require restricted-scope verification and an annual approved security assessment before public production use.
- [ ] Keep testing and production projects/clients separated before any public launch.

## Console-ready scope justifications

Use the following text without including account addresses, message identifiers, tokens, client secrets, or internal storage keys.

### `https://www.googleapis.com/auth/gmail.readonly` (restricted)

Aspect Marketing Solutions uses Gmail read-only access for an owner-controlled productivity monitor. After the owner explicitly connects an account, the server searches a bounded time window for narrowly defined business, payment, account-security, Google Play, and customer-inquiry messages. It reads message identifiers and selected headers such as From, To, Subject, Date, and delivery metadata to classify relevant messages, maintain a checkpoint, and suppress duplicate processing. It does not retrieve attachments, modify or delete messages, or use Gmail data for advertising, generalized AI-model training, or credit decisions. The narrower `gmail.metadata` scope is insufficient because the Gmail API does not permit the required `q` search parameter with that scope. The feature therefore needs `gmail.readonly` to perform the user-visible, bounded search while remaining unable to change mailbox content.

### `https://www.googleapis.com/auth/gmail.send` (sensitive; primary connection only)

Aspect Marketing Solutions requests Gmail send access only for the separately designated primary owner account. The scope supports explicit owner alerts and, only if the owner later enables both independent send controls, narrowly limited first-contact acknowledgements to clearly identified AMS business inquiries. The secondary account never requests this scope. Automatic replies are disabled by default and remain disabled in the current release candidate. AMS does not send marketing campaigns, unsolicited mail, refunds, account changes, or sensitive decisions. `gmail.send` is the narrowest Gmail scope that permits these owner-authorized sends; broader compose, modify, or full-mail scopes are neither requested nor used.

### Restricted-scope feature category

Select the console category that most closely describes **productivity / task automation**. The Gmail data flow is owner-initiated and provides the identifiable benefit of monitoring narrowly defined operational messages and preventing duplicate handling. If the console presents different labels, record the available choices before selecting rather than guessing.

## Reviewer demonstration plan

Create one unlisted English-language video after the public privacy-policy correction is approved and deployed. Do not show secrets, full message bodies, unrelated mailbox content, or internal identifiers.

1. Show `https://www.aspectmarketingsolutions.app`, its owner-facing Gmail feature description, and visible Privacy and Terms links on the owned domain.
2. Open the public privacy policy and show the Gmail access, use, storage, retention, deletion-request, revocation, sharing, and Limited Use disclosures.
3. Sign in through the normal owner path and show that the owner dashboard is protected.
4. Start primary authorization, show the AMS app name, browser address bar and client identity, and explain `openid`, `email`, `gmail.readonly`, and primary-only `gmail.send`. Do not complete a new grant solely for the recording if the existing grant can be demonstrated safely.
5. Show the separately isolated secondary connection and that it requests no send scope.
6. Show a bounded metadata-only monitoring result, paused task state, persisted checkpoint/deduplication evidence, automatic replies off, and zero notification sends. Redact personal message metadata.
7. Explain encrypted server-side credential storage, isolation between both grants, and that tokens are never exposed to the browser or logs.
8. Show the current revocation/deletion paths accurately: Google Account permissions for immediate revocation and the published privacy contact for a verified deletion request. State that no in-product Gmail disconnect/delete control currently exists.
9. If multiple OAuth client IDs remain in the project, demonstrate or document the data use and exact redirect URI for each client included in the verification request.

## Owner-only exception assessment

AMS currently qualifies for Google's optional **personal-use / limited known users** exception only while Gmail access remains restricted to the owner and a few accounts personally known to the owner, stays below Google's lifetime 100-user cap, and users accept the unverified-app warning. The exception does not waive the Google API Services User Data Policy or Limited Use requirements. It is not a basis for customer-facing Gmail connections, removing the unverified warning, exceeding the cap, or representing the restricted scopes as verified. Because the project is marked In production and uses a third-party server to handle restricted Gmail data, public expansion must remain blocked pending Google data-access verification and any required security assessment.

## Disconnection and deletion implementation finding

Repository review found Gmail connect, callback, status, token refresh, verification, and checkpoint-initialization routes, but no Gmail disconnect or stored-data deletion endpoint. The privacy policy must not claim an in-product disconnect. The safe current behavior is Google-account revocation plus a verified manual deletion request through the published privacy contact. A future in-product operation would require owner authentication, re-authentication or an explicit destructive confirmation, per-slot isolation, provider revocation handling, deletion of the encrypted grant and eligible Gmail-derived state, idempotency, audit evidence without secrets, and tests proving the other Gmail connection and all scheduled-task states remain unchanged. That functionality is intentionally outside this documentation/link correction.

## Remaining release gates

- Owner approval to publish the corrected privacy disclosure and homepage/footer Privacy and Terms links on the owned production domain.
- Consent-screen links, declared scopes, domain ownership, contacts, client redirects, and reviewer demonstration complete.
- Either retain the strictly owner-only limited-user exception or complete applicable Google sensitive/restricted-scope verification and any required security assessment before customer-facing production use.
- Decide whether verified manual deletion is sufficient for owner-only operation or separately approve a designed and tested in-product disconnect/deletion feature.
- Draft PR CI green after any approved code changes.
- Separate explicit authorization for merge and production deployment.
