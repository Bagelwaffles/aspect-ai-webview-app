# AMS paid checkout launch gates

## Default state

New paid sales are opt-in and fail closed. Production capability status, existing customer access, and permission to accept a new payment are separate states.

- `NEXT_PUBLIC_AMS_SUBSCRIPTION_CHECKOUT_ENABLED`: must be exactly `true` before a new Starter, Growth, or Pro subscription checkout can begin.
- `NEXT_PUBLIC_AMS_QUICK_AUDIT_CHECKOUT_ENABLED`: must be exactly `true` in addition to the existing Quick Audit infrastructure checks and the durable Redis launch key being enabled.
- `NEXT_PUBLIC_AMS_CREDIT_TOPUP_CHECKOUT_ENABLED`: must be exactly `true` before an existing subscriber can purchase credit top-ups.
- Missing, malformed, or false flags keep the corresponding checkout closed.
- The public Agent Store reads the same explicit flags so its commercial labels do not infer purchase availability from an agent's production capability.

## Preserved behavior

- Existing subscription billing-portal access and account management remain available.
- The Content Agent's existing production capability/runtime gate is unchanged.
- Stripe prices, keys, webhook configuration, entitlements, customer records, and existing subscriptions are not modified by these launch flags.
- Quick Audit's durable Redis switch remains an additional gate; this change does not write to Redis or assume which Production Redis database is authoritative.
- As separately authorized by the owner on November 19, subscriber credit top-ups are now gated OFF by default at the API and hidden on the account billing page.
- Shopify/TeeAndTrauma payments, catalog, and fulfillment are separate and are not affected.

## Re-enable checklist

Do not set any public sales flag to `true` merely because a Stripe key or deployment is configured. Before reopening a paid offer:

1. Owner confirms the required business licensing and commercial readiness for the actual business activity and jurisdiction.
2. The offer's real deliverables, support process, refund/terms disclosures, and customer-facing claims are reviewed.
3. For Quick Audit, complete a fresh end-to-end paid production acceptance: checkout, signed webhook, durable result, customer retrieval, and replay/idempotency.
4. Verify the production fulfillment path and all relevant service capacity.
5. Obtain explicit owner approval for the exact offer and launch action.
6. Set only that offer's public flag to `true`; for Quick Audit, separately confirm the durable Redis launch key and infrastructure readiness. Reopening credit purchases requires separate approval.
7. Verify public page copy and the corresponding API response before announcing availability.

A passing Preview test, Stripe configuration, or successful health endpoint is not proof that an offer is legally or operationally ready to sell.
