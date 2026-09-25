import assert from "node:assert/strict"
import test from "node:test"

import {
  createShopifyDraftProduct,
  isShopifyAdminConfigured,
  listShopifyProducts,
  resolveShopifyAdminConfig,
  SHOPIFY_ADMIN_API_VERSION,
  verifyShopifyAdminConnection,
} from "../lib/server/shopify-admin"

function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values }
}

const validEnv = env({
  AMS_SHOPIFY_STORE_DOMAIN: "aspect-test.myshopify.com",
  AMS_SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_test_token_12345678901234567890",
})

test("Shopify adapter fails closed when credentials are absent", () => {
  assert.equal(resolveShopifyAdminConfig(env()), null)
  assert.equal(isShopifyAdminConfigured(env()), false)
})

test("Shopify adapter only accepts exact myshopify.com store domains", () => {
  assert.equal(
    resolveShopifyAdminConfig(
      env({
        AMS_SHOPIFY_STORE_DOMAIN: "shopify.example.com",
        AMS_SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_test_token_12345678901234567890",
      }),
    ),
    null,
  )
  assert.equal(
    resolveShopifyAdminConfig(
      env({
        AMS_SHOPIFY_STORE_DOMAIN: "evil.myshopify.com.attacker.example",
        AMS_SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_test_token_12345678901234567890",
      }),
    ),
    null,
  )
})

test("Shopify adapter defaults to the pinned stable API version", () => {
  const config = resolveShopifyAdminConfig(validEnv)
  assert.ok(config)
  assert.equal(config.apiVersion, SHOPIFY_ADMIN_API_VERSION)
  assert.equal(config.apiVersion, "2026-07")
})

test("connection verification uses server-side token header and pinned Admin API URL", async () => {
  const calls: Array<{ url: string; headers: Headers }> = []
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) })
    return new Response(
      JSON.stringify({
        data: {
          shop: {
            id: "gid://shopify/Shop/123",
            name: "Aspect Test",
            myshopifyDomain: "aspect-test.myshopify.com",
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  const shop = await verifyShopifyAdminConnection({ env: validEnv, fetch: fetcher })
  assert.equal(shop.name, "Aspect Test")
  assert.equal(
    calls[0]?.url,
    "https://aspect-test.myshopify.com/admin/api/2026-07/graphql.json",
  )
  assert.equal(
    calls[0]?.headers.get("x-shopify-access-token"),
    "shpat_test_token_12345678901234567890",
  )
  assert.equal(calls[0]?.url.includes("shpat_"), false)
})

test("product listing clamps the requested page size", async () => {
  const requestBodies: Record<string, unknown>[] = []
  const fetcher = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
    return new Response(
      JSON.stringify({
        data: {
          products: {
            nodes: [],
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  await listShopifyProducts(500, { env: validEnv, fetch: fetcher })
  const requestBody = requestBodies[0] as { variables?: Record<string, unknown> } | undefined
  assert.deepEqual(requestBody?.variables, { first: 50 })
})

test("product creation is forced to DRAFT regardless of caller input surface", async () => {
  const requestBodies: Record<string, unknown>[] = []
  const fetcher = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
    return new Response(
      JSON.stringify({
        data: {
          productCreate: {
            product: {
              id: "gid://shopify/Product/456",
              title: "AMS Test Product",
              handle: "ams-test-product",
              status: "DRAFT",
            },
            userErrors: [],
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  const product = await createShopifyDraftProduct(
    {
      title: "AMS Test Product",
      tags: ["ams-controlled-test"],
    },
    { env: validEnv, fetch: fetcher },
  )
  assert.equal(product.status, "DRAFT")

  const requestBody = requestBodies[0] as { variables?: unknown } | undefined
  const variables = requestBody?.variables as
    | { product?: Record<string, unknown> }
    | undefined
  assert.equal(variables?.product?.status, "DRAFT")
})

test("Shopify GraphQL errors fail closed", async () => {
  const fetcher = (async () =>
    new Response(
      JSON.stringify({
        data: null,
        errors: [{ message: "Unauthorized" }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch

  await assert.rejects(
    () => verifyShopifyAdminConnection({ env: validEnv, fetch: fetcher }),
    /SHOPIFY_ADMIN_GRAPHQL_FAILED/u,
  )
})
