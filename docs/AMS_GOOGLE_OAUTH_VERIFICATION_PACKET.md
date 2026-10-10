# AMS Google OAuth Verification — submission-ready briefing

**Prepared:** October 10, 2026. **Status: NOT SUBMITTED.** This is a preparation packet, not evidence of approval. Public homepage change remains Draft until explicitly published; PR #262 remains Draft/HOLD.

## Project identity (from owner-verified Google Console audit)

| Field | Value |
| --- | --- |
| Google Cloud project ID | `aspect-marketing-solutions` |
| Google Cloud project number | `13801315898` |
| App name | Aspect Marketing Solutions |
| Homepage | https://www.aspectmarketingsolutions.app |
| Privacy | https://www.aspectmarketingsolutions.app/privacy |
| Terms | https://www.aspectmarketingsolutions.app/terms |
| Owner / developer contact | kimberleyaversbiz@gmail.com |
| Search Console property | `sc-domain:aspectmarketingsolutions.app` (owner previously verified) |
| OAuth audience / Google publishing status | External / In production (previously observed) |
| Gmail connections currently intended | Primary owner `kimberleyaversbiz@gmail.com`, read+send; secondary owner `whitestarline1@gmail.com`, read-only |
| Sensitive scope | `https://www.googleapis.com/auth/gmail.send`, primary only |
| Restricted scope | `https://www.googleapis.com/auth/gmail.readonly`, both accounts |
| Identity scopes | `openid`, `email` |
| Verification status | Branding not verified; Gmail sensitive and restricted scopes unverified |
| Previous user count | 3 / 100 as last reported; recheck in console before submission |

**Critical:** A separate Google project described historically as `AMS PR14 Staging` is NOT the Gmail OAuth project. Do not create a new Gmail client/project. The existing Google Cloud project also has other OAuth clients (including a YouTube Upload client); inventory them and show them all in the reviewer video as Google requires. Do not remove/rotate clients without a dependency review.

Google Auth Platform landing page (owner must sign in): https://console.cloud.google.com/auth/overview?project=aspect-marketing-solutions

## Exact, truthful product description for Google reviewer

Aspect Marketing Solutions (AMS) is a small-business marketing and automation SaaS. Its owner-only Gmail integration, currently staged behind authenticated Preview controls, connects two separately authorized owner mailboxes. The integration performs bounded Gmail searches for business inquiries, paid orders, Google Play notices and account-security notifications; it accesses selected message headers such as sender, recipient, subject, date and RFC message identifiers, and records limited alert categories, time checkpoints and deduplication metadata. It does not retrieve message bodies or attachments for AI analysis.

For the primary authorized owner mailbox only, AMS uses Gmail send access to deliver generic operational notifications to the same owner inbox. A second, owner-approved but currently OFF feature can send one fixed acknowledgment to an eligible **new** AMS business inquiry after separate runtime enablement and successful controlled recipient testing. No unrestricted AI-generated replies, customer Gmail authorization, outbound campaigns, automatic payment decisions, refunds or order confirmations are currently offered. The secondary mailbox never sends.

Current Gmail implementation is in Draft PR #262, not active on the public production site; do not describe it as already customer-available.

## Scope justifications — copy to the Google Cloud Data Access fields

### `https://www.googleapis.com/auth/gmail.readonly` (restricted; primary and secondary)

AMS uses read-only Gmail access for its owner-controlled operational monitoring feature. After each account owner explicitly authorizes their mailbox, AMS performs time-bounded searches for business inquiries, marketing-audit requests, orders and payments, Google Play notices and account-security alerts. It requests Gmail message metadata, including selected headers such as From, To, Subject, Date, Reply-To and Message-ID, to classify relevant notices, report owner alerts, maintain checkpoints and prevent repeated processing. AMS does not fetch message bodies or attachments, modify or delete mailbox messages, send Google user data to marketing advertisers, or use the data to train generalized AI models.

The narrower `gmail.metadata` scope does not support the Gmail API's `q` search parameter required to bound messages to these explicit business categories. AMS needs `gmail.readonly` for query-based retrieval while avoiding modification capabilities. Access is controlled per owner mailbox; the secondary account is exclusively read-only.

### `https://www.googleapis.com/auth/gmail.send` (sensitive; primary only)

AMS uses `gmail.send` exclusively for the primary owner-authorized mailbox, to send generic owner-facing notices about actionable task and Gmail-monitoring results. A separate owner-controlled feature, initially OFF, can acknowledge a narrowly identified new AMS business inquiry with a fixed, honest message in the existing Gmail thread only after specific activation and testing. AMS does not currently generate unrestricted AI answers, send marketing campaigns, confirm orders, or make payment/refund/credential changes based on email. The secondary mailbox never requests send access. `gmail.send` is the narrowest permission that allows these primary-owner sends without granting compose/modify/delete or broader mailbox control.

### `openid` and `email`

These are used to bind each authorization to the expected owner account, reject wrong-account consent and support account-isolated encrypted credentials. They do not justify customer-facing access.

**Do not** add scopes for future AI response features until that feature is implemented, disclosed and justified. Google's review requires the narrowest scope for the functionality actually demonstrated.

## Branding and public-data evidence

- Current production Privacy / Terms / homepage return HTTP 200, and homepage footer links to both. PR #270 published the truthful Gmail Limited Use and manual deletion disclosures.
- Production homepage currently does not explicitly explain its Gmail monitoring features. The isolated Draft PR for this packet adds a clearly labeled, owner-only Preview section to the homepage. **Publish and check this correction before a verification submission.**
- Contact, app identity, Search Console ownership and redirects were previously inventoried. Reconfirm their actual live Google Cloud values without exposing secrets; verify *all* authorized domains including any legacy Vercel alias.
- Google-side revocation does not delete the server's stored encrypted grant or monitoring data. The public privacy policy describes a verified *manual* AMS deletion request. See `docs/AMS_GMAIL_MANUAL_DELETION.md` on `main`. There is no in-product Gmail disconnect/delete control.
- The established real primary alert receipt passed on October 10, 2026. Independent real customer-thread acknowledgment remains blocked until a designated, isolated external tester mailbox is used and the feature restored to OFF afterward.
- Google user-data processing and any AI use should remain consistent with the published Limited Use disclosure; do not upload customer message content into a reviewer video.

## Reviewer demo — required real recording (do not fabricate)

**Prerequisite:** authenticated owner access to reviewed Preview, real Google consent screen visible in English, and complete OAuth client inventory for the SAME Google Cloud project.

Record an unlisted, accessible English-language walkthrough showing:

1. URL bar on the owned AMS homepage, app name, explicit owner-only Gmail description, and Privacy / Terms links.
2. The live privacy-policy section for Gmail: accessed data, bounded searches, usage, credential security, nonsharing, retention and actual manual deletion contact.
3. Normal owner login and protected Scheduled Tasks / Gmail Connections UI.
4. Primary OAuth authorization flow with the SAME Google Cloud client identity and scopes (`openid`, `email`, `gmail.readonly`, `gmail.send`). Avoid revoking/re-consenting an existing grant merely for a video unless Google requires a fresh consent screen and the owner has authorized doing so.
5. Secondary authorization with no `gmail.send`. Show that the two account slots are isolated and do not reveal tokens.
6. Successful preview metadata-only monitoring, checkpoint/deduplication and a verified primary owner-alert inbox receipt. Demonstrate only capabilities already actually functioning; do not claim a live external customer reply if not tested.
7. The owner-only sending/acknowledgment controls, currently OFF, and the approval boundary for sensitive replies, publishing, billing and payments.
8. Google-side access revocation option and AMS manual deletion-request workflow, accurately distinguished.
9. Every other OAuth client ID associated with the project, including any YouTube client, with its real use case, consent screen (if applicable) and redirects. **Do not delete or invent clients to simplify the video.**

Reviewer video must show app name/branding, consent, exact scope requests and where each scope is used. Redact message addresses/details except test data and never show secrets.

## Verification and cost gates

- **Google status:** External / In production in owner's earlier audit; this is NOT scope verification. The existing 100-user cap and unverified warning remain until verification or an accepted exception.
- **Brand verification first:** app name/homepage/privacy/terms, owned domains, in-product disclosure, contact information and consent-screen branding.
- **Data Access verification:** `gmail.send` is sensitive; `gmail.readonly` restricted. Submit rationale and real demo only when the website and reviewer demonstration are accurate.
- **Restricted data security assessment:** because AMS handles restricted Gmail data server-side, Google may require a third-party, potentially paid and recurring assessment. **Do not commit to or purchase one without owner consent.**
- **Personal-use exception:** Google provides one for genuinely personal-use apps with fewer than 100 users; this is not automatically applicable to a revenue-generating third-party SaaS, and it does not waive the API Services User Data Policy. Get an explicit eligibility determination or complete standard verification before marketing customer-facing Gmail authorization.
- **Separate Preview / production:** do not conflate AMS local `AMS_GMAIL_CONSENT_MODE=testing` with Google's Cloud Console publishing status. Do not change expiry, enable send/reply, merge PR #262 or activate a scheduled task as part of verification paperwork.
- **Other clients:** Cloud reviewers require demonstration of all OAuth clients registered to the verification project; a separate YouTube app and legacy redirect/domain need impact review. Do not remove or rotate them without approval.

## Owner / Work handoff (minimal)

1. Open the existing Google Cloud project, Google Auth Platform > Verification Center / Branding / Audience / Data Access. Confirm project and OAuth clients.
2. Publish the small separately approved public homepage Gmail disclosure PR, then recheck live URLs and verified authorized-domain ownership.
3. Prepare actual reviewer demo with existing protected Preview; request interaction ONLY for owner sign-in or Google consent.
4. Use the scope justifications above; request **brand verification** and prepare sensitive/restricted-scope submission. Pause before any paid security assessment or destructive OAuth cleanup.
5. Return Google's exact application submission status, missing validations, objections, and next actions. Keep Draft PR #262 and all 27 existing scheduled tasks unchanged until separate release authorization.

## Primary Google documentation

- https://support.google.com/cloud/answer/13464321?hl=en
- https://support.google.com/cloud/answer/13464323?hl=en
- https://support.google.com/cloud/answer/15549135?hl=en
- https://support.google.com/cloud/answer/13465431?hl=en
- https://support.google.com/cloud/answer/13804565?hl=en
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/terms/api-services-user-data-policy
