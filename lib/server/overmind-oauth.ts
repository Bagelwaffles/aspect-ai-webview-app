import { createHash, randomBytes } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

import { isStableCustomerSubject } from "@/lib/auth"

export const OVERMIND_OAUTH_ISSUER = "https://www.aspectmarketingsolutions.app"
export const OVERMIND_OWNER_MCP_RESOURCE = `${OVERMIND_OAUTH_ISSUER}/api/mcp-owner`
export const OVERMIND_OAUTH_PROTECTED_RESOURCE_METADATA = `${OVERMIND_OAUTH_ISSUER}/.well-known/oauth-protected-resource`
export const OVERMIND_OAUTH_AUTHORIZATION_SERVER_METADATA = `${OVERMIND_OAUTH_ISSUER}/.well-known/oauth-authorization-server`

export const OVERMIND_OAUTH_SCOPES = ["overmind.read", "overmind.control", "offline_access"] as const
const overmindScopeSchema = z.enum(OVERMIND_OAUTH_SCOPES)
export type OvermindOAuthScope = z.infer<typeof overmindScopeSchema>

const OAUTH_PREFIX = "ams:overmind:oauth:v1"
const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
const CLIENT_TTL_SECONDS = 24 * 60 * 60

export type OvermindOAuthRedisLike = {
  get<T = unknown>(key: string): Promise<T | null>
  getdel<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string, options?: { ex?: number }): Promise<unknown>
}

type OAuthOptions = {
  redis?: OvermindOAuthRedisLike | null
  env?: NodeJS.ProcessEnv
  now?: () => Date
  randomToken?: () => string
}

const oauthClientSchema = z
  .object({
    clientId: z.string().min(16).max(200),
    clientName: z.string().min(1).max(200),
    redirectUris: z.array(z.string().url()).min(1).max(8),
    applicationType: z.enum(["web", "native"]),
    createdAt: z.string().datetime(),
  })
  .strict()

type OAuthClient = z.infer<typeof oauthClientSchema>

const authorizationCodeSchema = z
  .object({
    clientId: z.string().min(16).max(200),
    redirectUri: z.string().url(),
    scopes: z.array(overmindScopeSchema).min(1),
    resource: z.literal(OVERMIND_OWNER_MCP_RESOURCE),
    codeChallenge: z.string().min(43).max(128),
    ownerSubject: z.string().refine(isStableCustomerSubject),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict()

type AuthorizationCodeRecord = z.infer<typeof authorizationCodeSchema>

const accessTokenSchema = z
  .object({
    clientId: z.string().min(16).max(200),
    scopes: z.array(overmindScopeSchema).min(1),
    resource: z.literal(OVERMIND_OWNER_MCP_RESOURCE),
    ownerSubject: z.string().refine(isStableCustomerSubject),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict()

export type OvermindAccessTokenRecord = z.infer<typeof accessTokenSchema>

const refreshTokenSchema = accessTokenSchema.extend({
  expiresAt: z.string().datetime(),
})

type RefreshTokenRecord = z.infer<typeof refreshTokenSchema>

const registrationSchema = z
  .object({
    client_name: z.string().trim().min(1).max(200).optional(),
    redirect_uris: z.array(z.string().url()).min(1).max(8),
    grant_types: z.array(z.string()).max(4).optional(),
    response_types: z.array(z.string()).max(4).optional(),
    token_endpoint_auth_method: z.string().optional(),
    application_type: z.enum(["web", "native"]).optional(),
  })
  .passthrough()

const authorizationRequestSchema = z
  .object({
    response_type: z.literal("code"),
    client_id: z.string().min(16).max(200),
    redirect_uri: z.string().url(),
    scope: z.string().max(500).optional(),
    state: z.string().min(8).max(2_000),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
    code_challenge_method: z.literal("S256"),
    resource: z.literal(OVERMIND_OWNER_MCP_RESOURCE),
  })
  .strict()

export type OvermindAuthorizationRequest = z.infer<typeof authorizationRequestSchema> & {
  scopes: OvermindOAuthScope[]
}

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function runtimeRedis(options: OAuthOptions): OvermindOAuthRedisLike | null {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) return options.redis ?? null
  const env = options.env ?? process.env
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN)
  return url && token ? new Redis({ url, token }) : null
}

function now(options: OAuthOptions) {
  return (options.now ?? (() => new Date()))()
}

function randomToken(options: OAuthOptions) {
  return (options.randomToken ?? (() => randomBytes(32).toString("base64url")))()
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
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

function clientKey(clientId: string) {
  return `${OAUTH_PREFIX}:client:${clientId}`
}

function authorizationCodeKey(code: string) {
  return `${OAUTH_PREFIX}:code:${digest(code)}`
}

function accessTokenKey(token: string) {
  return `${OAUTH_PREFIX}:access:${digest(token)}`
}

function refreshTokenKey(token: string) {
  return `${OAUTH_PREFIX}:refresh:${digest(token)}`
}

function allowedRedirectHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "openai.com" || host.endsWith(".openai.com")
}

export function isAllowedOvermindOAuthRedirectUri(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && allowedRedirectHost(url.hostname)
  } catch {
    return false
  }
}

function normalizeScopes(value: string | undefined): OvermindOAuthScope[] {
  const raw = value?.trim()
  const requested = raw ? raw.split(/\s+/u) : [...OVERMIND_OAUTH_SCOPES]
  const unique = [...new Set(requested)]
  if (!unique.length) throw new Error("OVERMIND_OAUTH_SCOPE_REQUIRED")
  const parsed = unique.map((scope) => overmindScopeSchema.safeParse(scope))
  if (parsed.some((entry) => !entry.success)) throw new Error("OVERMIND_OAUTH_SCOPE_INVALID")
  return parsed.map((entry) => (entry as { success: true; data: OvermindOAuthScope }).data)
}

function scopeString(scopes: OvermindOAuthScope[]) {
  return scopes.join(" ")
}

export function overmindPkceS256(verifier: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error("OVERMIND_OAUTH_CODE_VERIFIER_INVALID")
  return createHash("sha256").update(verifier).digest("base64url")
}

export async function registerOvermindOAuthClient(rawInput: unknown, options: OAuthOptions = {}) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  const input = registrationSchema.parse(rawInput)

  if (input.grant_types && !input.grant_types.includes("authorization_code")) {
    throw new Error("OVERMIND_OAUTH_GRANT_TYPE_UNSUPPORTED")
  }
  if (input.response_types && !input.response_types.includes("code")) {
    throw new Error("OVERMIND_OAUTH_RESPONSE_TYPE_UNSUPPORTED")
  }
  if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none") {
    throw new Error("OVERMIND_OAUTH_CLIENT_AUTH_UNSUPPORTED")
  }
  if (input.redirect_uris.some((uri) => !isAllowedOvermindOAuthRedirectUri(uri))) {
    throw new Error("OVERMIND_OAUTH_REDIRECT_URI_REJECTED")
  }

  const createdAt = now(options)
  const client = oauthClientSchema.parse({
    clientId: `mcp_${randomToken(options)}`,
    clientName: input.client_name ?? "ChatGPT MCP client",
    redirectUris: [...new Set(input.redirect_uris)],
    applicationType: input.application_type ?? "web",
    createdAt: createdAt.toISOString(),
  })
  await redis.set(clientKey(client.clientId), JSON.stringify(client), { ex: CLIENT_TTL_SECONDS })

  return {
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    application_type: client.applicationType,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(createdAt.getTime() / 1_000),
  }
}

async function getClient(clientId: string, options: OAuthOptions) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  return parseStored(await redis.get<unknown>(clientKey(clientId)), oauthClientSchema)
}

export async function validateOvermindAuthorizationRequest(
  rawInput: unknown,
  options: OAuthOptions = {},
): Promise<{ request: OvermindAuthorizationRequest; client: OAuthClient }> {
  const input = authorizationRequestSchema.parse(rawInput)
  const client = await getClient(input.client_id, options)
  if (!client) throw new Error("OVERMIND_OAUTH_CLIENT_NOT_FOUND")
  if (!client.redirectUris.includes(input.redirect_uri)) throw new Error("OVERMIND_OAUTH_REDIRECT_URI_MISMATCH")
  const scopes = normalizeScopes(input.scope)
  return { request: { ...input, scopes }, client }
}

export async function createOvermindAuthorizationCode(
  rawInput: unknown,
  owner: { subject: string; email: string },
  options: OAuthOptions = {},
) {
  if (!isStableCustomerSubject(owner.subject)) throw new Error("OVERMIND_OAUTH_OWNER_SUBJECT_INVALID")
  z.string().trim().toLowerCase().email().parse(owner.email)
  const { request, client } = await validateOvermindAuthorizationRequest(rawInput, options)
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")

  const createdAt = now(options)
  const code = randomToken(options)
  const record = authorizationCodeSchema.parse({
    clientId: request.client_id,
    redirectUri: request.redirect_uri,
    scopes: request.scopes,
    resource: request.resource,
    codeChallenge: request.code_challenge,
    ownerSubject: owner.subject,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + AUTHORIZATION_CODE_TTL_SECONDS * 1_000).toISOString(),
  })
  await redis.set(authorizationCodeKey(code), JSON.stringify(record), { ex: AUTHORIZATION_CODE_TTL_SECONDS })
  return { code, request, client }
}

async function issueTokenPair(record: AuthorizationCodeRecord | RefreshTokenRecord, options: OAuthOptions) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  const createdAt = now(options)
  const accessToken = randomToken(options)
  const accessRecord = accessTokenSchema.parse({
    clientId: record.clientId,
    scopes: record.scopes,
    resource: record.resource,
    ownerSubject: record.ownerSubject,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1_000).toISOString(),
  })
  await redis.set(accessTokenKey(accessToken), JSON.stringify(accessRecord), { ex: ACCESS_TOKEN_TTL_SECONDS })

  let refreshToken: string | undefined
  if (record.scopes.includes("offline_access")) {
    refreshToken = randomToken(options)
    const refreshRecord = refreshTokenSchema.parse({
      ...accessRecord,
      expiresAt: new Date(createdAt.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1_000).toISOString(),
    })
    await redis.set(refreshTokenKey(refreshToken), JSON.stringify(refreshRecord), { ex: REFRESH_TOKEN_TTL_SECONDS })
  }

  return {
    access_token: accessToken,
    token_type: "Bearer" as const,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: scopeString(record.scopes),
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  }
}

export async function exchangeOvermindAuthorizationCode(
  input: {
    code: string
    clientId: string
    redirectUri: string
    codeVerifier: string
    resource: string
  },
  options: OAuthOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  if (input.resource !== OVERMIND_OWNER_MCP_RESOURCE) throw new Error("OVERMIND_OAUTH_RESOURCE_MISMATCH")

  const record = parseStored(
    await redis.getdel<unknown>(authorizationCodeKey(input.code)),
    authorizationCodeSchema,
  )
  if (!record) throw new Error("OVERMIND_OAUTH_CODE_INVALID")
  if (Date.parse(record.expiresAt) <= now(options).getTime()) throw new Error("OVERMIND_OAUTH_CODE_EXPIRED")
  if (record.clientId !== input.clientId) throw new Error("OVERMIND_OAUTH_CLIENT_MISMATCH")
  if (record.redirectUri !== input.redirectUri) throw new Error("OVERMIND_OAUTH_REDIRECT_URI_MISMATCH")
  if (record.resource !== input.resource) throw new Error("OVERMIND_OAUTH_RESOURCE_MISMATCH")
  if (overmindPkceS256(input.codeVerifier) !== record.codeChallenge) throw new Error("OVERMIND_OAUTH_PKCE_MISMATCH")

  return issueTokenPair(record, { ...options, redis })
}

export async function refreshOvermindAccessToken(
  input: { refreshToken: string; clientId: string; resource: string; scope?: string },
  options: OAuthOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  if (input.resource !== OVERMIND_OWNER_MCP_RESOURCE) throw new Error("OVERMIND_OAUTH_RESOURCE_MISMATCH")

  const record = parseStored(
    await redis.getdel<unknown>(refreshTokenKey(input.refreshToken)),
    refreshTokenSchema,
  )
  if (!record) throw new Error("OVERMIND_OAUTH_REFRESH_TOKEN_INVALID")
  if (Date.parse(record.expiresAt) <= now(options).getTime()) throw new Error("OVERMIND_OAUTH_REFRESH_TOKEN_EXPIRED")
  if (record.clientId !== input.clientId) throw new Error("OVERMIND_OAUTH_CLIENT_MISMATCH")
  if (record.resource !== input.resource) throw new Error("OVERMIND_OAUTH_RESOURCE_MISMATCH")

  const requestedScopes = input.scope ? normalizeScopes(input.scope) : record.scopes
  if (requestedScopes.some((scope) => !record.scopes.includes(scope))) throw new Error("OVERMIND_OAUTH_SCOPE_ESCALATION_REJECTED")

  return issueTokenPair({ ...record, scopes: requestedScopes }, { ...options, redis })
}

export async function verifyOvermindAccessToken(
  token: string,
  options: OAuthOptions = {},
): Promise<OvermindAccessTokenRecord | null> {
  if (!token || token.length > 2_000) return null
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_OAUTH_STORE_UNAVAILABLE")
  const record = parseStored(await redis.get<unknown>(accessTokenKey(token)), accessTokenSchema)
  if (!record) return null
  if (record.resource !== OVERMIND_OWNER_MCP_RESOURCE) return null
  if (Date.parse(record.expiresAt) <= now(options).getTime()) return null
  return record
}

export function bearerTokenFromAuthorizationHeader(value: string | null) {
  if (!value) return null
  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim())
  return match?.[1] ?? null
}

export function accessTokenHasScope(record: OvermindAccessTokenRecord, scope: OvermindOAuthScope) {
  return record.scopes.includes(scope)
}
