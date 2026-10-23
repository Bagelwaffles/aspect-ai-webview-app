# AMS transactional email via Resend — Preview integration gate

**Status: DRAFT / HOLD; no sending enabled.** Complements existing audit sender identity PR #299, audit worker PR #295 and self-test coupon PR #290. This document is not an approval to change DNS, spend money, issue credentials, enable a customer job, or merge/deploy.

## Why Resend

The owner independently verified on 2026-10-23 that:
- `kimberley@aspectmarketingsolutions.app` is active for incoming forwarding through Cloudflare Email Routing into owner Gmail;
- Gmail's Send mail as list contains only `Kimberley Avers <kimberleyaversbiz@gmail.com>`;
- no verified company-domain outbound provider is configured.
Do not mistake a Google OAuth `gmail.send` grant for company-domain authority.

Resend's published transactional Free plan currently lists 3,000 emails monthly, 100 emails daily, 3 domains, and a $0 entry price. Provider may change limits; verify immediately before onboarding. **No plan has been purchased or enrolled.**

## Customer identity and safe DNS changes

Required visible sender: `Aspect Marketing Solutions <kimberley@aspectmarketingsolutions.app>`.
Required Reply-To: `kimberley@aspectmarketingsolutions.app`.
Private personal Gmail address must never appear as sender or unintended CC/BCC. The owner Gmail inbox remains the destination for replies forwarded through Cloudflare.

Future operator-only steps:
1. Create or access Resend Free account through the owner's connected Chrome/Work (no TinyFish), add *sending-only* `aspectmarketingsolutions.app` domain, and **retrieve the actual DNS values from that account**. Do not invent or copy other domains' records.
2. Inspect current Cloudflare DNS before any mutation. Add Resend's own DKIM and return-path SPF/MX at the exact Resend-provided hostnames. **Preserve root MX records used by Cloudflare Email Routing**, existing DKIM and DMARC. Merge root SPF only if the provider specifically requires it; never publish two `v=spf1` TXT policies at the same hostname. Record prior values and obtain explicit owner approval before any DNS change.
3. Verify Resend sending capability and authenticated domain status. Do not enable Resend's inbound-receiving capability or change Cloudflare inbound routing.
4. Generate a server-side Resend API key with the minimum permissions necessary for email sending *and* reading domain-verification metadata. Save it **directly** in Vercel's separate Preview environment; never paste it into GitHub or chat.
5. Configure only the audited branch's isolated Preview variables:
   - `AMS_RESEND_API_KEY` (secret)
   - `AMS_RESEND_DOMAIN_ID` (verified Resend domain UUID)
   - `AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED=false` until final owner test is ready; never set True in production
   - Existing `AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL` for owner-only non-customer testing
6. After independent Stripe test webhook + Redis isolation, wire the Resend adapter to an authenticated owner-only dispatcher, and authorize one test transaction using the **existing unredeemed** $44-off owner coupon. No production Stripe checkout/webhook/Redis routing.
7. Confirm the actual customer-view received message with From, Reply-To, SPF/DKIM/DMARC results, zero private identity exposure, content accuracy and no duplicate audit delivery; inspect provider message ID **and independent inbox proof**. Delivery API HTTP 200 is not proof of inbox acceptance.
8. Add bounce/complaint webhooks with signature validation, persistent suppression, safe reconciliation, API usage alerts and delivery recovery before wider customer sending. Marketing, campaign, and AI auto-replies require separate consent/controls, and should NOT use an audit-purchase transaction as marketing opt-in.

## Current code — restricted sender separation (2026-10-23 revision)

`lib/server/quick-audit-resend-sender.ts` now accepts **only** `AMS_RESEND_SEND_API_KEY`, which must be a Resend **Sending access** key restricted to verified domain `aspectmarketingsolutions.app` (ID `60c30272-c705-493a-9be4-0b7df9ab31c8`). This credential is used only with `POST https://api.resend.com/emails`. No `GET /domains` call or `full_access` credential belongs in the sending adapter.

Resend does not expose domain-read operations to `sending_access` keys. Accordingly:
- `lib/server/quick-audit-resend-domain-proof.ts` defines `inspectResendDomainForOwner`, an **administrative one-time helper** requiring a separate owner's full-access credential that should never be stored in mail worker runtime env. It makes a read-only `GET /domains/:id`, checks exact verified domain identity and sending enabled, and returns non-secret proof.
- The worker requires a separately injected `readDomainProof` from a trusted storage/read path. The proof expires in **15 minutes**, cannot self-renew, and must match exact provider domain ID, domain name, API-sourced status, and enabled sending. Missing/expired evidence fails closed before send.
- **Integration still pending:** Build an authenticated *owner-only* proof writer and a bounded protected Redis proof reader. Neither routine is exposed as a public route in this PR. Do not fabricate proof from an environment boolean or an owner claim, or give the email worker an admin key. Until the independent proof handoff is implemented, there is intentionally no configured sender instance that can dispatch live messages.
- The response From address identifies what was submitted to Resend, **not independent recipient-header proof**. A controlled inbox test must validate actual RFC From, Reply-To, SPF, DKIM, DMARC and no personal Gmail leakage.

Existing customer Quick Audit delivery outbox still prevents duplicate provider submission after ambiguous outcomes; Resend's idempotency key is a supplemental 24-hour safeguard.

Important: The signed-in Resend dashboard now shows **Domain VERIFIED, Forge Enabled**; this was corroborated from the connected Chrome tab and recorded in PR #300. **No API key exists in the Vercel branch scoped env inventory yet.** Owner has now approved proceeding with a restricted-key Preview integration and controlled owner test; do not misread that as approval to send customer emails, turn on production, purchase services or redeem Stripe coupon outside isolated setup.

### Owner-only key setup and safe storage

In connected Chrome via ChatGPT Work, choose Resend API Keys → Create API Key:
- Name `AMS Quick Audit Preview — Sending Only`
- **Permission: Sending access**
- **Domain restriction: aspectmarketingsolutions.app**
- Never choose Full access for the sending key.
- Save the one-time token directly to the **isolated Preview branch** of Vercel project `aspect-ai-overlord`, name `AMS_RESEND_SEND_API_KEY`, encrypted server-side, never in chat, Github issues, screenshots, or stdout.
- Set `AMS_RESEND_DOMAIN_ID` to the known UUID in the same Preview branch.
- Keep `AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED` unset/false. Do NOT store any full-access Resend credential in the Vercel mail sending environment.
- Treat connecting a key as configuration only, not permission to send; real owner-only dispatch remains gated on isolated Preview webhook+Redis and authenticated proof writer/reader.
- If Work cannot securely transfer the one-time token from Resend to Vercel, stop and let owner enter it directly; do not pass it through ChatGPT messages.

## Acceptance tests — revised

`tests/quick-audit-resend-sender.test.ts` covers Preview-only flag, exact known domain ID, independent verified proof, expiry after fifteen minutes, branded From/Reply-To, deterministic provider idempotency, provider failure, an admin-only provider probe using a synthetic credential, and ensuring the send-only worker calls **POST /emails only**.

References:
- https://resend.com/pricing
- https://resend.com/docs/api-reference/domains/get-domain
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/changelog/idempotency-keys
- https://developers.cloudflare.com/email-service/configuration/domains/


## Isolated provider attestation storage (2026-10-23 validation extension)

`lib/server/quick-audit-resend-domain-proof-store.ts` now implements protected Preview-only Redis proof read/write with a strict `ams:preview:quick-audit:<dedicated-id>:` namespace and **900-second TTL**. The separate `verifyAndRecordResendDomainForOwner` helper only runs under a separately authenticated, human-approved administrative Preview invocation using a temporary provider credential. It performs a real provider domain check and stores ONLY the resulting non-secret proof; it does not store the credential. Production or expired/wrong-domain proofs are rejected. The mail worker only gets an injected read-only `readDomainProof` and a domain-scoped `sending_access` token; it never receives the administrative token.

**Not yet connected:** there is no owner-authenticated proof-verifier route/job invoking the helper, no associated dedicated Preview Redis configuration in this branch, and no real send-only key in Vercel. This is intentional to avoid creating an unprotected key or customer-email endpoint. Validation uses synthetic provider responses in tests. Resend dashboard domain verification is complete but is not itself proof that the application sent or delivered anything. An owner-controlled provider-side key creation and safe Vercel entry must occur in Work; do not paste tokens in chat.


## Approved isolated Preview verification deployment — 2026-10-23

Owner authorized a **non-sending Preview deployment** of this exact feature branch solely for examining Vercel startup, branch-specific environment-variable presence and diagnostics. Sender switch `AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED` remains unset/false; no actual audit email, production release, customer data, Stripe checkout, coupon, PR merge or credential disclosure is permitted. If GitHub-to-Vercel integration deploys this documentation-only commit, verify its branch, SHA and `target=preview` before describing it as a successful deployment. Keep all runtime actions read-only and non-destructive. A successful Preview build does not establish that the owner-authenticated proof refresh or dispatcher is wired.
