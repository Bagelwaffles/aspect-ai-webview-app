import { z } from "zod"

export const SHOPIFY_ADMIN_API_VERSION = "2026-07"

const shopDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u)

const apiVersionSchema = z
  .string()
  .trim()
  .regex(/^20\d{2}-(?:01|04|07|10)$/u)

const productInputSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    descriptionHtml: z.string().max(100_000).optional(),
    vendor: z.string().trim().max(255).optional(),
    productType: z.string().trim().max(255).optional(),
    tags: z.array(z.string().trim().min(1).max(255)).max(100).optional(),
  })
  .strict()

const graphQlEnvelopeSchema = z
  .object({
    data: z.unknown().nullable().optional(),
    errors: z
      .array(
        z
          .object({
            message: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

const shopIdentitySchema = z.object({
  shop: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    myshopifyDomain: shopDomainSchema,
  }),
})

const productListSchema = z.object({
  products: z.object({
    nodes: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string(),
        handle: z.string(),
        status: z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]),
        updatedAt: z.string(),
      }),
    ),
  }),
})

const productCreateSchema = z.object({
  productCreate: z.object({
    product: z
      .object({
        id: z.string().min(1),
        title: z.string(),
        handle: z.string(),
        status: z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]),
      })
      .nullable(),
    userErrors: z.array(
      z.object({
        field: z.array(z.string()).nullable().optional(),
        message: z.string(),
      }),
    ),
  }),
})

export type ShopifyAdminConfig = {
  storeDomain: string
  accessToken: string
  apiVersion: string
}

type ShopifyAdminOptions = {
  env?: NodeJS.ProcessEnv
  fetch?: typeof fetch
  timeoutMs?: number
}

function clean(value: string | undefined) {
  const normalized = value?.trim()
  return normalized || null
}

function looksPlaceholder(value: string) {
  return /replace|placeholder|changeme|example|your[-_ ]/iu.test(value)
}

export function resolveShopifyAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): ShopifyAdminConfig | null {
  const rawDomain = clean(env.AMS_SHOPIFY_STORE_DOMAIN)
  const rawToken = clean(env.AMS_SHOPIFY_ADMIN_ACCESS_TOKEN)
  const rawVersion = clean(env.AMS_SHOPIFY_ADMIN_API_VERSION) ?? SHOPIFY_ADMIN_API_VERSION

  if (!rawDomain || !rawToken || looksPlaceholder(rawDomain) || looksPlaceholder(rawToken)) {
    return null
  }

  const domain = shopDomainSchema.safeParse(rawDomain)
  const version = apiVersionSchema.safeParse(rawVersion)
  if (!domain.success || !version.success || rawToken.length < 20 || rawToken.length > 500) {
    return null
  }

  return {
    storeDomain: domain.data,
    accessToken: rawToken,
    apiVersion: version.data,
  }
}

export function isShopifyAdminConfigured(env: NodeJS.ProcessEnv = process.env) {
  return resolveShopifyAdminConfig(env) !== null
}

async function shopifyAdminGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  options: ShopifyAdminOptions = {},
): Promise<T> {
  const env = options.env ?? process.env
  const config = resolveShopifyAdminConfig(env)
  if (!config) throw new Error("SHOPIFY_ADMIN_NOT_CONFIGURED")

  const fetcher = options.fetch ?? fetch
  const response = await fetcher(
    `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.accessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("SHOPIFY_ADMIN_TIMEOUT")
    }
    throw new Error("SHOPIFY_ADMIN_REQUEST_FAILED")
  })

  const raw = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`SHOPIFY_ADMIN_HTTP_${response.status}`)
  }

  const envelope = graphQlEnvelopeSchema.safeParse(raw)
  if (!envelope.success) throw new Error("SHOPIFY_ADMIN_RESPONSE_INVALID")
  if (envelope.data.errors?.length) {
    throw new Error("SHOPIFY_ADMIN_GRAPHQL_FAILED")
  }
  if (envelope.data.data === null || envelope.data.data === undefined) {
    throw new Error("SHOPIFY_ADMIN_GRAPHQL_FAILED")
  }

  return envelope.data.data as T
}

export async function verifyShopifyAdminConnection(options: ShopifyAdminOptions = {}) {
  const data = await shopifyAdminGraphql<unknown>(
    `query AmsShopifyIdentity {
      shop {
        id
        name
        myshopifyDomain
      }
    }`,
    {},
    options,
  )
  return shopIdentitySchema.parse(data).shop
}

export async function listShopifyProducts(
  limit = 10,
  options: ShopifyAdminOptions = {},
) {
  const first = Math.max(1, Math.min(50, Math.trunc(limit)))
  const data = await shopifyAdminGraphql<unknown>(
    `query AmsShopifyProducts($first: Int!) {
      products(first: $first, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          title
          handle
          status
          updatedAt
        }
      }
    }`,
    { first },
    options,
  )
  return productListSchema.parse(data).products.nodes
}

export async function createShopifyDraftProduct(
  input: z.input<typeof productInputSchema>,
  options: ShopifyAdminOptions = {},
) {
  const product = productInputSchema.parse(input)
  const data = await shopifyAdminGraphql<unknown>(
    `mutation AmsCreateDraftProduct($product: ProductCreateInput!) {
      productCreate(product: $product) {
        product {
          id
          title
          handle
          status
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      product: {
        ...product,
        status: "DRAFT",
      },
    },
    options,
  )

  const parsed = productCreateSchema.parse(data).productCreate
  if (!parsed.product || parsed.userErrors.length > 0) {
    throw new Error("SHOPIFY_PRODUCT_CREATE_FAILED")
  }
  if (parsed.product.status !== "DRAFT") {
    throw new Error("SHOPIFY_PRODUCT_DRAFT_GUARD_FAILED")
  }
  return parsed.product
}
