import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  APPROVED_ART_FILENAME,
  SOURCE_SHOPIFY_PRODUCT_ID,
  isPrintifyTokenConfigured,
  TeeAndTraumaPrintifyAgent,
} from "@/lib/server/teeandtrauma-printify-agent"
import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Do not add a publish/order/sync operation here. Existing Shopify product is
// preserved in DRAFT until Printify costs, fulfillment and migration are verified.
const actions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("discover-shops") }).strict(),
  z.object({ action: z.literal("list-garments") }).strict(),
  z.object({ action: z.literal("provider-plan"), providerId: z.number().int().positive() }).strict(),
  z.object({
    action: z.literal("upload-approved-artwork"),
    approval: z.literal("owner-approved"),
    confirmWrite: z.literal(true),
    sourceShopifyProductId: z.literal(SOURCE_SHOPIFY_PRODUCT_ID),
  }).strict(),
  z.object({
    action: z.literal("create-printify-draft"),
    approval: z.literal("owner-approved"),
    confirmWrite: z.literal(true),
    sourceShopifyProductId: z.literal(SOURCE_SHOPIFY_PRODUCT_ID),
    providerId: z.number().int().positive(),
    variantIds: z.array(z.number().int().positive()).min(1).max(7),
    retailPriceCents: z.number().int().min(1999).max(100000),
    imageId: z.string().regex(/^[a-zA-Z0-9]{8,64}$/u),
  }).strict(),
])

function result(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function safeError(error: unknown) {
  const code = error instanceof Error ? error.message : "PRINTIFY_OPERATION_FAILED"
  const allowed = /^PRINTIFY_[A-Z0-9_]+$/u.test(code)
  const safeCode = allowed ? code : "PRINTIFY_OPERATION_FAILED"
  const status = safeCode === "PRINTIFY_NOT_CONFIGURED" ||
      safeCode === "PRINTIFY_DURABLE_LOCK_NOT_CONFIGURED" ? 503
    : safeCode.startsWith("PRINTIFY_HTTP_") || safeCode === "PRINTIFY_REQUEST_FAILED" ? 502
    : safeCode === "PRINTIFY_PRODUCT_ALREADY_EXISTS" || safeCode === "PRINTIFY_CREATE_LOCKED" ? 409
    : 422
  return result({ ok: false, code: safeCode }, status)
}

export async function GET(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) return unauthorizedInternalApiResponse()
  const agent = new TeeAndTraumaPrintifyAgent()
  if (!agent.configured()) {
    return result({
      ok: true, configured: false, tokenConfigured: isPrintifyTokenConfigured(),
      requiresShopId: isPrintifyTokenConfigured(), mode: "draft-only", publishEnabled: false,
      sourceShopifyProductId: SOURCE_SHOPIFY_PRODUCT_ID,
    })
  }
  try {
    const shop = await agent.connectedShop()
    return result({ ok: true, configured: true, shop, mode: "draft-only", publishEnabled: false })
  } catch (error) {
    return safeError(error)
  }
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) return unauthorizedInternalApiResponse()
  const parsed = actions.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return result({ ok: false, code: "PRINTIFY_REQUEST_INVALID" }, 400)
  const agent = new TeeAndTraumaPrintifyAgent()
  try {
    switch (parsed.data.action) {
      case "discover-shops":
        return result({ ok: true, shops: await agent.discoverShops(), published: false })
      case "list-garments":
        return result({ ok: true, ...(await agent.listEligibleGarments()) })
      case "provider-plan":
        return result({ ok: true, ...(await agent.providerPlan(parsed.data.providerId)) })
      case "upload-approved-artwork":
        return result({
          ok: true, action: "upload-approved-artwork", artwork: APPROVED_ART_FILENAME,
          ...(await agent.uploadApprovedArtwork()),
          shopifyProductModified: false, published: false,
        })
      case "create-printify-draft":
        return result({
          ok: true, action: "create-printify-draft",
          product: await agent.createDraft(parsed.data),
          published: false,
        })
    }
  } catch (error) {
    return safeError(error)
  }
}
