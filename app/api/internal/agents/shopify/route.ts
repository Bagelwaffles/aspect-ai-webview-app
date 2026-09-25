import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  createShopifyDraftProduct,
  isShopifyAdminConfigured,
  listShopifyProducts,
  SHOPIFY_ADMIN_API_VERSION,
  verifyShopifyAdminConnection,
} from "@/lib/server/shopify-admin"
import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify") }).strict(),
  z
    .object({
      action: z.literal("list-products"),
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("create-draft-product"),
      approval: z.literal("owner-approved"),
      confirmWrite: z.literal(true),
      product: z
        .object({
          title: z.string().trim().min(1).max(255),
          descriptionHtml: z.string().max(100_000).optional(),
          vendor: z.string().trim().max(255).optional(),
          productType: z.string().trim().max(255).optional(),
          tags: z.array(z.string().trim().min(1).max(255)).max(100).optional(),
        })
        .strict(),
    })
    .strict(),
])

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "SHOPIFY_OPERATION_FAILED"
  if (code === "SHOPIFY_ADMIN_NOT_CONFIGURED") {
    return noStoreJson({ ok: false, code }, 503)
  }
  if (
    code === "SHOPIFY_ADMIN_REQUEST_FAILED" ||
    code === "SHOPIFY_ADMIN_TIMEOUT" ||
    code.startsWith("SHOPIFY_ADMIN_HTTP_")
  ) {
    return noStoreJson({ ok: false, code }, 502)
  }
  if (
    code === "SHOPIFY_ADMIN_RESPONSE_INVALID" ||
    code === "SHOPIFY_ADMIN_GRAPHQL_FAILED" ||
    code === "SHOPIFY_PRODUCT_CREATE_FAILED" ||
    code === "SHOPIFY_PRODUCT_DRAFT_GUARD_FAILED"
  ) {
    return noStoreJson({ ok: false, code }, 502)
  }
  return noStoreJson({ ok: false, code: "SHOPIFY_OPERATION_FAILED" }, 500)
}

export async function GET(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) return unauthorizedInternalApiResponse()

  const configured = isShopifyAdminConfigured()
  if (!configured) {
    return noStoreJson({
      ok: true,
      runtime: "vercel-native",
      configured: false,
      apiVersion: SHOPIFY_ADMIN_API_VERSION,
      writeMode: "approval-required-draft-only",
    })
  }

  try {
    const shop = await verifyShopifyAdminConnection()
    return noStoreJson({
      ok: true,
      runtime: "vercel-native",
      configured: true,
      connected: true,
      apiVersion: SHOPIFY_ADMIN_API_VERSION,
      writeMode: "approval-required-draft-only",
      shop,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) return unauthorizedInternalApiResponse()

  const parsed = mutationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return noStoreJson({ ok: false, code: "SHOPIFY_REQUEST_INVALID" }, 400)
  }

  try {
    if (parsed.data.action === "verify") {
      const shop = await verifyShopifyAdminConnection()
      return noStoreJson({ ok: true, action: parsed.data.action, shop })
    }

    if (parsed.data.action === "list-products") {
      const products = await listShopifyProducts(parsed.data.limit ?? 10)
      return noStoreJson({ ok: true, action: parsed.data.action, products })
    }

    const product = await createShopifyDraftProduct(parsed.data.product)
    return noStoreJson({
      ok: true,
      action: parsed.data.action,
      product,
      publicationState: "draft-only",
    })
  } catch (error) {
    return errorResponse(error)
  }
}
