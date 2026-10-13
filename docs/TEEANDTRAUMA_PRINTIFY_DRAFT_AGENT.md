# TeeAndTrauma Printify Draft Agent (isolated build, not yet deployed)

This extends the existing AMS Shopify/product-management implementation. It is
**not a new store or SaaS agent in the catalog**.

## Current user-approved source

- Shopify store: `mwh1yj-jc.myshopify.com`
- Shopify product (preserve): `gid://shopify/Product/15424390594660`
- Original Shopify listing: `Laugh Through the Trauma — Black Graphic Tee`
- Approved reconstructed artwork: `teeandtrauma-laugh-through-trauma-approved-v1-4500x5400.png`
  (Shopify CDN URL is pinned in `lib/server/teeandtrauma-printify-agent.ts`)
- Catalog target: actual Printify **Gildan 5000** blueprint returned by Printify;
  do not hard-code a print provider or size/variant ID.
- Only black unisex sizes S–3XL that are currently available.
- **No publication, orders, or Shopify product mutation.**

## Existing parts reused

- AMS protected internal agent route authorization
- Existing Printify API operation patterns from `lib/printify.ts`
- Existing Shopify draft product and its artwork file reference
- Existing Redis connection/locking infrastructure

The former `app/products/page.tsx` UI calls missing `/api/printify/*` routes.
This new narrow route adds supported backend operations without exposing a
Printify key or internal AMS bearer token to the browser.

## Setup (owner-managed, secrets must never be pasted in chats, issues or commits)

Configure server-side environment variables **for Preview first**:

```dotenv
PRINTIFY_API_KEY=<authorized Printify personal-access token>
AMS_PRINTIFY_SHOP_ID=<numeric ID of the existing Printify Shopify store>
AMS_PRINTIFY_DRAFT_WRITES_ENABLED=false
```

The existing AMS internal bearer key must already be configured as
`AMS_INTERNAL_API_KEY`.

For one approved Printify draft creation only, the existing Redis REST URL/token
must be configured (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`;
the pre-existing `KV_REST_API_URL` and `KV_REST_API_TOKEN` aliases are supported).
A durable Redis lock prevents concurrent duplicate creation. It deliberately
holds a five-minute TTL, even after a successful request; retries must re-scan
for the Shopify-linked draft before any new write.

Only after catalog/provider/prices are confirmed, set
`AMS_PRINTIFY_DRAFT_WRITES_ENABLED=true` **in Preview**. Leave it false in
production until a separately authorized launch.

## Protected API (server-to-server only)

`GET /api/internal/agents/printify`: fail-closed connection identity / disabled state.

`POST /api/internal/agents/printify` with a private internal bearer token:

- `{"action":"list-garments"}`: read-only Gildan 5000 blueprint/provider lookup
- `{"action":"provider-plan","providerId":123}`: read-only black size,
  fulfillment-cost and shipping inspection. Use provider ID returned by
  `list-garments`, not this example.
- `{"action":"upload-approved-artwork","approval":"owner-approved","confirmWrite":true,"sourceShopifyProductId":"gid://shopify/Product/15424390594660"}`:
  import/reuse the **exact** approved Shopify CDN image into Printify Media Library
- `{"action":"create-printify-draft","approval":"owner-approved","confirmWrite":true,"sourceShopifyProductId":"gid://shopify/Product/15424390594660","providerId":123,"variantIds":[456],"retailPriceCents":2999,"imageId":"<ID returned by upload>"}`:
  approval-gated **Printify-only** draft creation.

The example provider, variant and retail price above are placeholders, **not
confirmed costs or recommendations**. The API will reject a variant with no
independently reported Printify `cost` in cents, an unavailable size/color, or
insufficient gross margin. Actual shipping also needs review before price
approval.

## Safety gates

1. Requires the existing internal AMS bearer authorization for **all** calls.
2. Requires a single configured Printify shop ID; validates it is a Shopify
   sales channel before touching it.
3. Only a verified Gildan 5000 catalog blueprint and offered provider are used.
4. Exact approved Shopify CDN artwork URL is pinned; no caller-provided URLs
   (no SSRF). Reuses a matching Media Library entry only after filename/dimensions
   check; duplicates or mismatches fail closed.
5. Checks all Printify shop product pages for the original title/source marker.
   Aborts on incomplete pagination or any duplicate match.
6. Creation additionally requires a Redis lock, owner confirmation, and
   a Preview-only write toggle. No delivery/order/payment/publish routes exist.
7. The original Shopify product remains a DRAFT; the agent creates a Printify
   *draft counterpart*, **not** a second Shopify listing.
8. Do not use Printify's Publish button or API until the separate Shopify
   existing-product migration plan is reviewed. Shopify draft products cannot
   be assumed to map or sync automatically.

## Acceptance still required

- Verify the existing Printify Shopify shop ID from Printify API.
- Run read-only plan for a real provider, confirming costs, shipping and sizes.
- Confirm image DPI, transparency, placement and real provider print-area details.
- Preview-only upload; verify returned media ID and resolution in Printify.
- Preview-only single-draft creation; verify one Printify product and no new
  Shopify product. Tests do not replace live Printify acceptance.
- Perform operator/browser migration into the **existing Shopify product**
  separately, after owner review. Test fulfillment routing and shipping.
- Plan change/Shopify subscription may be needed before accepting live orders.
- No Black Friday publishing, discount, payment or sample order without approval.

**Release decision: HOLD.** Do not merge or deploy before tests, credentials,
provider-cost checks, and owner acceptance pass. Existing OAuth/PR #262 and
production operations are out of scope.
