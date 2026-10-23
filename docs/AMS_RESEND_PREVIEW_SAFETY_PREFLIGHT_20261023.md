# AMS Resend Preview — Owner-only, no-send preflight
**October 23, 2026.** Existing feature branch `feat/ams-resend-transactional-preview-20261023` was previously READY at `851c9039fb6c74a4af1cdcc5e28e3a59fd8fd94c`, with restricted Resend credentials. Owner authorizes continuing integration and one conditional future owner-only email test **after** the documented safety gates pass. No email, checkout, production modification, or customer sending has taken place.

## Verified blockers, no changes to payment routing
- Main AMS Stripe **test account** has an active `checkout.session.completed` webhook on `https://www.aspectmarketingsolutions.app/api/webhooks/stripe`.
- Separate AMS Stripe **sandbox** also has checkout completion webhooks directed to existing live AMS infrastructure (website and Cloudflare Worker). No checkout/coupon redemption until isolated. No webhook was changed.
- Resend feature branch has the restricted sender key/domain ID but **does not** have the owner email, owner-auth configuration, or Upstash credentials scoped to another self-test branch. Vercel Preview variables are branch-specific.
- Upstash refused a second **free** database: one-free-database account limit. No upgrade or purchase was made.
- Only available Upstash Free database is `ams-scheduled-tasks-preview`, with hostname `accepted-quetzal-206056.upstash.io`. This may be reused only for *logically namespaced, non-payment Preview proof storage* if explicitly configured; it is NOT a dedicated physical datastore, not authorization to reuse customer payment data, and not a substitute for payment-isolation proof.
- A separate Aiven Preview Valkey service exists, but it is not plug-and-play with the code's `@upstash/redis` REST client. Do not cross-wire it or repurpose existing owner data.

## One consolidated read-only guard
- `lib/server/quick-audit-resend-preview-preflight.ts` validates exact Preview environment and branch, the **unset** delivery-enable switch, Resend key presence/domain ID, owner session and inbox config, approved Preview Upstash REST hostname, a separate explicitly named proof key namespace, and absence of default Redis reuse.
- `GET /api/internal/quick-audit-resend-preflight` requires the existing AMS owner authorization and returns **only boolean checks and remaining gates**. No values, tokens, or recipient email are returned. Missing owner authentication denies access. **No POST route, email send, Stripe call, Redis write, or new sending permission** was created.
- This is CONFIGURATION DIAGNOSTICS only; even an all-green configuration result must never be interpreted as authorization or readiness to send. The customer delivery worker remains disabled.

## Next integration gates
1. Securely configure `AMS_OWNER_EMAIL`, `AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL` and, if the owner explicitly chooses the shared Preview-only proof store, the encrypted branch-scoped `AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL`, `AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN`, and namespace `AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE`. Do not retrieve API keys into chat or GitHub.
2. Independently verify proof-store separation and basic read/write via an authenticated owner-only action; complete the *read-only* domain-proof writer/reader integration with temporary administrative credential outside the sender runtime.
3. Establish that any real Stripe test checkout/webhook and durable paid-audit records remain completely isolated from the production website/worker. Until then use synthetic CI fixtures only.
4. Only after authentication, isolation and single-send controls are verified, use the prior conditional owner approval for one owner-only email, then independently inspect RFC From/Reply-To/SPF/DKIM/DMARC and replay suppression.
5. No merge, production deploy, customer mail, paid upgrade, Stripe mutation or automatic sending without separate approval.

Avoid additional deployments until all outstanding configuration changes are batched into one validated Preview release candidate.
