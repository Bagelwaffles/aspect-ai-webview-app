import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createSecretKey,
  randomBytes,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

export const LINKEDIN_ORGANIZATION_SCOPES = [
  "rw_organization_admin",
  "w_organization_social",
] as const
export const LINKEDIN_OAUTH_COOKIE = "ams_linkedin_org_oauth"

const CONNECTION_KEY = "ams:linkedin-org:v1:connection"
const OAUTH_ATTEMPT_TTL_SECONDS = 10 * 60

type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string): Promise<unknown>
  del(...keys: string[]): Promise<unknown>
}

type LinkedInOptions = {
  env?: NodeJS.ProcessEnv
  redis?: RedisLike | null
  fetcher?: typeof fetch
  now?: () => Date
}

const oauthAttemptSchema = z.object({
  state: z.string().min(32).max(200),
  expiresAt: z.number().int().positive(),
})

const encryptedConnectionSchema = z.object({
  organizationUrn: z.string().regex(/^urn:li:organization:[A-Za-z0-9_-]+$/u),
  organizationId: z.string().min(1),
  scopes: z.array(z.string()).min(1),
  connectedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  cipherText: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
})

const secretSchema = z.object({
  accessToken: z.string().min(20),
})

const tokenResponseSchema = z.object({
  access_token: z.string().min(20),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
})

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function resolveRedis(env: NodeJS.ProcessEnv): RedisLike | null {
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN)
  return url && token ? new Redis({ url, token }) : null
}

function runtimeRedis(options: LinkedInOptions) {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) return options.redis ?? null
  return resolveRedis(options.env ?? process.env)
}

function appOrigin(env: NodeJS.ProcessEnv) {
  const raw = clean(env.PUBLIC_APP_URL) ?? clean(env.NEXTAUTH_URL)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (env.NODE_ENV === "production" && url.protocol !== "https:") return null
    return url.origin
  } catch {
    return null
  }
}

export function resolveLinkedInOrganizationOAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  const clientId = clean(env.AMS_LINKEDIN_CLIENT_ID)
  const clientSecret = clean(env.AMS_LINKEDIN_CLIENT_SECRET)
  const organizationUrn = clean(env.AMS_LINKEDIN_AUTHOR_URN)
  const apiVersion = clean(env.AMS_LINKEDIN_API_VERSION)
  const origin = appOrigin(env)

  if (
    !clientId ||
    !clientSecret ||
    !organizationUrn ||
    !/^urn:li:organization:[A-Za-z0-9_-]+$/u.test(organizationUrn) ||
    !apiVersion ||
    !/^20\d{4}$/u.test(apiVersion) ||
    !origin
  ) {
    return null
  }

  return {
    clientId,
    clientSecret,
    organizationUrn,
    organizationId: organizationUrn.slice("urn:li:organization:".length),
    apiVersion,
    appOrigin: origin,
    redirectUri: `${origin}/api/internal/linkedin/callback`,
  }
}

function encryptionKey(env: NodeJS.ProcessEnv): KeyObject | null {
  const raw = clean(env.AMS_CONNECTION_ENCRYPTION_KEY)
  if (!raw) return null
  try {
    const decoded = Buffer.from(raw, "base64")
    if (decoded.length !== 32) return null
    return createSecretKey(Uint8Array.from(decoded))
  } catch {
    return null
  }
}

function oauthSigningSecret(env: NodeJS.ProcessEnv) {
  return clean(env.NEXTAUTH_SECRET) ?? clean(env.INTERNAL_ADMIN_SECRET)
}

export function isLinkedInOrganizationOAuthConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(
    resolveLinkedInOrganizationOAuthConfig(env) &&
      encryptionKey(env) &&
      resolveRedis(env) &&
      oauthSigningSecret(env),
  )
}

function signOauthPayload(encoded: string, env: NodeJS.ProcessEnv) {
  const secret = oauthSigningSecret(env)
  if (!secret) throw new Error("LINKEDIN_OAUTH_NOT_CONFIGURED")
  return createHmac("sha256", secret).update(encoded).digest("base64url")
}

export function createLinkedInOauthAttempt(env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  if (!isLinkedInOrganizationOAuthConfigured(env)) {
    throw new Error("LINKEDIN_OAUTH_NOT_CONFIGURED")
  }
  const payload = oauthAttemptSchema.parse({
    state: randomBytes(32).toString("base64url"),
    expiresAt: now + OAUTH_ATTEMPT_TTL_SECONDS * 1000,
  })
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return {
    state: payload.state,
    cookieValue: `${encoded}.${signOauthPayload(encoded, env)}`,
    maxAgeSeconds: OAUTH_ATTEMPT_TTL_SECONDS,
  }
}

export function readLinkedInOauthAttempt(
  cookieValue: string | undefined,
  expectedState: string | null,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
) {
  if (!cookieValue || !expectedState) throw new Error("LINKEDIN_OAUTH_STATE_INVALID")
  const [encoded, signature, ...rest] = cookieValue.split(".")
  if (!encoded || !signature || rest.length) throw new Error("LINKEDIN_OAUTH_STATE_INVALID")

  const expected = signOauthPayload(encoded, env)
  const left = Buffer.from(signature, "utf8")
  const right = Buffer.from(expected, "utf8")
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("LINKEDIN_OAUTH_STATE_INVALID")
  }

  let raw: unknown
  try {
    raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  } catch {
    throw new Error("LINKEDIN_OAUTH_STATE_INVALID")
  }

  const parsed = oauthAttemptSchema.parse(raw)
  if (parsed.expiresAt < now) throw new Error("LINKEDIN_OAUTH_STATE_EXPIRED")
  if (parsed.state !== expectedState) throw new Error("LINKEDIN_OAUTH_STATE_INVALID")
  return parsed
}

export function buildLinkedInAuthorizationUrl(
  state: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = resolveLinkedInOrganizationOAuthConfig(env)
  if (!config) throw new Error("LINKEDIN_OAUTH_NOT_CONFIGURED")
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization")
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("state", state)
  url.searchParams.set("scope", LINKEDIN_ORGANIZATION_SCOPES.join(" "))
  return url
}

function encryptSecret(payload: z.infer<typeof secretSchema>, key: KeyObject) {
  const iv = Uint8Array.from(randomBytes(12))
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const plain = JSON.stringify(secretSchema.parse(payload))
  const cipherText = cipher.update(plain, "utf8", "hex") + cipher.final("hex")
  return {
    cipherText,
    iv: Buffer.from(iv).toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  }
}

function decryptSecret(record: z.infer<typeof encryptedConnectionSchema>, key: KeyObject) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Uint8Array.from(Buffer.from(record.iv, "base64")),
  )
  decipher.setAuthTag(Uint8Array.from(Buffer.from(record.authTag, "base64")))
  return secretSchema.parse(
    JSON.parse(decipher.update(record.cipherText, "hex", "utf8") + decipher.final("utf8")),
  )
}

function publicConnection(record: z.infer<typeof encryptedConnectionSchema>) {
  return {
    organizationUrn: record.organizationUrn,
    organizationId: record.organizationId,
    scopes: record.scopes,
    connectedAt: record.connectedAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
  }
}

async function loadConnection(options: LinkedInOptions = {}) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  const key = encryptionKey(env)
  if (!redis || !key) throw new Error("LINKEDIN_CONNECTION_VAULT_UNAVAILABLE")
  const raw = await redis.get<unknown>(CONNECTION_KEY)
  if (!raw) return null
  const parsed = encryptedConnectionSchema.safeParse(
    typeof raw === "string" ? JSON.parse(raw) : raw,
  )
  if (!parsed.success) return null
  return { record: parsed.data, secret: decryptSecret(parsed.data, key) }
}

function expirationIso(seconds: number | undefined, now = Date.now()) {
  return typeof seconds === "number" && seconds > 0
    ? new Date(now + seconds * 1000).toISOString()
    : null
}

async function parseJson(response: Response) {
  return response.json().catch(() => null)
}

async function verifyAdministrator(
  accessToken: string,
  config: NonNullable<ReturnType<typeof resolveLinkedInOrganizationOAuthConfig>>,
  fetcher: typeof fetch,
) {
  const url = new URL("https://api.linkedin.com/rest/organizationAcls")
  url.searchParams.set("q", "roleAssignee")
  url.searchParams.set("role", "ADMINISTRATOR")
  url.searchParams.set("state", "APPROVED")

  const response = await fetcher(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": config.apiVersion,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(`LINKEDIN_ADMIN_VALIDATION_FAILED:${response.status}`)
  }

  const body = (await parseJson(response)) as {
    elements?: Array<{ organization?: string; organizationTarget?: string; state?: string; role?: string }>
  } | null

  const matched = (body?.elements ?? []).some((item) => {
    const organization = item.organization ?? item.organizationTarget ?? ""
    return organization === config.organizationUrn &&
      item.role === "ADMINISTRATOR" &&
      item.state === "APPROVED"
  })

  if (!matched) throw new Error("LINKEDIN_ORGANIZATION_ADMIN_REQUIRED")
}

export async function exchangeLinkedInAuthorizationCode(
  code: string,
  options: LinkedInOptions = {},
) {
  const env = options.env ?? process.env
  const config = resolveLinkedInOrganizationOAuthConfig(env)
  const redis = runtimeRedis(options)
  const key = encryptionKey(env)
  const fetcher = options.fetcher ?? fetch

  if (!config || !redis || !key) throw new Error("LINKEDIN_OAUTH_NOT_CONFIGURED")

  const response = await fetcher("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`LINKEDIN_TOKEN_EXCHANGE_FAILED:${response.status}`)

  const token = tokenResponseSchema.parse(await parseJson(response))
  await verifyAdministrator(token.access_token, config, fetcher)

  const now = (options.now ?? (() => new Date()))()
  const record = encryptedConnectionSchema.parse({
    organizationUrn: config.organizationUrn,
    organizationId: config.organizationId,
    scopes: [...LINKEDIN_ORGANIZATION_SCOPES],
    connectedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expirationIso(token.expires_in, now.getTime()),
    ...encryptSecret({ accessToken: token.access_token }, key),
  })
  await redis.set(CONNECTION_KEY, JSON.stringify(record))
  return publicConnection(record)
}

export async function getLinkedInOrganizationConnectionStatus(options: LinkedInOptions = {}) {
  const env = options.env ?? process.env
  const config = resolveLinkedInOrganizationOAuthConfig(env)
  let loaded: Awaited<ReturnType<typeof loadConnection>> = null
  try {
    loaded = await loadConnection(options)
  } catch {
    loaded = null
  }

  if (!loaded) {
    return {
      oauthConfigured: Boolean(config && oauthSigningSecret(env) && runtimeRedis(options) && encryptionKey(env)),
      connected: false,
      connection: null,
    }
  }

  const expired = loaded.record.expiresAt
    ? Date.parse(loaded.record.expiresAt) <= (options.now ?? (() => new Date()))().getTime()
    : false
  const sameOrganization =
    clean(env.AMS_LINKEDIN_AUTHOR_URN) === loaded.record.organizationUrn

  return {
    oauthConfigured: Boolean(config && oauthSigningSecret(env) && runtimeRedis(options) && encryptionKey(env)),
    connected: !expired && sameOrganization,
    connection: publicConnection(loaded.record),
  }
}

export async function getStoredLinkedInOrganizationAccessToken(options: LinkedInOptions = {}) {
  const env = options.env ?? process.env
  const loaded = await loadConnection(options)
  if (!loaded) return null
  if (clean(env.AMS_LINKEDIN_AUTHOR_URN) !== loaded.record.organizationUrn) return null
  if (loaded.record.expiresAt && Date.parse(loaded.record.expiresAt) <= Date.now()) return null
  return {
    accessToken: loaded.secret.accessToken,
    organizationUrn: loaded.record.organizationUrn,
    scopes: loaded.record.scopes,
  }
}

export async function disconnectLinkedInOrganization(options: LinkedInOptions = {}) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("LINKEDIN_CONNECTION_VAULT_UNAVAILABLE")
  await redis.del(CONNECTION_KEY)
}
