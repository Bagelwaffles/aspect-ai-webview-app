# AMS Shopify Agent — Vercel-native migration

## Goal

Run the Shopify Agent inside the existing AMS Next.js/Vercel backend instead of relying on n8n for core Shopify execution.

## Current cutover state

Implemented on Vercel-native code:

- Shopify Admin GraphQL adapter in `lib/server/shopify-admin.ts`
- protected internal route at `/api/internal/agents/shopify`
- strict `*.myshopify.com` host validation to avoid arbitrary outbound targets
- Shopify Admin API pinned to `2026-07`
- credentials remain server-side only
- configuration fails closed when the store domain or Admin token is absent/invalid
- read operations:
  - verify authorized shop identity
  - list recent products
- first write operation:
  - create product as `DRAFT` only
  - requires internal AMS authentication
  - requires `approval: "owner-approved"`
  - requires `confirmWrite: true`
- automated tests cover configuration, host validation, API URL/token handling, list bounds, DRAFT enforcement, and GraphQL failure behavior

## Vercel production environment

Set these only after obtaining the owner-authorized Shopify Admin credentials:

```text
AMS_SHOPIFY_STORE_DOMAIN=<store>.myshopify.com
AMS_SHOPIFY_ADMIN_ACCESS_TOKEN=<server-side-admin-token>
AMS_SHOPIFY_ADMIN_API_VERSION=2026-07
```

Never expose the Admin token through `NEXT_PUBLIC_*`, client JavaScript, logs, issue bodies, or screenshots.

## Protected route behavior

All calls require the existing AMS internal Bearer authorization.

### Read status

`GET /api/internal/agents/shopify`

When unconfigured, the route returns a fail-closed status and does not attempt a Shopify request.

When configured, it performs a read-only shop identity query.

### Verify

```json
{ "action": "verify" }
```

### List products

```json
{ "action": "list-products", "limit": 10 }
```

### Controlled first write

```json
{
  "action": "create-draft-product",
  "approval": "owner-approved",
  "confirmWrite": true,
  "product": {
    "title": "AMS Shopify controlled test",
    "tags": ["ams-controlled-test"]
  }
}
```

The adapter forces `status: DRAFT`. It cannot use this path to publish an ACTIVE product.

## Production acceptance gate

Do not label the Shopify Agent Live until all of these are verified:

1. Vercel production contains the authorized store domain and Admin API token.
2. `GET /api/internal/agents/shopify` returns the intended Shopify store identity.
3. A controlled DRAFT product is created through the Vercel-native route.
4. The draft appears in the intended Shopify Admin store and remains unpublished.
5. The resulting product ID and state are recorded.
6. No Shopify execution depends on n8n.
7. Wider mutations such as product updates, inventory changes, publication, collections, discounts, orders, or fulfillment remain disabled until each receives its own narrow approval and verification path.

## n8n

Existing n8n Shopify workflows may remain as historical/recovery references, but they are not required by this Vercel-native route. Do not route core Shopify Agent execution back through n8n after cutover.
