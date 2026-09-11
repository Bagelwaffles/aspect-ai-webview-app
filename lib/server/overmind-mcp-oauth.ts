import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

export const OVERMIND_OWNER_ORIGIN = "https://www.aspectmarketingsolutions.app"
export const OVERMIND_OWNER_RESOURCE = `${OVERMIND_OWNER_ORIGIN}/api/mcp/owner`
export const OVERMIND_OWNER_ISSUER = OVERMIND_OWNER_ORIGIN

export const OVERMIND_TASK_READ_SCOPE = "overmind.tasks.read"
export const OVERMIND_TASK_WRITE_SCOPE = "overmind.tasks.write"
export const OVERMIND_OFFLINE_SCOPE = "offline_access"

const CLIENT_PREFIX = "ams:overmind:oauth:v1:client"
const CODE_PREFIX = "ams:overmind:oauth:v1:code"
const ACCESS_PREFIX = "ams:overmind:oauth:v1:access"
const REFRESH_PREFIX = "ams:overmind:oauth:v1:refresh"

const CHATGPT_CIMD_CLIENT_ID = "https://chatgpt.com/oauth/client.json"
const ACCESS_TTL_MS = 15 * 60_000
const CODE_TTL_MS = 5 * 60_000
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000

const scopeSchema = z.enum([
  OVERMIND_TASK_READ_SCOPE,
  OVERMIND_TASK_WRITE_SCOPE,
  OVERMIND_OFFLINE_SCOPE,
])
type OvermindOAuthScope = z.infer<typeof scopeSchema>

const clientSchema = z.object({
  clientId: z.string().min(8).max(500),
  clientName: z.string().min(1).max(200),
  redirectUris: z.array(z.string().url()).min(1).max(8),
  createdAt: z.string().datetime(),
})

const authorizationCodeSchema = z.object({
  clientId: z.string().min(1).max(500),
  redirectUri: z.string().url(),
  actorSubject: z.string().min(1).max(200),
  scopes: z.array(scopeSchema).min(1),
  resource: z.literal(OVERMIND_OWNER_RESOURCE),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  expiresAt: z.number().int().positive(),
})

const tokenRecordSchema = z.object({
  clientId: z.string().min(1).max(500),
  actorSubject: z.string().min(1).max(200),
  scopes: z.array(scopeSchema).min(1),
  resource: z.literal(OVERMIND_OWNER_RESOURCE),
  expiresAt: z.number().int().positive(),
})

const accessTokenSchema = tokenRecordSchema
const refreshTokenSchema = tokenRecordSchema

type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string): Promise<unknown>
  del(...keys: string[]): Promise<unknown>
}

type OAuthOptions = {
  redis?: RedisLike | null
  env?: NodeJS.ProcessEnv
  now?: () => Date
  randomToken?: () => string
  fetcher?: typeof fetch
}

export type OvermindOAuthPrincipal = {
  actorSubject: string
  scopes: string[]
  clientId: string
}

function clean(value: string | undefined) {
  const normalized = value?.trim()
  return normalized || null
}

function resolveRedis(env: NodeJS.ProcessEnv = process.env): RedisLike | null {
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN)
  return url && token ? new Redis({ url, token }) : null
}

function runtimeRedis(options: OAuthOptions) {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) return options.redis ?? null
  return resolveRedis(options.env ?? process.env)
}

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function opaqueToken(options: OAuthOptions) {
  return options.randomToken?.() ?? randomBytes(32).toString("base64url")
}

function parseStored<T>(raw: unknown, schema: z.ZodType<T>): T | null {
  if (raw === null || raw === undefined) return null
  let candidate = raw
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw)
    } catch {
      return null
    }
  }
  const parsed = schema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

function normalizeScopes(value: string | string[] | undefined, allowOffline = true): OvermindOAuthScope[] {
  const requested = Array.isArray(value) ? value : (value ?? "").split(/\s+/)
  const unique = [...new Set(requested.map((item) => item.trim()).filter(Boolean))]
  if (!unique.length) return [OVERMIND_TASK_READ_SCOPE, OVERMIND_TASK_WRITE_SCOPE]
  const parsed = unique.map((scope) => scopeSchema.parse(scope))
  return allowOffline ? parsed : parsed.filter((scope) => scope !== OVERMIND_OFFLINE_SCOPE)
}

export function isAllowedChatGPTRedirectUri(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) return false
    if (url.hostname === "chatgpt.com") {
      return (
        url.pathname === "/connector_platform_oauth_redirect" ||
        /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname)
      )
    }
    return (
      url.hostname === "connectors.api.openai.com" &&
      url.pathname === "/connector/oauth_callback/ios_relay"
    )
  } catch {
    return false
  }
}

export function oauthAuthorizationServerMetadata() {
  return {
    issuer: OVERMIND_OWNER_ISSUER,
    authorization_endpoint: `${OVERMIND_OWNER_ORIGIN}/api/mcp/oauth/authorize`,
    token_endpoint: `${OVERMIND_OWNER_ORIGIN}/api/mcp/oauth/token`,
    registration_endpoint: `${OVERMIND_OWNER_ORIGIN}/api/mcp/oauth/register`,
    revocation_endpoint: `${OVERMIND_OWNER_ORIGIN}/api/mcp/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [OVERMIND_TASK_READ_SCOPE, OVERMIND_TASK_WRITE_SCOPE, OVERMIND_OFFLINE_SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  }
}

export function oauthProtectedResourceMetadata() {
  return {
    resource: OVERMIND_OWNER_RESOURCE,
    authorization_servers: [OVERMIND_OWNER_ISSUER],
    bearer_methods_supported: ["header"],
    scopes_supported: [OVERMIND_TASK_READ_SCOPE, OVERMIND_TASK_WRITE_SCOPE],
    resource_name: "Aspect Overmind owner task control",
  }
}

export async function registerOvermindOAuthClient(
  input: {
    client_name?: unknown
    redirect_uris?: unknown
    grant_types?: unknown
    response_types?: unknown
    token_endpoint_auth_method?: unknown
  },
  options: OAuthOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")

  const redirectUris = z.array(z.string().url()).min(1).max(8).parse(input.redirect_uris)
  if (!redirectUris.every(isAllowedChatGPTRedirectUri)) throw new Error("OVERMIND_OAUTH_REDIRECT_NOT_ALLOWED")

  const grantTypes = input.grant_types === undefined
    ? ["authorization_code", "refresh_token"]
    : z.array(z.enum(["authorization_code", "refresh_token"])).min(1).parse(input.grant_types)
  if (!grantTypes.includes("authorization_code")) throw new Error("OVERMIND_OAUTH_GRANT_NOT_SUPPORTED")

  const responseTypes = input.response_types === undefined
    ? ["code"]
    : z.array(z.literal("code")).min(1).parse(input.response_types)
  const authMethod = input.token_endpoint_auth_method === undefined
    ? "none"
    : z.literal("none").parse(input.token_endpoint_auth_method)

  const clientId = `ams_${opaqueToken(options)}`
  const record = clientSchema.parse({
    clientId,
    clientName: typeof input.client_name === "string" && input.client_name.trim()
      ? input.client_name.trim().slice(0, 200)
      : "ChatGPT",
    redirectUris,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
  })
  await redis.set(`${CLIENT_PREFIX}:${tokenHash(clientId)}`, JSON.stringify(record))

  return {
    client_id: clientId,
    client_name: record.clientName,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: authMethod,
  }
}

async function resolveRegisteredClient(clientId: string, options: OAuthOptions) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  return parseStored(
    await redis.get<unknown>(`${CLIENT_PREFIX}:${tokenHash(clientId)}`),
    clientSchema,
  )
}

async function resolveChatGPTCimdClient(redirectUri: string, options: OAuthOptions) {
  if (!isAllowedChatGPTRedirectUri(redirectUri)) return null
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(CHATGPT_CIMD_CLIENT_ID, {
    method: "GET",
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) return null
  const metadata = await response.json().catch(() => null)
  const parsed = z.object({
    client_id: z.literal(CHATGPT_CIMD_CLIENT_ID),
    client_name: z.string().min(1).max(200),
    redirect_uris: z.array(z.string().url()).min(1).max(8),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
    token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
  }).safeParse(metadata)
  if (!parsed.success || !parsed.data.redirect_uris.includes(redirectUri)) return null
  if (parsed.data.response_types && !parsed.data.response_types.includes("code")) return null
  if (parsed.data.grant_types && !parsed.data.grant_types.includes("authorization_code")) return null
  return {
    clientId: parsed.data.client_id,
    clientName: parsed.data.client_name,
    redirectUris: parsed.data.redirect_uris,
    createdAt: new Date(0).toISOString(),
  }
}

export async function validateOvermindOAuthClient(
  clientId: string,
  redirectUri: string,
  options: OAuthOptions = {},
) {
  if (!isAllowedChatGPTRedirectUri(redirectUri)) throw new Error("OVERMIND_OAUTH_REDIRECT_NOT_ALLOWED")
  const client = clientId === CHATGPT_CIMD_CLIENT_ID
    ? await resolveChatGPTCimdClient(redirectUri, options)
    : await resolveRegisteredClient(clientId, options)
  if (!client || !client.redirectUris.includes(redirectUri)) throw new Error("OVERMIND_OAUTH_CLIENT_INVALID")
  return client
}

export async function createOvermindAuthorizationCode(
  input: {
    clientId: string
    redirectUri: string
    actorSubject: string
    scope?: string | string[]
    resource?: string
    codeChallenge: string
  },
  options: OAuthOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  await validateOvermindOAuthClient(input.clientId, input.redirectUri, options)
  if ((input.resource ?? OVERMIND_OWNER_RESOURCE) !== OVERMIND_OWNER_RESOURCE) {
    throw new Error("OVERMIND_OAUTH_RESOURCE_INVALID")
  }
  const codeChallenge = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/).parse(input.codeChallenge)
  const scopes = normalizeScopes(input.scope)
  const code = opaqueToken(options)
  const now = (options.now ?? (() => new Date()))().getTime()
  const record = authorizationCodeSchema.parse({
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    actorSubject: input.actorSubject,
    scopes,
    resource: OVERMIND_OWNER_RESOURCE,
    codeChallenge,
    expiresAt: now + CODE_TTL_MS,
  })
  await redis.set(`${CODE_PREFIX}:${tokenHash(code)}`, JSON.stringify(record))
  return code
}

function verifyPkce(codeVerifier: string, expectedChallenge: string) {
  const verifier = z.string().min(43).max(128).regex(/^[A-Za-z0-9._~-]+$/).parse(codeVerifier)
  const actual = createHash("sha256").update(verifier).digest("base64url")
  const encoder = new TextEncoder()
  const actualBytes = encoder.encode(actual)
  const expectedBytes = encoder.encode(expectedChallenge)
  return actualBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(actualBytes, expectedBytes)
}

async function mintTokenPair(
  input: {
    clientId: string
    actorSubject: string
    scopes: OvermindOAuthScope[]
    resource: typeof OVERMIND_OWNER_RESOURCE
  },
  options: OAuthOptions,
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  const now = (options.now ?? (() => new Date()))().getTime()
  const accessToken = opaqueToken(options)
  const refreshToken = opaqueToken(options)
  const scopes = normalizeScopes(input.scopes)
  const accessRecord = accessTokenSchema.parse({ ...input, scopes, expiresAt: now + ACCESS_TTL_MS })
  const refreshRecord = refreshTokenSchema.parse({ ...input, scopes, expiresAt: now + REFRESH_TTL_MS })
  await redis.set(`${ACCESS_PREFIX}:${tokenHash(accessToken)}`, JSON.stringify(accessRecord))
  await redis.set(`${REFRESH_PREFIX}:${tokenHash(refreshToken)}`, JSON.stringify(refreshRecord))
  return {
    access_token: accessToken,
    token_type: "Bearer" as const,
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  }
}

export async function exchangeOvermindAuthorizationCode(
  input: {
    code: string
    clientId: string
    redirectUri: string
    codeVerifier: string
    resource?: string
  },
  options: OAuthOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  const key = `${CODE_PREFIX}:${tokenHash(input.code)}`
  const record = parseStored(await redis.get<unknown>(key), authorizationCodeSchema)
  if (!record) throw new Error("OVERMIND_OAUTH_CODE_INVALID")
  const now = (options.now ?? (() => new Date()))().getTime()
  if (record.expiresAt <= now) {
    await redis.del(key)
    throw new Error("OVERMIND_OAUTH_CODE_EXPIRED")
  }
  if (record.clientId !== input.clientId || record.redirectUri !== input.redirectUri) {
    throw new Error("OVERMIND_OAUTH_CODE_BINDING_MISMATCH")
  }
  if ((input.resource ?? record.resource) !== record.resource) throw new Error("OVERMIND_OAUTH_RESOURCE_INVALID")
  if (!verifyPkce(input.codeVerifier, record.codeChallenge)) throw new Error("OVERMIND_OAUTH_PKCE_INVALID")
  await validateOvermindOAuthClient(input.clientId, input.redirectUri, options)
  await redis.del(key)
  return mintTokenPair(record, options)
}

export async function refreshOvermindAccessToken(
  input: { refreshToken: string; clientId: string; scope?: string; resource?: string },
  options: OAuthOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  const key = `${REFRESH_PREFIX}:${tokenHash(input.refreshToken)}`
  const record = parseStored(await redis.get<unknown>(key), refreshTokenSchema)
  if (!record) throw new Error("OVERMIND_OAUTH_REFRESH_INVALID")
  const now = (options.now ?? (() => new Date()))().getTime()
  if (record.expiresAt <= now) {
    await redis.del(key)
    throw new Error("OVERMIND_OAUTH_REFRESH_EXPIRED")
  }
  if (record.clientId !== input.clientId) throw new Error("OVERMIND_OAUTH_CLIENT_INVALID")
  if ((input.resource ?? record.resource) !== record.resource) throw new Error("OVERMIND_OAUTH_RESOURCE_INVALID")

  const requested = input.scope ? normalizeScopes(input.scope) : record.scopes
  if (requested.some((scope) => !record.scopes.includes(scope))) {
    throw new Error("OVERMIND_OAUTH_SCOPE_ESCALATION_REJECTED")
  }
  await redis.del(key)
  return mintTokenPair({ ...record, scopes: requested }, options)
}

export async function validateOvermindAccessToken(
  bearerToken: string,
  requiredScope: typeof OVERMIND_TASK_READ_SCOPE | typeof OVERMIND_TASK_WRITE_SCOPE,
  options: OAuthOptions = {},
): Promise<OvermindOAuthPrincipal | null> {
  const redis = runtimeRedis(options)
  if (!redis) return null
  const record = parseStored(
    await redis.get<unknown>(`${ACCESS_PREFIX}:${tokenHash(bearerToken)}`),
    accessTokenSchema,
  )
  if (!record) return null
  const now = (options.now ?? (() => new Date()))().getTime()
  if (record.expiresAt <= now || record.resource !== OVERMIND_OWNER_RESOURCE) return null
  if (!record.scopes.includes(requiredScope)) return null
  return { actorSubject: record.actorSubject, scopes: record.scopes, clientId: record.clientId }
}

export async function revokeOvermindOAuthToken(token: string, options: OAuthOptions = {}) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  const hash = tokenHash(token)
  await redis.del(`${ACCESS_PREFIX}:${hash}`, `${REFRESH_PREFIX}:${hash}`)
}
