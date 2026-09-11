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

import { isStableCustomerSubject } from "@/lib/auth"

const CONNECTION_PREFIX = "ams:customer-connections:v1"

export const customerConnectionProviderSchema = z.enum([
  "google-drive",
  "youtube",
  "facebook",
  "instagram",
  "linkedin",
  "shopify",
  "wordpress",
  "slack",
  "google-business-profile",
])

export type CustomerConnectionProvider = z.infer<typeof customerConnectionProviderSchema>

const encryptedPayloadSchema = z.object({
  accessToken: z.string().min(1).max(20_000),
  refreshToken: z.string().max(20_000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

const storedConnectionSchema = z.object({
  provider: customerConnectionProviderSchema,
  accountLabel: z.string().trim().max(240).default(""),
  scopes: z.array(z.string().trim().min(1).max(300)).max(100),
  status: z.enum(["active", "expired", "error"]),
  connectedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  cipherText: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
})

type StoredConnection = z.infer<typeof storedConnectionSchema>

export type PublicCustomerConnection = Pick<
  StoredConnection,
  "provider" | "accountLabel" | "scopes" | "status" | "connectedAt" | "updatedAt"
>

type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string): Promise<unknown>
  del(key: string): Promise<unknown>
}

type Options = {
  redis?: RedisLike | null
  env?: NodeJS.ProcessEnv
  now?: () => Date
}

function trimmed(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function resolveRedis(env: NodeJS.ProcessEnv): RedisLike | null {
  const url = trimmed(env.UPSTASH_REDIS_REST_URL) ?? trimmed(env.KV_REST_API_URL)
  const token = trimmed(env.UPSTASH_REDIS_REST_TOKEN) ?? trimmed(env.KV_REST_API_TOKEN)
  return url && token ? new Redis({ url, token }) : null
}

function runtimeRedis(options: Options) {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) return options.redis ?? null
  return resolveRedis(options.env ?? process.env)
}

export function resolveConnectionEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): KeyObject | null {
  const raw = trimmed(env.AMS_CONNECTION_ENCRYPTION_KEY)
  if (!raw) return null

  try {
    const decoded = Buffer.from(raw, "base64")
    if (decoded.length !== 32) return null
    return createSecretKey(Uint8Array.from(decoded))
  } catch {
    return null
  }
}

export function isConnectionVaultConfigured(env: NodeJS.ProcessEnv = process.env) {
  return resolveConnectionEncryptionKey(env) !== null && resolveRedis(env) !== null
}

function subjectHash(subject: string) {
  if (!isStableCustomerSubject(subject)) throw new Error("CONNECTION_INVALID_SUBJECT")
  return createHash("sha256").update(subject).digest("hex")
}

function connectionKey(subject: string, provider: CustomerConnectionProvider) {
  return `${CONNECTION_PREFIX}:${subjectHash(subject)}:${provider}`
}

function parseStored(raw: unknown): StoredConnection | null {
  if (raw === null || raw === undefined) return null
  let candidate = raw
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw)
    } catch {
      return null
    }
  }
  const parsed = storedConnectionSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

function encryptPayload(payload: z.infer<typeof encryptedPayloadSchema>, key: KeyObject) {
  const iv = Uint8Array.from(randomBytes(12))
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const plain = JSON.stringify(encryptedPayloadSchema.parse(payload))
  const cipherText = cipher.update(plain, "utf8", "hex") + cipher.final("hex")
  return {
    cipherText,
    iv: Buffer.from(iv).toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  }
}

function decryptPayload(record: StoredConnection, key: KeyObject) {
  const iv = Uint8Array.from(Buffer.from(record.iv, "base64"))
  const authTag = Uint8Array.from(Buffer.from(record.authTag, "base64"))
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  const decrypted =
    decipher.update(record.cipherText, "hex", "utf8") + decipher.final("utf8")
  return encryptedPayloadSchema.parse(JSON.parse(decrypted))
}

export async function saveCustomerConnection(
  subject: string,
  input: {
    provider: CustomerConnectionProvider
    accountLabel?: string
    scopes: string[]
    status?: "active" | "expired" | "error"
    accessToken: string
    refreshToken?: string | null
    expiresAt?: string | null
  },
  options: Options = {},
): Promise<PublicCustomerConnection> {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  const key = resolveConnectionEncryptionKey(env)
  if (!redis || !key) throw new Error("CONNECTION_VAULT_NOT_CONFIGURED")

  const provider = customerConnectionProviderSchema.parse(input.provider)
  const now = (options.now ?? (() => new Date()))().toISOString()
  const existing = parseStored(await redis.get<unknown>(connectionKey(subject, provider)))
  const encrypted = encryptPayload(
    {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken ?? null,
      expiresAt: input.expiresAt ?? null,
    },
    key,
  )

  const record = storedConnectionSchema.parse({
    provider,
    accountLabel: input.accountLabel ?? "",
    scopes: [...new Set(input.scopes.map((scope) => scope.trim()).filter(Boolean))],
    status: input.status ?? "active",
    connectedAt: existing?.connectedAt ?? now,
    updatedAt: now,
    ...encrypted,
  })

  await redis.set(connectionKey(subject, provider), JSON.stringify(record))
  return toPublic(record)
}

export async function getCustomerConnectionSecret(
  subject: string,
  provider: CustomerConnectionProvider,
  options: Options = {},
) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  const key = resolveConnectionEncryptionKey(env)
  if (!redis || !key) throw new Error("CONNECTION_VAULT_NOT_CONFIGURED")

  const record = parseStored(await redis.get<unknown>(connectionKey(subject, provider)))
  if (!record) return null
  return { connection: toPublic(record), secret: decryptPayload(record, key) }
}

export async function listCustomerConnections(subject: string, options: Options = {}) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("CONNECTION_VAULT_NOT_CONFIGURED")

  const results: PublicCustomerConnection[] = []
  for (const provider of customerConnectionProviderSchema.options) {
    const record = parseStored(await redis.get<unknown>(connectionKey(subject, provider)))
    if (record) results.push(toPublic(record))
  }
  return results
}

export async function disconnectCustomerConnection(
  subject: string,
  provider: CustomerConnectionProvider,
  options: Options = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("CONNECTION_VAULT_NOT_CONFIGURED")
  await redis.del(connectionKey(subject, customerConnectionProviderSchema.parse(provider)))
}

function toPublic(record: StoredConnection): PublicCustomerConnection {
  return {
    provider: record.provider,
    accountLabel: record.accountLabel,
    scopes: record.scopes,
    status: record.status,
    connectedAt: record.connectedAt,
    updatedAt: record.updatedAt,
  }
}
