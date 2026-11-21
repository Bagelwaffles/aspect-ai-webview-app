/**
 * TeeAndTrauma Printify draft workflow. Server only; never publishes to Shopify
 * or Printify, creates orders, or modifies the existing Shopify listing.
 *
 * The approved artwork lives in Shopify Files and is imported by URL.
 * All provider, shop, variant and production-cost values come from Printify.
 */
import { Redis } from "@upstash/redis"

const PRINTIFY_ROOT = "https://api.printify.com/v1"
export const SOURCE_SHOPIFY_PRODUCT_ID = "gid://shopify/Product/15424390594660"
export const SOURCE_PRODUCT_TITLE = "Laugh Through the Trauma — Black Graphic Tee"
export const SOURCE_MARKER = "ams-shopify-15424390594660"
export const APPROVED_ART_URL =
  "https://cdn.shopify.com/s/files/1/0814/3801/5588/files/TeeAndTrauma_Laugh_Through_The_Trauma_Reconstructed_4500x5400_1e40b56c-54eb-4722-a0e1-ea6be8acaaf0.png?v=1791934916"
export const APPROVED_ART_FILENAME = "teeandtrauma-laugh-through-trauma-approved-v1-4500x5400.png"

type Environment = NodeJS.ProcessEnv
type PrintifyShop = { id: number; title: string; sales_channel: string }
type PrintifyImage = { id: string; file_name: string; width: number; height: number }
type PrintifyProduct = { id: string; title: string; tags?: string[]; description?: string }
type PrintifyVariant = {
  id: number
  title: string
  cost?: number
  price?: number
  is_available?: boolean
  is_enabled?: boolean
}
type PrintifyBlueprint = { id: number; title: string; brand: string; model: string }
type PrintifyProvider = { id: number; title: string; decoration_methods?: string[] }

export type PrintifyDraftOptions = {
  env?: Environment
  fetch?: typeof fetch
  redis?: Pick<Redis, "get" | "set">
}

function fail(code: string): never { throw new Error(code) }
function validToken(value: string | undefined): value is string {
  return !!value && value.length >= 12 && !/replace|placeholder|change.?me|<|>/iu.test(value)
}
export function isPrintifyTokenConfigured(env: Environment = process.env): boolean {
  return validToken(env.PRINTIFY_API_KEY)
}
export function resolvePrintifyDraftConfig(env: Environment = process.env) {
  const token = env.PRINTIFY_API_KEY
  const shopId = Number(env.AMS_PRINTIFY_SHOP_ID)
  if (!validToken(token) || !Number.isSafeInteger(shopId) || shopId <= 0) return null
  return { token, shopId }
}
export function isApprovedPrintifyArtwork(url: string): boolean {
  return url === APPROVED_ART_URL
}
export function isMatchingPrintifyProduct(product: PrintifyProduct): boolean {
  return product.tags?.includes(SOURCE_MARKER) === true ||
    product.title.trim().toLowerCase() === SOURCE_PRODUCT_TITLE.toLowerCase() ||
    (product.description?.includes(SOURCE_MARKER) ?? false)
}
export function isBlackTargetSize(title: string): boolean {
  return /^(?:solid\s+)?black\s*\/\s*(?:s|m|l|xl|2xl|3xl|xxl|xxxl)$/iu.test(title.trim())
}
export function verifiedRetailPriceCents(costCents: unknown, retailCents: number): boolean {
  return typeof costCents === "number" && Number.isSafeInteger(costCents) &&
    costCents > 0 && Number.isSafeInteger(retailCents) &&
    retailCents >= 1999 && retailCents >= Math.ceil(costCents * 1.5) + 500
}

export class TeeAndTraumaPrintifyAgent {
  private readonly env: Environment
  private readonly fetcher: typeof fetch
  private readonly redisOverride?: Pick<Redis, "get" | "set">
  constructor(options: PrintifyDraftOptions = {}) {
    this.env = options.env ?? process.env
    this.fetcher = options.fetch ?? fetch
    this.redisOverride = options.redis
  }
  configured() { return resolvePrintifyDraftConfig(this.env) !== null }
  private config() {
    return resolvePrintifyDraftConfig(this.env) ?? fail("PRINTIFY_NOT_CONFIGURED")
  }
  private async request<T>(path: string, body?: object): Promise<T> {
    const token = this.env.PRINTIFY_API_KEY
    if (!validToken(token)) fail("PRINTIFY_NOT_CONFIGURED")
    if (!path.startsWith("/") || path.includes("..") || /https?:/iu.test(path)) fail("PRINTIFY_PATH_INVALID")
    const response = await this.fetcher(`${PRINTIFY_ROOT}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "AMS-TeeAndTrauma-Printify-Agent/1.0",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    }).catch(() => fail("PRINTIFY_REQUEST_FAILED"))
    if (!response.ok) fail(`PRINTIFY_HTTP_${response.status}`)
    return (await response.json().catch(() => fail("PRINTIFY_RESPONSE_INVALID"))) as T
  }
  async discoverShops(): Promise<PrintifyShop[]> {
    const shops = await this.request<PrintifyShop[]>("/shops.json")
    if (!Array.isArray(shops) || shops.some(shop =>
      !Number.isSafeInteger(shop.id) || !shop.title || !shop.sales_channel)) {
      fail("PRINTIFY_SHOPS_INVALID")
    }
    return shops.map(shop => ({ id: shop.id, title: shop.title, sales_channel: shop.sales_channel }))
  }
  async connectedShop(): Promise<PrintifyShop> {
    const { shopId } = this.config()
    const shops = await this.discoverShops()
    const selected = shops.find(s => s.id === shopId)
    if (!selected || !/shopify/iu.test(selected.sales_channel)) fail("PRINTIFY_SHOP_MISMATCH")
    return selected
  }
  async listEligibleGarments() {
    await this.connectedShop()
    const catalog = await this.request<PrintifyBlueprint[]>("/catalog/blueprints.json")
    if (!Array.isArray(catalog)) fail("PRINTIFY_CATALOG_INVALID")
    const candidates = catalog.filter(b => b.brand.toLowerCase() === "gildan" && b.model === "5000")
    if (candidates.length !== 1) fail("PRINTIFY_GARMENT_NOT_UNAMBIGUOUS")
    const blueprint = candidates[0]
    const providers = await this.request<PrintifyProvider[]>(
      `/catalog/blueprints/${blueprint.id}/print_providers.json`)
    if (!Array.isArray(providers)) fail("PRINTIFY_PROVIDERS_INVALID")
    return { blueprint, providers }
  }
  async providerPlan(providerId: number) {
    if (!Number.isSafeInteger(providerId) || providerId <= 0) fail("PRINTIFY_PROVIDER_INVALID")
    const shop = await this.connectedShop()
    const { blueprint, providers } = await this.listEligibleGarments()
    const provider = providers.find(p => p.id === providerId)
    if (!provider) fail("PRINTIFY_PROVIDER_NOT_OFFERED")
    const variantResponse = await this.request<{ variants: PrintifyVariant[] }>(
      `/catalog/blueprints/${blueprint.id}/print_providers/${providerId}/variants.json`)
    const variants = variantResponse?.variants
    if (!Array.isArray(variants)) fail("PRINTIFY_VARIANTS_INVALID")
    const blackVariants = variants.filter(v => isBlackTargetSize(v.title) && v.is_available !== false)
    if (blackVariants.length === 0) fail("PRINTIFY_BLACK_VARIANTS_UNAVAILABLE")
    const shipping = await this.request<unknown>(
      `/catalog/blueprints/${blueprint.id}/print_providers/${providerId}/shipping.json`)
    const existingProducts = await this.existingProducts(shop.id)
    return {
      shop: { id: shop.id, title: shop.title },
      blueprint,
      provider,
      blackVariants: blackVariants.map(v => ({
        id: v.id, title: v.title, costCents: v.cost ?? null,
      })),
      shipping,
      existingProducts: existingProducts.map(p => ({ id: p.id, title: p.title })),
      allowedActions: existingProducts.length ? ["review-existing"] : ["upload-artwork", "create-draft-after-approval"],
      publicationAllowed: false,
    }
  }
  private async existingProducts(shopId: number): Promise<PrintifyProduct[]> {
    const matches: PrintifyProduct[] = []
    for (let page = 1; page <= 20; page++) {
      const result = await this.request<{ data: PrintifyProduct[]; last_page?: number }>(
        `/shops/${shopId}/products.json?page=${page}&limit=50`)
      if (!Array.isArray(result?.data)) fail("PRINTIFY_PRODUCT_LIST_INVALID")
      for (const product of result.data) {
        if (isMatchingPrintifyProduct(product)) matches.push(product)
      }
      if (typeof result.last_page === "number" && page >= result.last_page) return matches
      if (result.data.length < 50) return matches
    }
    fail("PRINTIFY_PRODUCT_SCAN_INCOMPLETE")
  }
  private async printifyImage(): Promise<PrintifyImage | null> {
    // Printify documents GET /uploads.json for listing, not /uploads/images.json
    // (the latter is the POST upload endpoint). Scan every page before writing.
    const matches: PrintifyImage[] = []
    for (let page = 1; page <= 50; page++) {
      const payload = await this.request<{ data: PrintifyImage[]; last_page: number }>(
        `/uploads.json?page=${page}&limit=100`)
      if (!Array.isArray(payload?.data) || !Number.isSafeInteger(payload.last_page) ||
          payload.last_page < page || payload.last_page > 50) fail("PRINTIFY_MEDIA_LIST_INVALID")
      for (const file of payload.data) {
        if (file.file_name === APPROVED_ART_FILENAME) matches.push(file)
      }
      if (page === payload.last_page) {
        if (matches.length > 1) fail("PRINTIFY_ARTWORK_AMBIGUOUS")
        const found = matches[0]
        if (found && (found.width !== 4500 || found.height !== 5400)) {
          fail("PRINTIFY_ARTWORK_DIMENSIONS_MISMATCH")
        }
        return found ?? null
      }
    }
    fail("PRINTIFY_MEDIA_SCAN_INCOMPLETE")
  }
  async uploadApprovedArtwork() {
    await this.connectedShop()
    const found = await this.printifyImage()
    if (found) return { imageId: found.id, reused: true, fileName: APPROVED_ART_FILENAME }
    if (!isApprovedPrintifyArtwork(APPROVED_ART_URL)) fail("PRINTIFY_ARTWORK_NOT_APPROVED")
    const uploaded = await this.request<PrintifyImage>("/uploads/images.json", {
      file_name: APPROVED_ART_FILENAME,
      url: APPROVED_ART_URL,
    })
    if (!uploaded?.id || uploaded.width !== 4500 || uploaded.height !== 5400) {
      fail("PRINTIFY_ARTWORK_UPLOAD_UNVERIFIED")
    }
    return { imageId: uploaded.id, reused: false, fileName: APPROVED_ART_FILENAME }
  }
  private redis(): Pick<Redis, "get" | "set"> {
    if (this.redisOverride) return this.redisOverride
    const url = this.env.UPSTASH_REDIS_REST_URL ?? this.env.KV_REST_API_URL
    const token = this.env.UPSTASH_REDIS_REST_TOKEN ?? this.env.KV_REST_API_TOKEN
    if (!url || !validToken(token) || !url.startsWith("https://")) {
      fail("PRINTIFY_DURABLE_LOCK_NOT_CONFIGURED")
    }
    return new Redis({ url, token })
  }
  async createDraft(input: { providerId: number; variantIds: number[]; retailPriceCents: number; imageId: string }) {
    if (this.env.AMS_PRINTIFY_DRAFT_WRITES_ENABLED !== "true") fail("PRINTIFY_DRAFT_WRITES_DISABLED")
    const { shopId } = this.config()
    const redis = this.redis()
    const plan = await this.providerPlan(input.providerId)
    if (plan.existingProducts.length) fail("PRINTIFY_PRODUCT_ALREADY_EXISTS")
    if (!Array.isArray(input.variantIds) || input.variantIds.length < 1 || input.variantIds.length > 7 ||
        new Set(input.variantIds).size !== input.variantIds.length) fail("PRINTIFY_SELECTION_INVALID")
    const chosen = input.variantIds.map(id => plan.blackVariants.find(v => v.id === id))
    if (chosen.some(v => !v)) fail("PRINTIFY_SELECTION_INVALID")
    if (!chosen.every(v => verifiedRetailPriceCents(v?.costCents, input.retailPriceCents))) {
      fail("PRINTIFY_PRODUCTION_COST_OR_MARGIN_UNVERIFIED")
    }
    const image = await this.printifyImage()
    if (!image || image.id !== input.imageId) fail("PRINTIFY_ARTWORK_NOT_UPLOADED")
    const locked = await redis.set(`ams:printify:teeandtrauma:${shopId}:creation-lock`, "held", { nx: true, ex: 300 })
    if (locked !== "OK") fail("PRINTIFY_CREATE_LOCKED")
    // No automatic lock release: safe retry after TTL plus full duplicate re-scan.
    const existingAgain = await this.existingProducts(shopId)
    if (existingAgain.length) fail("PRINTIFY_PRODUCT_ALREADY_EXISTS")
    const payload = {
      title: SOURCE_PRODUCT_TITLE,
      description: `Draft production counterpart of Shopify product ${SOURCE_SHOPIFY_PRODUCT_ID}. ${SOURCE_MARKER}. Do not publish; source listing remains in Shopify.`,
      tags: ["TeeAndTrauma", SOURCE_MARKER],
      blueprint_id: plan.blueprint.id,
      print_provider_id: input.providerId,
      variants: chosen.map(v => ({ id: v!.id, price: input.retailPriceCents, is_enabled: true })),
      print_areas: [{
        variant_ids: chosen.map(v => v!.id),
        placeholders: [{ position: "front", images: [{ id: image.id, x: 0.5, y: 0.5, scale: 0.8, angle: 0 }] }],
      }],
    }
    const product = await this.request<{ id: string; title: string; blueprint_id: number; print_provider_id: number }>(
      `/shops/${shopId}/products.json`, payload)
    if (!product?.id || product.blueprint_id !== plan.blueprint.id ||
        product.print_provider_id !== input.providerId) fail("PRINTIFY_DRAFT_RESPONSE_UNVERIFIED")
    return {
      id: product.id, title: product.title, shopId, blueprintId: plan.blueprint.id,
      providerId: input.providerId, sourceShopifyProductId: SOURCE_SHOPIFY_PRODUCT_ID,
      status: "printify-draft-created", publishCalled: false, shopifyProductModified: false,
    }
  }
}
