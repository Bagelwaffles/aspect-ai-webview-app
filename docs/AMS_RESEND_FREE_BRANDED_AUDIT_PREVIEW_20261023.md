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

## Current code

`lib/server/quick-audit-resend-sender.ts` implements provider-bound `QuickAuditTransactionalSender` with:
- no runtime initialization without Preview flag and both missing-by-default credentials;
- `GET https://api.resend.com/domains/:domain_id` checked just before send, requiring exact domain name, `status=verified`, `capabilities.sending=enabled`;
- explicit branded From and Reply-To, refusal of personal Gmail identity;
- `POST https://api.resend.com/emails` with plaintext report and SHA-256, content-bound idempotency key (Resend advertises 24h retention; the existing durable outbox remains primary);
- no automatic retry of uncertain sends and no secret-bearing logs;
- returned From is only the value submitted to provider, not proof of final Received headers.

**Not implemented in this PR:** public customer sending, authenticated dispatcher, complete payment webhook isolation, DNS changes, actual Resend-domain setup, API credential, active scheduler, unsubscribe or bounce handling, customer email reply automation, production deployment. No protected branch existing delivery worker or Stripe state was mutated.

## Acceptance tests

`tests/quick-audit-resend-sender.test.ts` covers absence of config / production guard, provider domain and sending capability, branded From/Reply-To, deterministic idempotency, malformed provider acceptance, send failures, and no personal-account fallback. Only call this tested code integrated once owner provider-side acceptance exists. Keep both this and its parent in Draft until real provider and customer-view evidence passes.

References:
- https://resend.com/pricing
- https://resend.com/docs/api-reference/domains/get-domain
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/changelog/idempotency-keys
- https://developers.cloudflare.com/email-service/configuration/domains/
