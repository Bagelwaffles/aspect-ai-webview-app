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

export const TWITCH_SCOPE = "user:read:broadcast"
export const TWITCH_MEDIA_SCOPE = "channel:manage:clips"
export const TWITCH_BROADCAST_SCOPE = "channel:manage:broadcast"
export const TWITCH_OAUTH_COOKIE = "ams_twitch_oauth"

const CONNECTION_KEY = "ams:twitch-pilot:v1:connection"
const SESSION_KEY = "ams:twitch-pilot:v1:session"
const SUMMARY_KEY = "ams:twitch-pilot:v1:summary:latest"
const SUMMARY_STREAM_PREFIX = "ams:twitch-pilot:v1:summary:"
const EVENT_ID_PREFIX = "ams:twitch-pilot:v1:event:"
const SUBSCRIPTION_KEY = "ams:twitch-pilot:v1:subscriptions"
const VOD_CLIP_PENDING_KEY = "ams:twitch-pilot:v1:vod-clips:pending"
const VOD_CLIP_PENDING_TTL_SECONDS = 60 * 60 * 24 * 2
const VOD_CLIP_VERIFY_AFTER_MS = 60_000
const MAX_PENDING_VOD_CLIPS = 100
const EVENT_DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 7
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const SUMMARY_TTL_SECONDS = 60 * 60 * 24 * 180
const OAUTH_ATTEMPT_TTL_SECONDS = 10 * 60
const MAX_WEBHOOK_AGE_MS = 10 * 60 * 1000

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.array(z.string()).optional().default([]),
  token_type: z.string().optional(),
})

const validateResponseSchema = z.object({
  client_id: z.string().min(1),
  login: z.string().min(1),
  scopes: z.array(z.string()).optional().default([]),
  user_id: z.string().min(1),
  expires_in: z.number().int().nonnegative().optional(),
})

const oauthAttemptSchema = z.object({
  state: z.string().min(32).max(200),
  expiresAt: z.number().int().positive(),
  capability: z.enum(["pilot", "media", "creator"]).default("pilot"),
})

const encryptedConnectionSchema = z.object({
  broadcasterId: z.string().min(1),
  login: z.string().min(1),
  displayName: z.string().min(1),
  scopes: z.array(z.string()),
  connectedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  cipherText: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
})

const secretSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
})

const subscriptionSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  type: z.string().min(1),
  version: z.string().min(1),
}).passthrough()

const eventEnvelopeSchema = z.object({
  subscription: z.object({
    id: z.string().optional(),
    status: z.string().optional(),
    type: z.string().min(1),
    version: z.string().optional(),
    condition: z.record(z.string()).optional(),
  }).passthrough(),
  event: z.record(z.unknown()).optional(),
  challenge: z.string().optional(),
})

const pendingVodClipSchema = z.object({
  id: z.string().min(1).max(160),
  vodId: z.string().min(1).max(160),
  vodOffset: z.number().int().nonnegative(),
  duration: z.number().min(5).max(60),
  title: z.string().min(1).max(100),
  requestedAt: z.string().datetime(),
})

export type PendingTwitchVodClip = z.infer<typeof pendingVodClipSchema>

const streamSessionSchema = z.object({
  broadcasterId: z.string().min(1),
  broadcasterLogin: z.string().min(1),
  broadcasterName: z.string().min(1),
  streamId: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  title: z.string().default(""),
  categoryId: z.string().default(""),
  categoryName: z.string().default(""),
  language: z.string().default(""),
  updates: z.array(z.object({
    at: z.string().datetime(),
    title: z.string(),
    categoryId: z.string(),
    categoryName: z.string(),
    language: z.string(),
  })).max(50),
})

export type TwitchStreamSession = z.infer<typeof streamSessionSchema>

export type TwitchPilotSummary = {
  broadcasterId: string
  broadcasterLogin: string
  broadcasterName: string
  streamId: string
  startedAt: string
  endedAt: string
  durationMinutes: number
  title: string
  categoryName: string
  vod: { id: string; title: string; url: string; duration: string; createdAt: string } | null
  markers: Array<{ id: string; description: string; positionSeconds: number; url: string }>
  clips: Array<{
    id: string
    title: string
    url: string
    creatorName: string
    viewCount: number
    createdAt: string
    videoId?: string
    gameId?: string
    thumbnailUrl?: string
    duration?: number
    vodOffset?: number | null
  }>
  updateCount: number
  summary: string
  generatedAt: string
  sourceModel: "twitch-metadata"
}

type TwitchConfig = {
  clientId: string
  clientSecret: string
  eventSubSecret: string
  appOrigin: string
  redirectUri: string
  eventSubCallback: string
}

type RedisLike = Redis

type TwitchOptions = {
  env?: NodeJS.ProcessEnv
  redis?: RedisLike | null
  fetcher?: typeof fetch
  now?: () => Date
}

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function resolveRedis(env: NodeJS.ProcessEnv): RedisLike | null {
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN)
  return url && token ? new Redis({ url, token }) : null
}

function runtimeRedis(options: TwitchOptions) {
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

export function resolveTwitchConfig(env: NodeJS.ProcessEnv = process.env): TwitchConfig | null {
  const clientId = clean(env.AMS_TWITCH_CLIENT_ID)
  const clientSecret = clean(env.AMS_TWITCH_CLIENT_SECRET)
  const eventSubSecret = clean(env.AMS_TWITCH_EVENTSUB_SECRET)
  const origin = appOrigin(env)
  if (!clientId || !clientSecret || !eventSubSecret || !origin) return null
  if (eventSubSecret.length < 10 || eventSubSecret.length > 100) return null
  return {
    clientId,
    clientSecret,
    eventSubSecret,
    appOrigin: origin,
    redirectUri: `${origin}/api/internal/twitch/callback`,
    eventSubCallback: `${origin}/api/twitch/eventsub`,
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

export function isTwitchPilotConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(resolveTwitchConfig(env) && encryptionKey(env) && resolveRedis(env))
}

function oauthSigningSecret(env: NodeJS.ProcessEnv) {
  return clean(env.NEXTAUTH_SECRET) ?? clean(env.INTERNAL_ADMIN_SECRET)
}

function signOauthPayload(encoded: string, env: NodeJS.ProcessEnv) {
  const secret = oauthSigningSecret(env)
  if (!secret) throw new Error("TWITCH_OAUTH_NOT_CONFIGURED")
  return createHmac("sha256", secret).update(encoded).digest("base64url")
}

export function createTwitchOauthAttempt(
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
  capability: "pilot" | "media" | "creator" = "pilot",
) {
  if (!isTwitchPilotConfigured(env) || !oauthSigningSecret(env)) {
    throw new Error("TWITCH_OAUTH_NOT_CONFIGURED")
  }
  const payload = oauthAttemptSchema.parse({
    state: randomBytes(32).toString("base64url"),
    expiresAt: now + OAUTH_ATTEMPT_TTL_SECONDS * 1000,
    capability,
  })
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return {
    state: payload.state,
    cookieValue: `${encoded}.${signOauthPayload(encoded, env)}`,
    maxAgeSeconds: OAUTH_ATTEMPT_TTL_SECONDS,
  }
}

export function readTwitchOauthAttempt(
  cookieValue: string | undefined,
  expectedState: string | null,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
) {
  if (!cookieValue || !expectedState) throw new Error("TWITCH_OAUTH_STATE_INVALID")
  const [encoded, signature, ...rest] = cookieValue.split(".")
  if (!encoded || !signature || rest.length) throw new Error("TWITCH_OAUTH_STATE_INVALID")
  const expected = signOauthPayload(encoded, env)
  const left = Buffer.from(signature, "utf8")
  const right = Buffer.from(expected, "utf8")
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("TWITCH_OAUTH_STATE_INVALID")
  }
  let raw: unknown
  try {
    raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  } catch {
    throw new Error("TWITCH_OAUTH_STATE_INVALID")
  }
  const parsed = oauthAttemptSchema.parse(raw)
  if (parsed.expiresAt < now) throw new Error("TWITCH_OAUTH_STATE_EXPIRED")
  if (parsed.state !== expectedState) throw new Error("TWITCH_OAUTH_STATE_INVALID")
  return parsed
}

export function buildTwitchAuthorizationUrl(
  state: string,
  env: NodeJS.ProcessEnv = process.env,
  includeMediaScope = false,
  includeBroadcastScope = false,
) {
  const config = resolveTwitchConfig(env)
  if (!config) throw new Error("TWITCH_OAUTH_NOT_CONFIGURED")
  const url = new URL("https://id.twitch.tv/oauth2/authorize")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set(
    "scope",
    [
      TWITCH_SCOPE,
      ...(includeMediaScope ? [TWITCH_MEDIA_SCOPE] : []),
      ...(includeBroadcastScope ? [TWITCH_BROADCAST_SCOPE] : []),
    ].join(" "),
  )
  if (includeMediaScope || includeBroadcastScope) url.searchParams.set("force_verify", "true")
  url.searchParams.set("state", state)
  return url
}

function expirationIso(seconds: number | undefined, now = Date.now()) {
  return typeof seconds === "number" && seconds > 0
    ? new Date(now + seconds * 1000).toISOString()
    : null
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

async function parseJson(response: Response) {
  return response.json().catch(() => null)
}

async function validateUserToken(accessToken: string, fetcher: typeof fetch) {
  const response = await fetcher("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `OAuth ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error("TWITCH_TOKEN_VALIDATION_FAILED")
  return validateResponseSchema.parse(await parseJson(response))
}

async function twitchUserDisplayName(
  accessToken: string,
  clientId: string,
  userId: string,
  fetcher: typeof fetch,
) {
  try {
    const url = new URL("https://api.twitch.tv/helix/users")
    url.searchParams.set("id", userId)
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": clientId },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const body = await parseJson(response) as { data?: Array<{ display_name?: string }> } | null
    return body?.data?.[0]?.display_name?.trim() || null
  } catch {
    return null
  }
}

async function saveConnection(
  connection: Omit<z.infer<typeof encryptedConnectionSchema>, "cipherText" | "iv" | "authTag">,
  secret: z.infer<typeof secretSchema>,
  options: TwitchOptions,
) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  const key = encryptionKey(env)
  if (!redis || !key) throw new Error("TWITCH_CONNECTION_VAULT_UNAVAILABLE")
  const record = encryptedConnectionSchema.parse({
    ...connection,
    ...encryptSecret(secret, key),
  })
  await redis.set(CONNECTION_KEY, JSON.stringify(record))
  return publicConnection(record)
}

async function loadConnection(options: TwitchOptions = {}) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  const key = encryptionKey(env)
  if (!redis || !key) throw new Error("TWITCH_CONNECTION_VAULT_UNAVAILABLE")
  const raw = await redis.get<unknown>(CONNECTION_KEY)
  if (!raw) return null
  const parsed = encryptedConnectionSchema.safeParse(
    typeof raw === "string" ? JSON.parse(raw) : raw,
  )
  if (!parsed.success) return null
  return { record: parsed.data, secret: decryptSecret(parsed.data, key) }
}

function publicConnection(record: z.infer<typeof encryptedConnectionSchema>) {
  return {
    broadcasterId: record.broadcasterId,
    login: record.login,
    displayName: record.displayName,
    scopes: record.scopes,
    connectedAt: record.connectedAt,
    updatedAt: record.updatedAt,
  }
}

export async function exchangeTwitchAuthorizationCode(
  code: string,
  options: TwitchOptions = {},
  requiredScopes: string[] = [TWITCH_SCOPE],
) {
  const env = options.env ?? process.env
  const config = resolveTwitchConfig(env)
  const fetcher = options.fetcher ?? fetch
  const redis = runtimeRedis(options)
  if (!config || !redis || !encryptionKey(env)) throw new Error("TWITCH_OAUTH_NOT_CONFIGURED")

  const response = await fetcher("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error("TWITCH_TOKEN_EXCHANGE_FAILED")
  const token = tokenResponseSchema.parse(await parseJson(response))
  if (!token.refresh_token) throw new Error("TWITCH_REFRESH_TOKEN_MISSING")
  const validation = await validateUserToken(token.access_token, fetcher)
  if (validation.client_id !== config.clientId) throw new Error("TWITCH_CLIENT_ID_MISMATCH")
  if (!requiredScopes.every((scope) => validation.scopes.includes(scope))) {
    throw new Error("TWITCH_REQUIRED_SCOPE_MISSING")
  }

  const now = (options.now ?? (() => new Date()))()
  const displayName =
    (await twitchUserDisplayName(token.access_token, config.clientId, validation.user_id, fetcher)) ??
    validation.login

  const saved = await saveConnection(
    {
      broadcasterId: validation.user_id,
      login: validation.login,
      displayName,
      scopes: validation.scopes,
      connectedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: expirationIso(token.expires_in, now.getTime()),
    },
    options,
  )

  const subscriptions = await ensureTwitchEventSubSubscriptions(validation.user_id, options)
  return { connection: saved, subscriptions }
}

async function appAccessToken(options: TwitchOptions = {}) {
  const env = options.env ?? process.env
  const config = resolveTwitchConfig(env)
  if (!config) throw new Error("TWITCH_NOT_CONFIGURED")
  const response = await (options.fetcher ?? fetch)("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error("TWITCH_APP_TOKEN_FAILED")
  return tokenResponseSchema.parse(await parseJson(response)).access_token
}

export async function ensureTwitchEventSubSubscriptions(
  broadcasterId: string,
  options: TwitchOptions = {},
) {
  const env = options.env ?? process.env
  const config = resolveTwitchConfig(env)
  const redis = runtimeRedis(options)
  const fetcher = options.fetcher ?? fetch
  if (!config || !redis) throw new Error("TWITCH_NOT_CONFIGURED")
  const accessToken = await appAccessToken(options)
  const wanted = [
    { type: "stream.online", version: "1" },
    { type: "stream.offline", version: "1" },
    { type: "channel.update", version: "2" },
  ] as const
  const results: Array<{ type: string; status: string; id: string | null }> = []

  for (const item of wanted) {
    const response = await fetcher("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": config.clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: item.type,
        version: item.version,
        condition: { broadcaster_user_id: broadcasterId },
        transport: {
          method: "webhook",
          callback: config.eventSubCallback,
          secret: config.eventSubSecret,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
    if (response.status === 409) {
      results.push({ type: item.type, status: "already_exists", id: null })
      continue
    }
    if (!response.ok) throw new Error(`TWITCH_EVENTSUB_CREATE_FAILED:${item.type}:${response.status}`)
    const body = await parseJson(response) as { data?: unknown[] } | null
    const parsed = subscriptionSchema.safeParse(body?.data?.[0])
    results.push({
      type: item.type,
      status: parsed.success ? parsed.data.status : "verification_pending",
      id: parsed.success ? parsed.data.id : null,
    })
  }
  await redis.set(SUBSCRIPTION_KEY, JSON.stringify(results))
  return results
}

function webhookMessage(
  messageId: string,
  timestamp: string,
  rawBody: string,
) {
  return `${messageId}${timestamp}${rawBody}`
}

export function verifyTwitchEventSubSignature(
  input: {
    messageId: string | null
    timestamp: string | null
    signature: string | null
    rawBody: string
  },
  secret: string,
  now = Date.now(),
) {
  if (!input.messageId || !input.timestamp || !input.signature) return false
  const timestampMs = Date.parse(input.timestamp)
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > MAX_WEBHOOK_AGE_MS) return false
  const expected = `sha256=${createHmac("sha256", secret)
    .update(webhookMessage(input.messageId, input.timestamp, input.rawBody))
    .digest("hex")}`
  const actualBytes = Buffer.from(input.signature, "utf8")
  const expectedBytes = Buffer.from(expected, "utf8")
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

async function claimEventId(messageId: string, redis: RedisLike) {
  const result = await redis.set(`${EVENT_ID_PREFIX}${messageId}`, "processing", {
    nx: true,
    ex: EVENT_DEDUPE_TTL_SECONDS,
  })
  return result === "OK"
}

async function completeEventId(messageId: string, redis: RedisLike) {
  await redis.set(`${EVENT_ID_PREFIX}${messageId}`, "done", {
    ex: EVENT_DEDUPE_TTL_SECONDS,
  })
}

async function releaseEventId(messageId: string, redis: RedisLike) {
  await redis.del(`${EVENT_ID_PREFIX}${messageId}`)
}

async function helixGet(
  path: string,
  params: Record<string, string>,
  options: TwitchOptions,
) {
  const config = resolveTwitchConfig(options.env ?? process.env)
  if (!config) throw new Error("TWITCH_NOT_CONFIGURED")
  const token = await appAccessToken(options)
  const url = new URL(`https://api.twitch.tv/helix/${path}`)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  const response = await (options.fetcher ?? fetch)(url, {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": config.clientId },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`TWITCH_HELIX_FAILED:${path}:${response.status}`)
  return parseJson(response)
}

async function getChannelSnapshot(broadcasterId: string, options: TwitchOptions) {
  try {
    const body = await helixGet("channels", { broadcaster_id: broadcasterId }, options) as {
      data?: Array<{ title?: string; game_id?: string; game_name?: string; broadcaster_language?: string }>
    }
    const item = body?.data?.[0]
    return item
      ? {
          title: item.title ?? "",
          categoryId: item.game_id ?? "",
          categoryName: item.game_name ?? "",
          language: item.broadcaster_language ?? "",
        }
      : null
  } catch {
    return null
  }
}

async function getMarkers(options: TwitchOptions, videoId?: string | null) {
  const env = options.env ?? process.env
  const config = resolveTwitchConfig(env)
  const connection = await loadConnection(options)
  if (!config || !connection) return []
  const fetcher = options.fetcher ?? fetch
  const call = async (token: string) => {
    const url = new URL("https://api.twitch.tv/helix/streams/markers")
    if (videoId) {
      url.searchParams.set("video_id", videoId)
    } else {
      url.searchParams.set("user_id", connection.record.broadcasterId)
    }
    url.searchParams.set("first", "100")
    return fetcher(url, {
      headers: { Authorization: `Bearer ${token}`, "Client-Id": config.clientId },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  }

  let response = await call(connection.secret.accessToken)
  if (response.status === 401) {
    const refreshed = await refreshTwitchUserToken(options)
    response = await call(refreshed.accessToken)
  }
  if (!response.ok) return []
  const body = await parseJson(response) as {
    data?: Array<{ videos?: Array<{ markers?: Array<{ id?: string; description?: string; position_seconds?: number; URL?: string; url?: string }> }> }>
  }
  return (body?.data ?? [])
    .flatMap((item) => item.videos ?? [])
    .flatMap((video) => video.markers ?? [])
    .map((marker) => ({
      id: marker.id ?? "",
      description: marker.description ?? "",
      positionSeconds: marker.position_seconds ?? 0,
      url: marker.URL ?? marker.url ?? "",
    }))
    .filter((marker) => marker.id)
}

async function refreshTwitchUserToken(options: TwitchOptions = {}) {
  const env = options.env ?? process.env
  const config = resolveTwitchConfig(env)
  const existing = await loadConnection(options)
  const fetcher = options.fetcher ?? fetch
  if (!config || !existing) throw new Error("TWITCH_CONNECTION_REQUIRED")
  const response = await fetcher("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: existing.secret.refreshToken,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error("TWITCH_REFRESH_FAILED")
  const token = tokenResponseSchema.parse(await parseJson(response))
  if (!token.refresh_token) throw new Error("TWITCH_REFRESH_TOKEN_MISSING")
  const validation = await validateUserToken(token.access_token, fetcher)
  if (validation.user_id !== existing.record.broadcasterId) throw new Error("TWITCH_USER_MISMATCH")
  await saveConnection(
    {
      ...publicConnection(existing.record),
      connectedAt: existing.record.connectedAt,
      updatedAt: new Date().toISOString(),
    },
    {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: expirationIso(token.expires_in),
    },
    options,
  )
  return { accessToken: token.access_token, validation }
}

export function twitchMediaScopeEnabled(scopes: string[] | null | undefined) {
  return Boolean(scopes?.includes(TWITCH_MEDIA_SCOPE))
}

export function twitchBroadcastScopeEnabled(scopes: string[] | null | undefined) {
  return Boolean(scopes?.includes(TWITCH_BROADCAST_SCOPE))
}

async function twitchUserRequest(
  url: URL,
  init: RequestInit,
  options: TwitchOptions = {},
  requiredScope: string = TWITCH_MEDIA_SCOPE,
) {
  const env = options.env ?? process.env
  const config = resolveTwitchConfig(env)
  const existing = await loadConnection(options)
  const fetcher = options.fetcher ?? fetch
  if (!config || !existing) throw new Error("TWITCH_CONNECTION_REQUIRED")
  if (!existing.record.scopes.includes(requiredScope)) {
    throw new Error(
      requiredScope === TWITCH_BROADCAST_SCOPE
        ? "TWITCH_BROADCAST_SCOPE_REQUIRED"
        : "TWITCH_MEDIA_SCOPE_REQUIRED",
    )
  }

  const call = (token: string) => fetcher(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Client-Id": config.clientId,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })

  let response = await call(existing.secret.accessToken)
  if (response.status === 401) {
    const refreshed = await refreshTwitchUserToken(options)
    response = await call(refreshed.accessToken)
  }
  return response
}


const smokyChannelMetadataSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  tags: z.array(z.string().trim().min(1).max(25)).max(10).optional(),
  broadcasterLanguage: z.string().trim().regex(/^(?:[a-z]{2}|other)$/u).optional(),
}).strict().refine(
  (value) => value.title !== undefined || value.tags !== undefined || value.broadcasterLanguage !== undefined,
  "At least one Twitch channel metadata field is required.",
)

export async function modifySmokyTwitchChannelInformation(
  input: z.input<typeof smokyChannelMetadataSchema>,
  options: TwitchOptions = {},
) {
  const existing = await loadConnection(options)
  if (!existing) throw new Error("TWITCH_CONNECTION_REQUIRED")
  if (
    existing.record.broadcasterId !== "155477801" ||
    existing.record.login.toLowerCase() !== "smokybanana03"
  ) {
    throw new Error("TWITCH_SMOKY_ACCOUNT_MISMATCH")
  }

  const parsed = smokyChannelMetadataSchema.parse(input)
  const payload: Record<string, unknown> = {}
  if (parsed.title !== undefined) payload.title = parsed.title
  if (parsed.tags !== undefined) {
    payload.tags = [...new Set(parsed.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 10)
  }
  if (parsed.broadcasterLanguage !== undefined) {
    payload.broadcaster_language = parsed.broadcasterLanguage
  }

  const url = new URL("https://api.twitch.tv/helix/channels")
  url.searchParams.set("broadcaster_id", existing.record.broadcasterId)
  const response = await twitchUserRequest(
    url,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    options,
    TWITCH_BROADCAST_SCOPE,
  )
  if (!response.ok) {
    throw new Error(`TWITCH_CHANNEL_UPDATE_FAILED:${response.status}`)
  }
  return {
    broadcasterId: existing.record.broadcasterId,
    login: existing.record.login,
    title: parsed.title ?? null,
    tags: (payload.tags as string[] | undefined) ?? null,
    broadcasterLanguage: parsed.broadcasterLanguage ?? null,
  }
}

export async function getTwitchClipDownloadUrls(
  clipIds: string[],
  options: TwitchOptions = {},
) {
  const existing = await loadConnection(options)
  if (!existing) throw new Error("TWITCH_CONNECTION_REQUIRED")
  const ids = Array.from(new Set(clipIds.map((value) => value.trim()).filter(Boolean))).slice(0, 10)
  if (!ids.length) return []
  const url = new URL("https://api.twitch.tv/helix/clips/downloads")
  url.searchParams.set("editor_id", existing.record.broadcasterId)
  url.searchParams.set("broadcaster_id", existing.record.broadcasterId)
  ids.forEach((id) => url.searchParams.append("clip_id", id))

  const response = await twitchUserRequest(url, { method: "GET" }, options)
  if (!response.ok) throw new Error(`TWITCH_CLIP_DOWNLOAD_FAILED:${response.status}`)
  const body = await parseJson(response) as {
    data?: Array<{
      clip_id?: string
      landscape_download_url?: string | null
      portrait_download_url?: string | null
    }>
  } | null
  return (body?.data ?? []).map((item) => ({
    clipId: item.clip_id ?? "",
    landscapeUrl: item.landscape_download_url ?? null,
    portraitUrl: item.portrait_download_url ?? null,
  })).filter((item) => item.clipId)
}

function parsePendingVodClips(raw: unknown): PendingTwitchVodClip[] {
  if (!raw) return []
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw
    const parsed = z.array(pendingVodClipSchema).safeParse(value)
    return parsed.success ? parsed.data.slice(0, MAX_PENDING_VOD_CLIPS) : []
  } catch {
    return []
  }
}

async function loadPendingVodClips(options: TwitchOptions = {}) {
  const redis = runtimeRedis(options)
  if (!redis) return [] as PendingTwitchVodClip[]
  return parsePendingVodClips(await redis.get<unknown>(VOD_CLIP_PENDING_KEY))
}

async function savePendingVodClips(
  pending: PendingTwitchVodClip[],
  options: TwitchOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) return false
  const normalized = pending
    .map((item) => pendingVodClipSchema.parse(item))
    .slice(0, MAX_PENDING_VOD_CLIPS)
  await redis.set(VOD_CLIP_PENDING_KEY, JSON.stringify(normalized), {
    ex: VOD_CLIP_PENDING_TTL_SECONDS,
  })
  return true
}

export async function listPendingTwitchVodClips(options: TwitchOptions = {}) {
  return loadPendingVodClips(options)
}

async function rememberPendingTwitchVodClip(
  pending: PendingTwitchVodClip,
  options: TwitchOptions = {},
) {
  const existing = await loadPendingVodClips(options)
  const next = [
    pendingVodClipSchema.parse(pending),
    ...existing.filter((item) => item.id !== pending.id),
  ].slice(0, MAX_PENDING_VOD_CLIPS)
  return savePendingVodClips(next, options)
}

export async function getTwitchClipsByIds(
  ids: string[],
  options: TwitchOptions = {},
): Promise<TwitchRecentClip[]> {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 100)
  if (!uniqueIds.length) return []

  const config = resolveTwitchConfig(options.env ?? process.env)
  if (!config) throw new Error("TWITCH_NOT_CONFIGURED")
  const token = await appAccessToken(options)
  const url = new URL("https://api.twitch.tv/helix/clips")
  uniqueIds.forEach((id) => url.searchParams.append("id", id))

  const response = await (options.fetcher ?? fetch)(url, {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": config.clientId },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`TWITCH_HELIX_FAILED:clips:${response.status}`)

  const body = await parseJson(response) as {
    data?: Array<{
      id?: string
      title?: string
      url?: string
      creator_name?: string
      view_count?: number
      created_at?: string
      video_id?: string
      game_id?: string
      thumbnail_url?: string
      duration?: number
      vod_offset?: number | null
    }>
  } | null

  return (body?.data ?? []).map((clip) => ({
    id: clip.id ?? "",
    title: clip.title ?? "",
    url: clip.url ?? "",
    creatorName: clip.creator_name ?? "",
    viewCount: clip.view_count ?? 0,
    createdAt: clip.created_at ?? "",
    videoId: clip.video_id ?? "",
    gameId: clip.game_id ?? "",
    thumbnailUrl: clip.thumbnail_url ?? "",
    duration: clip.duration ?? 0,
    vodOffset: clip.vod_offset ?? null,
  })).filter((clip) => clip.id)
}

export async function reconcilePendingTwitchVodClips(
  options: TwitchOptions = {},
) {
  const pending = await loadPendingVodClips(options)
  if (!pending.length) {
    return {
      materialized: [] as TwitchRecentClip[],
      failed: [] as PendingTwitchVodClip[],
      pending: [] as PendingTwitchVodClip[],
    }
  }

  const materialized = await getTwitchClipsByIds(pending.map((item) => item.id), options)
  const materializedIds = new Set(materialized.map((clip) => clip.id))
  const nowMs = (options.now ?? (() => new Date()))().getTime()
  const failed: PendingTwitchVodClip[] = []
  const stillPending: PendingTwitchVodClip[] = []

  for (const item of pending) {
    if (materializedIds.has(item.id)) continue
    const ageMs = Math.max(0, nowMs - Date.parse(item.requestedAt))
    if (ageMs >= VOD_CLIP_VERIFY_AFTER_MS) failed.push(item)
    else stillPending.push(item)
  }

  await savePendingVodClips(stillPending, options)
  return { materialized, failed, pending: stillPending }
}

export async function createTwitchClipFromVod(
  input: {
    vodId: string
    vodOffset: number
    duration: number
    title: string
  },
  options: TwitchOptions = {},
) {
  const existing = await loadConnection(options)
  if (!existing) throw new Error("TWITCH_CONNECTION_REQUIRED")
  const duration = Math.max(5, Math.min(60, Number(input.duration)))
  const vodOffset = Math.max(Math.ceil(duration), Math.trunc(input.vodOffset))
  const title = input.title.trim().slice(0, 100)
  if (!input.vodId.trim() || !title) throw new Error("TWITCH_CLIP_INPUT_INVALID")

  const url = new URL("https://api.twitch.tv/helix/videos/clips")
  url.searchParams.set("editor_id", existing.record.broadcasterId)
  url.searchParams.set("broadcaster_id", existing.record.broadcasterId)
  url.searchParams.set("vod_id", input.vodId.trim())
  url.searchParams.set("vod_offset", String(vodOffset))
  url.searchParams.set("duration", String(duration))
  url.searchParams.set("title", title)

  const response = await twitchUserRequest(url, { method: "POST" }, options)
  if (response.status !== 202) throw new Error(`TWITCH_VOD_CLIP_CREATE_FAILED:${response.status}`)
  const body = await parseJson(response) as { data?: Array<{ id?: string; edit_url?: string }> } | null
  const clip = body?.data?.[0]
  if (!clip?.id) throw new Error("TWITCH_VOD_CLIP_CREATE_FAILED")

  let tracked = false
  try {
    tracked = await rememberPendingTwitchVodClip({
      id: clip.id,
      vodId: input.vodId.trim(),
      vodOffset,
      duration,
      title,
      requestedAt: (options.now ?? (() => new Date()))().toISOString(),
    }, options)
  } catch {
    tracked = false
  }

  return { id: clip.id, editUrl: clip.edit_url ?? null, tracked }
}


export type TwitchRecentVod = {
  id: string
  streamId: string
  title: string
  url: string
  createdAt: string
  duration: string
  durationSeconds: number
}

export type TwitchRecentClip = TwitchPilotSummary["clips"][number]

export type TwitchRecentArchive = {
  startedAt: string
  endedAt: string
  vods: TwitchRecentVod[]
  clips: TwitchRecentClip[]
}

export function twitchDurationToSeconds(value: string) {
  const text = value.trim().toLowerCase()
  if (!text) return 0
  const hours = Number(text.match(/(\d+)h/)?.[1] ?? 0)
  const minutes = Number(text.match(/(\d+)m/)?.[1] ?? 0)
  const seconds = Number(text.match(/(\d+)s/)?.[1] ?? 0)
  return Math.max(0, hours * 3600 + minutes * 60 + seconds)
}

export async function getTwitchRecentArchive(
  hours = 24,
  options: TwitchOptions = {},
): Promise<TwitchRecentArchive> {
  const existing = await loadConnection(options)
  if (!existing) throw new Error("TWITCH_CONNECTION_REQUIRED")
  const boundedHours = Math.max(1, Math.min(48, Math.trunc(hours)))
  const now = (options.now ?? (() => new Date()))()
  const endedAt = now.toISOString()
  const startedAt = new Date(now.getTime() - boundedHours * 60 * 60 * 1000).toISOString()

  const [videosBody, clipsBody] = await Promise.all([
    helixGet("videos", {
      user_id: existing.record.broadcasterId,
      type: "archive",
      first: "100",
    }, options),
    helixGet("clips", {
      broadcaster_id: existing.record.broadcasterId,
      started_at: startedAt,
      ended_at: endedAt,
      first: "100",
    }, options),
  ])

  const rawVideos = (videosBody as {
    data?: Array<{
      id?: string
      stream_id?: string
      title?: string
      url?: string
      created_at?: string
      duration?: string
    }>
  } | null)?.data ?? []

  const vods = rawVideos
    .map((video) => {
      const createdAt = video.created_at ?? ""
      const duration = video.duration ?? ""
      return {
        id: video.id ?? "",
        streamId: video.stream_id ?? "",
        title: video.title ?? "",
        url: video.url ?? (video.id ? `https://www.twitch.tv/videos/${video.id}` : ""),
        createdAt,
        duration,
        durationSeconds: twitchDurationToSeconds(duration),
      }
    })
    .filter((video) =>
      Boolean(video.id) &&
      Boolean(video.createdAt) &&
      Date.parse(video.createdAt) >= Date.parse(startedAt),
    )

  const rawClips = (clipsBody as {
    data?: Array<{
      id?: string
      title?: string
      url?: string
      creator_name?: string
      view_count?: number
      created_at?: string
      video_id?: string
      game_id?: string
      thumbnail_url?: string
      duration?: number
      vod_offset?: number | null
    }>
  } | null)?.data ?? []

  const clips = rawClips.map((clip) => ({
    id: clip.id ?? "",
    title: clip.title ?? "",
    url: clip.url ?? "",
    creatorName: clip.creator_name ?? "",
    viewCount: clip.view_count ?? 0,
    createdAt: clip.created_at ?? "",
    videoId: clip.video_id ?? "",
    gameId: clip.game_id ?? "",
    thumbnailUrl: clip.thumbnail_url ?? "",
    duration: clip.duration ?? 0,
    vodOffset: clip.vod_offset ?? null,
  })).filter((clip) => clip.id)

  return { startedAt, endedAt, vods, clips }
}

export async function validateStoredTwitchConnection(options: TwitchOptions = {}) {
  const connection = await loadConnection(options)
  if (!connection) return { connected: false as const, connection: null }
  try {
    const validation = await validateUserToken(connection.secret.accessToken, options.fetcher ?? fetch)
    if (validation.user_id !== connection.record.broadcasterId) throw new Error("TWITCH_USER_MISMATCH")
    return { connected: true as const, connection: publicConnection(connection.record), validation }
  } catch {
    try {
      const refreshed = await refreshTwitchUserToken(options)
      return {
        connected: true as const,
        connection: publicConnection((await loadConnection(options))!.record),
        validation: refreshed.validation,
      }
    } catch {
      return { connected: false as const, connection: publicConnection(connection.record) }
    }
  }
}

async function latestVod(session: TwitchStreamSession, options: TwitchOptions) {
  try {
    const body = await helixGet("videos", {
      user_id: session.broadcasterId,
      type: "archive",
      first: "10",
    }, options) as {
      data?: Array<{ id?: string; stream_id?: string; title?: string; url?: string; duration?: string; created_at?: string }>
    }
    const videos = body?.data ?? []
    const exact = videos.find((video) => video.stream_id === session.streamId)
    const item = exact ?? videos[0]
    return item?.id
      ? {
          id: item.id,
          title: item.title ?? "",
          url: item.url ?? `https://www.twitch.tv/videos/${item.id}`,
          duration: item.duration ?? "",
          createdAt: item.created_at ?? "",
        }
      : null
  } catch {
    return null
  }
}

async function clipsForSession(session: TwitchStreamSession, endedAt: string, options: TwitchOptions) {
  try {
    const body = await helixGet("clips", {
      broadcaster_id: session.broadcasterId,
      started_at: session.startedAt,
      ended_at: endedAt,
      first: "100",
    }, options) as {
      data?: Array<{
        id?: string
        title?: string
        url?: string
        creator_name?: string
        view_count?: number
        created_at?: string
        video_id?: string
        game_id?: string
        thumbnail_url?: string
        duration?: number
        vod_offset?: number | null
      }>
    }
    return (body?.data ?? []).map((clip) => ({
      id: clip.id ?? "",
      title: clip.title ?? "",
      url: clip.url ?? "",
      creatorName: clip.creator_name ?? "",
      viewCount: clip.view_count ?? 0,
      createdAt: clip.created_at ?? "",
      videoId: clip.video_id ?? "",
      gameId: clip.game_id ?? "",
      thumbnailUrl: clip.thumbnail_url ?? "",
      duration: clip.duration ?? 0,
      vodOffset: clip.vod_offset ?? null,
    })).filter((clip) => clip.id)
  } catch {
    return []
  }
}

export function buildTwitchMetadataSummary(input: {
  session: TwitchStreamSession
  endedAt: string
  vod: TwitchPilotSummary["vod"]
  markers: TwitchPilotSummary["markers"]
  clips: TwitchPilotSummary["clips"]
  generatedAt?: string
}): TwitchPilotSummary {
  const started = Date.parse(input.session.startedAt)
  const ended = Date.parse(input.endedAt)
  const durationMinutes = Math.max(0, Math.round((ended - started) / 60000))
  const clipText = input.clips.length
    ? `${input.clips.length} Twitch clip${input.clips.length === 1 ? " was" : "s were"} created during the stream.`
    : "No Twitch clips were returned for this stream window."
  const markerText = input.markers.length
    ? `${input.markers.length} creator stream marker${input.markers.length === 1 ? " is" : "s are"} available as exact review points.`
    : "No creator stream markers were returned."
  return {
    broadcasterId: input.session.broadcasterId,
    broadcasterLogin: input.session.broadcasterLogin,
    broadcasterName: input.session.broadcasterName,
    streamId: input.session.streamId,
    startedAt: input.session.startedAt,
    endedAt: input.endedAt,
    durationMinutes,
    title: input.session.title,
    categoryName: input.session.categoryName,
    vod: input.vod,
    markers: input.markers,
    clips: input.clips,
    updateCount: input.session.updates.length,
    summary: `Twitch reports a ${durationMinutes}-minute stream${input.session.title ? ` titled “${input.session.title}”` : ""}${input.session.categoryName ? ` in ${input.session.categoryName}` : ""}. ${clipText} ${markerText} This summary is based on Twitch metadata, clips, and stream markers—not visual analysis of the gameplay.`,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceModel: "twitch-metadata",
  }
}

async function saveSession(session: TwitchStreamSession, redis: RedisLike) {
  await redis.set(SESSION_KEY, JSON.stringify(streamSessionSchema.parse(session)), { ex: SESSION_TTL_SECONDS })
}

async function loadSession(redis: RedisLike) {
  const raw = await redis.get<unknown>(SESSION_KEY)
  if (!raw) return null
  const parsed = streamSessionSchema.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw)
  return parsed.success ? parsed.data : null
}

async function handleOnline(event: Record<string, unknown>, redis: RedisLike, options: TwitchOptions) {
  const broadcasterId = String(event.broadcaster_user_id ?? "")
  const broadcasterLogin = String(event.broadcaster_user_login ?? "")
  const broadcasterName = String(event.broadcaster_user_name ?? broadcasterLogin)
  const streamId = String(event.id ?? "")
  const startedAt = String(event.started_at ?? "")
  if (!broadcasterId || !broadcasterLogin || !streamId || !startedAt) return
  const connection = await loadConnection(options)
  if (!connection || connection.record.broadcasterId !== broadcasterId) return
  const snapshot = await getChannelSnapshot(broadcasterId, options)
  await saveSession({
    broadcasterId,
    broadcasterLogin,
    broadcasterName,
    streamId,
    startedAt,
    endedAt: null,
    title: snapshot?.title ?? "",
    categoryId: snapshot?.categoryId ?? "",
    categoryName: snapshot?.categoryName ?? "",
    language: snapshot?.language ?? "",
    updates: [],
  }, redis)
  return streamId
}

async function handleChannelUpdate(event: Record<string, unknown>, redis: RedisLike) {
  const session = await loadSession(redis)
  if (!session || session.broadcasterId !== String(event.broadcaster_user_id ?? "")) return null
  const next = {
    ...session,
    title: String(event.title ?? session.title),
    categoryId: String(event.category_id ?? session.categoryId),
    categoryName: String(event.category_name ?? session.categoryName),
    language: String(event.language ?? session.language),
    updates: [
      ...session.updates,
      {
        at: new Date().toISOString(),
        title: String(event.title ?? session.title),
        categoryId: String(event.category_id ?? session.categoryId),
        categoryName: String(event.category_name ?? session.categoryName),
        language: String(event.language ?? session.language),
      },
    ].slice(-50),
  }
  await saveSession(next, redis)
  return session.streamId
}

async function handleOffline(event: Record<string, unknown>, redis: RedisLike, options: TwitchOptions) {
  const broadcasterId = String(event.broadcaster_user_id ?? "")
  const session = await loadSession(redis)
  if (!session || session.broadcasterId !== broadcasterId) return null
  const endedAt = new Date().toISOString()
  const vod = await latestVod(session, options)
  const [markers, clips] = await Promise.all([
    getMarkers(options, vod?.id),
    clipsForSession(session, endedAt, options),
  ])
  const summary = buildTwitchMetadataSummary({ session, endedAt, vod, markers, clips })
  const serialized = JSON.stringify(summary)
  await Promise.all([
    redis.set(SUMMARY_KEY, serialized, { ex: SUMMARY_TTL_SECONDS }),
    redis.set(`${SUMMARY_STREAM_PREFIX}${session.streamId}`, serialized, { ex: SUMMARY_TTL_SECONDS }),
  ])
  await saveSession({ ...session, endedAt }, redis)
  return session.streamId
}

export async function refreshTwitchPostStreamSummary(options: TwitchOptions = {}) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("TWITCH_STORE_UNAVAILABLE")
  const session = await loadSession(redis)
  if (!session?.endedAt) return null
  const vod = await latestVod(session, options)
  const [markers, clips] = await Promise.all([
    getMarkers(options, vod?.id),
    clipsForSession(session, session.endedAt, options),
  ])
  const summary = buildTwitchMetadataSummary({
    session,
    endedAt: session.endedAt,
    vod,
    markers,
    clips,
  })
  const serialized = JSON.stringify(summary)
  await Promise.all([
    redis.set(SUMMARY_KEY, serialized, { ex: SUMMARY_TTL_SECONDS }),
    redis.set(`${SUMMARY_STREAM_PREFIX}${session.streamId}`, serialized, { ex: SUMMARY_TTL_SECONDS }),
  ])
  return summary
}

export async function processTwitchEventSubNotification(
  rawBody: string,
  messageId: string,
  options: TwitchOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("TWITCH_STORE_UNAVAILABLE")
  if (!(await claimEventId(messageId, redis))) {
    return { duplicate: true as const, type: null, streamId: null }
  }

  try {
    const parsed = eventEnvelopeSchema.parse(JSON.parse(rawBody))
    const event = parsed.event ?? {}
    let streamId: string | null = null
    if (parsed.subscription.type === "stream.online") {
      streamId = (await handleOnline(event, redis, options)) ?? null
    }
    if (parsed.subscription.type === "channel.update") {
      streamId = (await handleChannelUpdate(event, redis)) ?? null
    }
    if (parsed.subscription.type === "stream.offline") {
      streamId = (await handleOffline(event, redis, options)) ?? null
    }
    await completeEventId(messageId, redis)
    return {
      duplicate: false as const,
      type: parsed.subscription.type,
      streamId,
    }
  } catch (error) {
    await releaseEventId(messageId, redis).catch(() => undefined)
    throw error
  }
}

export async function recordTwitchSubscriptionChallenge(rawBody: string, options: TwitchOptions = {}) {
  const redis = runtimeRedis(options)
  if (!redis) return
  const parsed = eventEnvelopeSchema.parse(JSON.parse(rawBody))
  await redis.set(SUBSCRIPTION_KEY, JSON.stringify({
    lastVerifiedSubscription: parsed.subscription,
    verifiedAt: new Date().toISOString(),
  }))
}

export async function recordTwitchSubscriptionRevocation(rawBody: string, options: TwitchOptions = {}) {
  const redis = runtimeRedis(options)
  if (!redis) return
  const parsed = eventEnvelopeSchema.parse(JSON.parse(rawBody))
  await redis.set(SUBSCRIPTION_KEY, JSON.stringify({
    revokedSubscription: parsed.subscription,
    revokedAt: new Date().toISOString(),
  }))
}

export async function getTwitchPilotStatus(options: TwitchOptions = {}) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  if (!isTwitchPilotConfigured(env) || !redis) {
    return { configured: false, connected: false, connection: null, subscription: null, session: null, summary: null }
  }
  const connectionState = await validateStoredTwitchConnection(options)
  const [subscription, sessionRaw, summaryRaw] = await Promise.all([
    redis.get<unknown>(SUBSCRIPTION_KEY),
    redis.get<unknown>(SESSION_KEY),
    redis.get<unknown>(SUMMARY_KEY),
  ])
  const parse = <T>(value: unknown): T | null => {
    if (!value) return null
    if (typeof value !== "string") return value as T
    try { return JSON.parse(value) as T } catch { return null }
  }
  return {
    configured: true,
    connected: connectionState.connected,
    connection: connectionState.connection,
    subscription: parse(subscription),
    session: parse(sessionRaw),
    summary: parse(summaryRaw),
  }
}

async function deleteSubscriptionsForBroadcaster(broadcasterId: string, options: TwitchOptions) {
  const env = options.env ?? process.env
  const config = resolveTwitchConfig(env)
  const fetcher = options.fetcher ?? fetch
  if (!config) return
  const token = await appAccessToken(options)
  const response = await fetcher("https://api.twitch.tv/helix/eventsub/subscriptions", {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": config.clientId },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return
  const body = await parseJson(response) as {
    data?: Array<{ id?: string; condition?: { broadcaster_user_id?: string }; transport?: { callback?: string } }>
  }
  const matches = (body?.data ?? []).filter(
    (item) => item.id && item.condition?.broadcaster_user_id === broadcasterId && item.transport?.callback === config.eventSubCallback,
  )
  await Promise.all(matches.map((item) => fetcher(
    `https://api.twitch.tv/helix/eventsub/subscriptions?id=${encodeURIComponent(item.id!)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Client-Id": config.clientId },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    },
  ).catch(() => null)))
}

export async function disconnectTwitchPilot(options: TwitchOptions = {}) {
  const env = options.env ?? process.env
  const config = resolveTwitchConfig(env)
  const redis = runtimeRedis(options)
  const existing = await loadConnection(options)
  if (!config || !redis || !existing) return { alreadyDisconnected: true }
  await deleteSubscriptionsForBroadcaster(existing.record.broadcasterId, options).catch(() => undefined)
  await (options.fetcher ?? fetch)("https://id.twitch.tv/oauth2/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, token: existing.secret.accessToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null)
  await redis.del(CONNECTION_KEY, SESSION_KEY, SUBSCRIPTION_KEY)
  return { alreadyDisconnected: false }
}
