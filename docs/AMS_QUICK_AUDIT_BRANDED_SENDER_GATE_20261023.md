# AMS Quick Audit branded outbound identity gate (Preview only)

## Required customer-visible identity
- RFC 5322 From: `Aspect Marketing Solutions <kimberley@aspectmarketingsolutions.app>`
- Reply-To: `kimberley@aspectmarketingsolutions.app`
- Customer replies already route to the primary owner Gmail inbox through the existing Cloudflare inbound forwarding rule.
- **Receiving mail is not evidence of outbound authorization.** Forwarding an email does not verify a Gmail send-as alias, and a Google OAuth grant for `gmail.send` on the personal primary Gmail account is NOT permission to represent the company-domain From without a verified alias/provider.

## Code gate
The Preview-only delivery worker now REQUIRES `QuickAuditTransactionalSender.inspectSender()` to return the actual provider's accepted business sender, matching address, display name and reply-to. Missing, pending, mismatched, or errored identity checks return `held` and leave the queued audit available for later safe processing; no claim or send occurs.

The worker explicitly requests the real From address, name and Reply-To from the sender implementation. After sending it also requires the provider acceptance response to confirm the same business From; a mismatch is treated as uncertain with NO automatic retry to avoid duplicate delivery.

These checks are not a substitute for inspecting the final message headers and recipient inbox. A future concrete sender adapter MUST:
1. Use an authorized transactional provider with the domain's sender identity verified (Gmail sendAs `verificationStatus=accepted`, Google Workspace, or a domain-verified transactional sender).
2. Emit actual RFC 5322 From, Reply-To and display name matching the fixed identity; never silently fall back to the personal Gmail address.
3. Obtain independent acceptance and inbox evidence in a single owner-only Preview pilot, then capture authentication/deliverability results (SPF, DKIM, DMARC, sender reputation, possibly "via"/"on behalf of" warnings).
4. Separate automated transactional fulfilment from opt-in marketing nurture, and respect bounce suppression/replies. Provider acceptance != recipient delivery.

**No transport, credentials, domain DNS, payment, public route, Cron job, or customer send are enabled in this branch.** The worker remains owner-only and Preview-only. The existing $44-off one-time test coupon is untouched. Stripe test webhook and Redis isolation remain prerequisites.

## Operator browser verification steps

In the existing owner Gmail account, use **ChatGPT Work with the owner's connected Chrome browser**, never TinyFish, to open https://mail.google.com/mail/u/1/#settings/accounts. Locate **Send mail as** and inspect whether the existing `kimberley@aspectmarketingsolutions.app` alias exists, is verified and displays **Aspect Marketing Solutions**; inspect reply-to.

Google's official help (https://support.google.com/mail/answer/22370) notes recipients may see the primary Gmail address, including "on behalf of" in some email clients. Google also plans to end Gmail third-party send-as support January 2027; do not depend on an unverified personal Gmail alias as the permanent customer-delivery channel.

If no verified sender currently exists, STOP automated send and use a properly authorized company-domain outbound service. Current Cloudflare **Email Routing** only establishes inbound forwarding; Cloudflare Email Sending to arbitrary customers requires Workers Paid, separate authorization and sender-domain onboarding. Customer-facing deliverability should be tested with actual received headers before launch.

## Acceptance before activation

- Existing sender identity verified independently against provider API or authorized console;
- no hidden personal Gmail From fallback and real Reply-To handling;
- email delivered under AMS From to an owner-controlled external inbox during the isolated Preview-only paid-audit test;
- one paid audit completed, queued, submitted and independently received only once;
- bounce and uncertain responses held and surfaced, not silently retried;
- sender account/domain compliance and Google OAuth verification respected;
- production rollout and public customer auto-send separately approved.
