import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createSecretKey,
  randomBytes,
  type KeyObject,
} from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

export const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload" as const
export const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly" as const
export const YOUTUBE_FORCE_SSL_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl" as const
export const SMOKYBANANA03_YOUTUBE_CHANNEL_ID = "UCPbMNjvwKOtuFX-1rAtCJSg" as const

const CONNECTION_KEY = "ams:youtube-owner:v1:connection"

type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string): Promise<unknown>
  del?(...keys: string[]): Promise<unknown>
}

type Options = {
  env?: NodeJS.ProcessEnv
  redis?: RedisLike | null
  fetcher?: typeof fetch
  now?: () => Date
}

const encryptedConnectionSchema = z.object({
  channelId: z.string().regex(/^UC[A-Za-z0-9_-]{20,40}$/u),
  channelTitle: z.string().min(1).max(200),
  scopes: z.array(z.string().min(1).max(300)).min(2).max(20),
  connectedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  cipherText: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
}).strict()

const secretSchema = z.object({
  refreshToken: z.string().min(20).max(10_000),
}).strict()

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function resolveRedis(env: NodeJS.ProcessEnv): RedisLike | null {
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN)
  return url && token ? new Redis({ url, token }) : null
}

function runtimeRedis(options: Options) {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) return options.redis ?? null
  return resolveRedis(options.env ?? process.env)
}

export function resolveYouTubeOAuthClient(env: NodeJS.ProcessEnv = process.env) {
  const clientId = clean(env.AMS_YOUTUBE_CLIENT_ID) ?? clean(env.GOOGLE_CLIENT_ID)
  const clientSecret = clean(env.AMS_YOUTUBE_CLIENT_SECRET) ?? clean(env.GOOGLE_CLIENT_SECRET)
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

function encryptionKey(env: NodeJS.ProcessEnv): KeyObject | null {
  const dedicated = clean(env.AMS_CONNECTION_ENCRYPTION_KEY)
  if (dedicated) {
    try {
      const decoded = Buffer.from(dedicated, "base64")
      if (decoded.length === 32) return createSecretKey(Uint8Array.from(decoded))
    } catch {
      // Fall through to a domain-separated key derived from NEXTAUTH_SECRET.
    }
  }

  const nextAuthSecret = clean(env.NEXTAUTH_SECRET)
  if (!nextAuthSecret) return null
  const derived = createHash("sha256")
    .update("ams-youtube-owner-v1\u0000")
    .update(nextAuthSecret)
    .digest()
  return createSecretKey(Uint8Array.from(derived))
}

function normalizeScopes(value: string | string[]) {
  const raw = Array.isArray(value) ? value : value.split(/\s+/u)
  return [...new Set(raw.map((scope) => scope.trim()).filter(Boolean))].sort()
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
    channelId: record.channelId,
    channelTitle: record.channelTitle,
    scopes: record.scopes,
    connectedAt: record.connectedAt,
    updatedAt: record.updatedAt,
  }
}

async function loadConnection(options: Options = {}) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  const key = encryptionKey(env)
  if (!redis || !key) throw new Error("YOUTUBE_CONNECTION_VAULT_UNAVAILABLE")

  const raw = await redis.get<unknown>(CONNECTION_KEY)
  if (!raw) return null
  const parsed = encryptedConnectionSchema.safeParse(
    typeof raw === "string" ? JSON.parse(raw) : raw,
  )
  if (!parsed.success) return null

  return {
    record: parsed.data,
    secret: decryptSecret(parsed.data, key),
  }
}

async function refreshAccessToken(
  refreshToken: string,
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
) {
  const client = resolveYouTubeOAuthClient(env)
  if (!client) throw new Error("YOUTUBE_OAUTH_CLIENT_NOT_CONFIGURED")

  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })

  const json = (await response.json().catch(() => null)) as { access_token?: unknown } | null
  if (!response.ok) throw new Error(`YOUTUBE_OAUTH_HTTP_${response.status}`)
  const token = typeof json?.access_token === "string" ? json.access_token.trim() : ""
  if (!token) throw new Error("YOUTUBE_OAUTH_ACCESS_TOKEN_MISSING")
  return token
}

async function verifySmokyBananaChannel(accessToken: string, fetcher: typeof fetch) {
  const response = await fetcher(
    "https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet&mine=true&maxResults=50",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  )

  const json = (await response.json().catch(() => null)) as
    | { items?: Array<{ id?: unknown; snippet?: { title?: unknown } }> }
    | null

  if (!response.ok) throw new Error(`YOUTUBE_CHANNEL_HTTP_${response.status}`)

  const matched = (json?.items ?? []).find(
    (item) => item.id === SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
  )
  if (!matched) throw new Error("YOUTUBE_CHANNEL_MISMATCH")

  return {
    channelId: SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
    channelTitle:
      typeof matched.snippet?.title === "string" && matched.snippet.title.trim()
        ? matched.snippet.title.trim().slice(0, 200)
        : "SmokyBanana03",
  }
}

export function isYouTubeOwnerOAuthConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(
    resolveYouTubeOAuthClient(env) &&
      resolveRedis(env) &&
      encryptionKey(env) &&
      clean(env.AMS_OWNER_EMAIL),
  )
}

export async function storeYouTubeOwnerConnectionFromGoogle(
  input: {
    email: string
    refreshToken: string
    accessToken?: string | null
    scopes: string | string[]
  },
  options: Options = {},
) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  const key = encryptionKey(env)
  const fetcher = options.fetcher ?? fetch
  const ownerEmail = clean(env.AMS_OWNER_EMAIL)?.toLowerCase()

  if (!ownerEmail || input.email.trim().toLowerCase() !== ownerEmail) {
    throw new Error("YOUTUBE_OWNER_REQUIRED")
  }
  if (!redis || !key || !resolveYouTubeOAuthClient(env)) {
    throw new Error("YOUTUBE_OWNER_OAUTH_NOT_CONFIGURED")
  }

  const scopes = normalizeScopes(input.scopes)
  if (!scopes.includes(YOUTUBE_UPLOAD_SCOPE) || !scopes.includes(YOUTUBE_READONLY_SCOPE)) {
    throw new Error("YOUTUBE_REQUIRED_SCOPES_MISSING")
  }

  const refreshToken = input.refreshToken.trim()
  if (refreshToken.length < 20) throw new Error("YOUTUBE_REFRESH_TOKEN_REQUIRED")

  const accessToken =
    input.accessToken?.trim() ||
    await refreshAccessToken(refreshToken, env, fetcher)

  const channel = await verifySmokyBananaChannel(accessToken, fetcher)
  const now = (options.now ?? (() => new Date()))()
  const record = encryptedConnectionSchema.parse({
    ...channel,
    scopes,
    connectedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...encryptSecret({ refreshToken }, key),
  })

  await redis.set(CONNECTION_KEY, JSON.stringify(record))
  return publicConnection(record)
}

export async function getYouTubeOwnerConnectionStatus(options: Options = {}) {
  try {
    const loaded = await loadConnection(options)
    if (!loaded) {
      return {
        oauthConfigured: isYouTubeOwnerOAuthConfigured(options.env ?? process.env),
        connected: false,
        connection: null,
      }
    }
    const connected = loaded.record.channelId === SMOKYBANANA03_YOUTUBE_CHANNEL_ID
    return {
      oauthConfigured: isYouTubeOwnerOAuthConfigured(options.env ?? process.env),
      connected,
      connection: connected ? publicConnection(loaded.record) : null,
    }
  } catch {
    return {
      oauthConfigured: false,
      connected: false,
      connection: null,
    }
  }
}

export async function getStoredYouTubeOwnerCredential(options: Options = {}) {
  const loaded = await loadConnection(options)
  if (!loaded) return null
  if (loaded.record.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID) return null

  return {
    refreshToken: loaded.secret.refreshToken,
    channelId: loaded.record.channelId,
    scopes: loaded.record.scopes,
  }
}

export async function disconnectYouTubeOwnerConnection(options: Options = {}) {
  const redis = runtimeRedis(options)
  if (!redis?.del) throw new Error("YOUTUBE_CONNECTION_VAULT_UNAVAILABLE")
  await redis.del(CONNECTION_KEY)
}
