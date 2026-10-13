import assert from "node:assert/strict"
import test from "node:test"

import {
  APPROVED_ART_URL,
  APPROVED_ART_FILENAME,
  SOURCE_MARKER,
  SOURCE_SHOPIFY_PRODUCT_ID,
  TeeAndTraumaPrintifyAgent,
  isApprovedPrintifyArtwork,
  isBlackTargetSize,
  isMatchingPrintifyProduct,
  resolvePrintifyDraftConfig,
  verifiedRetailPriceCents,
} from "../lib/server/teeandtrauma-printify-agent"

const env = {
  NODE_ENV: "test",
  PRINTIFY_API_KEY: "sample_test_printify_token_123456789",
  AMS_PRINTIFY_SHOP_ID: "4321",
  AMS_PRINTIFY_DRAFT_WRITES_ENABLED: "true",
} as NodeJS.ProcessEnv

type Seen = { path: string; method: string; body: Record<string, unknown> | null }
function harness(products: Array<Record<string, unknown>> = [], catalogCost = 900) {
  const seen: Seen[] = []
  const routes: Record<string, unknown> = {
    "/v1/shops.json": [{ id: 4321, title: "My Shopify Store", sales_channel: "shopify" }],
    "/v1/catalog/blueprints.json": [{ id: 6, title: "Unisex Heavy Cotton Tee", brand: "Gildan", model: "5000" }],
    "/v1/catalog/blueprints/6/print_providers.json": [{ id: 12, title: "Test US Provider", decoration_methods: ["dtg"] }],
    "/v1/catalog/blueprints/6/print_providers/12/variants.json": {
      variants: [
        { id: 123, title: "Black / S", cost: catalogCost, is_available: true },
        { id: 124, title: "Black / M", cost: catalogCost, is_available: true },
        { id: 125, title: "White / S", cost: catalogCost, is_available: true },
        { id: 126, title: "Black / L", cost: catalogCost, is_available: false },
      ],
    },
    "/v1/catalog/blueprints/6/print_providers/12/shipping.json": { standard: { price: 499 } },
    "/v1/shops/4321/products.json?page=1&limit=50": { data: products, last_page: 1 },
    "/v1/uploads/images.json": [{
      id: "approvedart12345", file_name: APPROVED_ART_FILENAME, width: 4500, height: 5400,
    }],
  }
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname + url.search
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
    seen.push({ path, method, body })
    if (method === "POST" && path === "/v1/shops/4321/products.json") {
      return Response.json({ id: "newprintify12345", title: "Laugh Through the Trauma — Black Graphic Tee", blueprint_id: 6, print_provider_id: 12 })
    }
    if (method === "POST" && path === "/v1/uploads/images.json") {
      return Response.json({ id: "approvedart12345", file_name: APPROVED_ART_FILENAME, width: 4500, height: 5400 })
    }
    const response = routes[path]
    return response === undefined
      ? Response.json({ error: "Unexpected URL" }, { status: 404 })
      : Response.json(response)
  }) as typeof fetch
  return { seen, fetcher }
}

test("Printify API credentials and shop identity fail closed", () => {
  assert.equal(resolvePrintifyDraftConfig({ NODE_ENV: "test" }), null)
  assert.equal(resolvePrintifyDraftConfig({ ...env, PRINTIFY_API_KEY: "replace-with-printify-api-key" }), null)
  assert.equal(resolvePrintifyDraftConfig({ ...env, AMS_PRINTIFY_SHOP_ID: "other" }), null)
  assert.equal(resolvePrintifyDraftConfig(env)?.shopId, 4321)
})

test("only the exact approved Shopify CDN asset is permitted", () => {
  assert.equal(isApprovedPrintifyArtwork(APPROVED_ART_URL), true)
  assert.equal(isApprovedPrintifyArtwork("https://attacker.example/asset.png"), false)
})

test("black sizes are narrowly matched and inactive colors ignored", () => {
  assert.equal(isBlackTargetSize("Black / S"), true)
  assert.equal(isBlackTargetSize("Black / 3XL"), true)
  assert.equal(isBlackTargetSize("White / S"), false)
  assert.equal(isBlackTargetSize("Black / Kids S"), false)
})

test("known Shopify product marker or same title prevents duplicate Printify drafts", () => {
  assert.equal(isMatchingPrintifyProduct({ id: "a", title: "something", tags: [SOURCE_MARKER] }), true)
  assert.equal(isMatchingPrintifyProduct({ id: "b", title: "Laugh Through the Trauma — Black Graphic Tee" }), true)
  assert.equal(isMatchingPrintifyProduct({ id: "c", title: "Different tee" }), false)
})

test("margin rule rejects unavailable or unverified production cost", () => {
  assert.equal(verifiedRetailPriceCents(null, 2999), false)
  assert.equal(verifiedRetailPriceCents(2900, 2999), false)
  assert.equal(verifiedRetailPriceCents(900, 2999), true)
})

test("read-only plan reports real black provider variants and shipping", async () => {
  const mock = harness()
  const agent = new TeeAndTraumaPrintifyAgent({ env, fetch: mock.fetcher })
  const plan = await agent.providerPlan(12)
  assert.deepEqual(plan.blackVariants.map(v => v.id), [123, 124])
  assert.equal(plan.provider.id, 12)
  assert.equal(plan.existingProducts.length, 0)
  assert.equal(plan.publicationAllowed, false)
  assert.ok(mock.seen.every(s => s.method === "GET"))
})

test("draft creation requires a durable Redis lock and never publishes", async () => {
  const mock = harness()
  const redis = {
    get: async () => null,
    set: async () => "OK",
  } as never
  const agent = new TeeAndTraumaPrintifyAgent({ env, fetch: mock.fetcher, redis })
  const result = await agent.createDraft({
    providerId: 12, variantIds: [123, 124], retailPriceCents: 2999, imageId: "approvedart12345",
  })
  assert.equal(result.sourceShopifyProductId, SOURCE_SHOPIFY_PRODUCT_ID)
  assert.equal(result.publishCalled, false)
  assert.equal(result.shopifyProductModified, false)
  assert.equal(result.id, "newprintify12345")
  const creates = mock.seen.filter(s => s.method === "POST")
  assert.equal(creates.length, 1)
  assert.equal(creates[0]?.path, "/v1/shops/4321/products.json")
  assert.deepEqual(creates[0]?.body?.tags, ["TeeAndTrauma", SOURCE_MARKER])
  assert.equal(mock.seen.some(s => s.path.includes("/publish.json") || s.path.includes("/orders.json")), false)
})

test("existing Printify draft prevents any create request", async () => {
  const mock = harness([{ id: "already-there", title: "Laugh Through the Trauma — Black Graphic Tee" }])
  const agent = new TeeAndTraumaPrintifyAgent({ env, fetch: mock.fetcher })
  await assert.rejects(
    () => agent.createDraft({ providerId: 12, variantIds: [123], retailPriceCents: 2999, imageId: "approvedart12345" }),
    /PRINTIFY_PRODUCT_ALREADY_EXISTS/u,
  )
  assert.equal(mock.seen.filter(s => s.method === "POST").length, 0)
})

test("explicit draft-write switch prevents accidental writes", async () => {
  const mock = harness()
  const agent = new TeeAndTraumaPrintifyAgent({
    env: { ...env, AMS_PRINTIFY_DRAFT_WRITES_ENABLED: "false" }, fetch: mock.fetcher,
  })
  await assert.rejects(
    () => agent.createDraft({ providerId: 12, variantIds: [123], retailPriceCents: 2999, imageId: "approvedart12345" }),
    /PRINTIFY_DRAFT_WRITES_DISABLED/u,
  )
  assert.equal(mock.seen.length, 0)
})
