import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * Buyer report links are signed by the trusted fulfillment worker only.
 * This helper never sends email, creates a checkout, or exposes a mint endpoint.
 * A report token is a bearer credential; distribute it only to the email on
 * the already-verified Stripe order, preferably in a URL fragment.
 */
const TOKEN_LIFETIME_SECONDS = 14 * 24 * 60 * 60
const TOKEN_VERSION = 1
const MAX_TOKEN_LENGTH = 2048

type ReportTokenClaims = {
  v: 1
  sid: string
  rid: string
  emailHash: string
  exp: number
}

type ReportTokenOrder = {
  checkoutSessionId: string
  requestId: string
  buyerEmail: string
}

function validSecret(secret: string): boolean {
  return secret.trim().length >= 32
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase()
}

function digestEmail(email: string): string {
  return createHash("sha256").update(normalizedEmail(email)).digest("hex")
}

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest()
}

export function isBuyerReportAccessConfigured(secret: string | undefined): boolean {
  return typeof secret === "string" && validSecret(secret)
}

export function createBuyerReportAccessToken(
  order: ReportTokenOrder,
  secret: string,
  now = Date.now(),
): string {
  if (!validSecret(secret)) throw new Error("REPORT_ACCESS_SECRET_INVALID")
  if (!/^cs_(?:live|test)_[A-Za-z0-9]+$/.test(order.checkoutSessionId)) {
    throw new Error("REPORT_ACCESS_SESSION_INVALID")
  }
  if (!order.requestId || order.requestId.length > 200 || !normalizedEmail(order.buyerEmail).includes("@")) {
    throw new Error("REPORT_ACCESS_ORDER_INVALID")
  }

  const claims: ReportTokenClaims = {
    v: TOKEN_VERSION,
    sid: order.checkoutSessionId,
    rid: order.requestId,
    emailHash: digestEmail(order.buyerEmail),
    exp: Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS,
  }
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")
  return payload + "." + sign(payload, secret).toString("base64url")
}

export function verifyBuyerReportAccessToken(
  token: string | undefined,
  order: ReportTokenOrder,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token || token.length > MAX_TOKEN_LENGTH || !validSecret(secret)) return false
  const parts = token.split(".")
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false
  try {
    const actual = Buffer.from(parts[1], "base64url")
    const expected = sign(parts[0], secret)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false
    const claims: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return false
    const value = claims as Partial<ReportTokenClaims>
    const nowSeconds = Math.floor(now / 1000)
    return (
      value.v === TOKEN_VERSION &&
      value.sid === order.checkoutSessionId &&
      value.rid === order.requestId &&
      typeof value.emailHash === "string" &&
      value.emailHash === digestEmail(order.buyerEmail) &&
      typeof value.exp === "number" &&
      Number.isSafeInteger(value.exp) &&
      value.exp > nowSeconds &&
      value.exp <= nowSeconds + TOKEN_LIFETIME_SECONDS
    )
  } catch {
    return false
  }
}

/** Transport tokens only in an HTTP Authorization header, not in API query URLs. */
export function bearerReportToken(value: string | null): string | undefined {
  if (!value || !value.startsWith("Bearer ")) return undefined
  const token = value.slice(7)
  return token && token.length <= MAX_TOKEN_LENGTH ? token : undefined
}
