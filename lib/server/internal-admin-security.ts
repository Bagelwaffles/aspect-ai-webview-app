import { createHash, scrypt, webcrypto } from "node:crypto"

import { Redis } from "@upstash/redis"

const PASSWORD_HASH_PREFIX = "scrypt-v1"
const PASSWORD_SALT_BYTES = 16
const PASSWORD_HASH_BYTES = 32
const SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
} as const

const LOGIN_ATTEMPT_LIMIT = 5
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000

const DISTRIBUTED_RESERVE_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
  end

  local ttl = redis.call('PTTL', KEYS[1])
  if ttl < 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end

  return {tostring(count), tostring(ttl)}
`

const DISTRIBUTED_RELEASE_SCRIPT = `
  local current = redis.call('GET', KEYS[1])
  if not current then
    return 0
  end

  local count = redis.call('DECR', KEYS[1])
  if count <= 0 then
    redis.call('DEL', KEYS[1])
  end

  return 1
`

export type AdminLoginThrottleStorageResult = {
  count: number
  resetInMs: number
}

export interface AdminLoginThrottleAdapter {
  reserve(key: string, windowMs: number): Promise<AdminLoginThrottleStorageResult>
  release(key: string): Promise<void>
}

export type AdminLoginThrottleResult = {
  allowed: boolean
  available: boolean
  retryAfterSeconds: number
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ""
  value.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    return encodeBase64Url(bytes) === value ? bytes : null
  } catch {
    return null
  }
}

function derivePasswordHash(password: string, salt: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_HASH_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }

      const copy = new Uint8Array(derivedKey.length)
      copy.set(derivedKey)
      resolve(copy)
    })
  })
}

function parsePasswordHash(
  encodedHash: string,
): { saltPart: string; digest: Uint8Array<ArrayBuffer> } | null {
  const [prefix, saltPart, digestPart, extra] = encodedHash.split("$")
  if (prefix !== PASSWORD_HASH_PREFIX || !saltPart || !digestPart || extra !== undefined) {
    return null
  }

  const salt = decodeBase64Url(saltPart)
  const digest = decodeBase64Url(digestPart)
  if (!salt || salt.length < PASSWORD_SALT_BYTES || salt.length > 64) return null
  if (!digest || digest.length !== PASSWORD_HASH_BYTES) return null

  return { saltPart, digest }
}

function randomPasswordSalt(): Uint8Array<ArrayBuffer> {
  return webcrypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES))
}

function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false

  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index]
  }
  return mismatch === 0
}

export function isSupportedInternalAdminPasswordHash(encodedHash: string): boolean {
  return parsePasswordHash(encodedHash.trim()) !== null
}

export async function createInternalAdminPasswordHash(
  password: string,
  salt: Uint8Array = randomPasswordSalt(),
): Promise<string> {
  if (!password || password.length > 256) {
    throw new Error("Internal admin password must contain between 1 and 256 characters")
  }

  if (salt.length < PASSWORD_SALT_BYTES || salt.length > 64) {
    throw new Error("Internal admin password salt must contain between 16 and 64 bytes")
  }

  const saltPart = encodeBase64Url(salt)
  const digest = await derivePasswordHash(password, saltPart)
  return `${PASSWORD_HASH_PREFIX}$${saltPart}$${encodeBase64Url(digest)}`
}

export async function verifyInternalAdminPassword(password: string, encodedHash: string): Promise<boolean> {
  if (!password || password.length > 256) return false

  const parsed = parsePasswordHash(encodedHash.trim())
  if (!parsed) return false

  const candidate = await derivePasswordHash(password, parsed.saltPart)
  return constantTimeBytesEqual(candidate, parsed.digest)
}

function parseStorageResult(raw: unknown): AdminLoginThrottleStorageResult {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error("Invalid admin login throttle response")
  }

  const count = Number(raw[0])
  const resetInMs = Number(raw[1])
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(resetInMs) || resetInMs < 1) {
    throw new Error("Invalid admin login throttle response")
  }

  return { count, resetInMs }
}

export class UpstashAdminLoginThrottleAdapter implements AdminLoginThrottleAdapter {
  constructor(private readonly redis: Pick<Redis, "eval">) {}

  async reserve(key: string, windowMs: number): Promise<AdminLoginThrottleStorageResult> {
    const raw = await this.redis.eval(DISTRIBUTED_RESERVE_SCRIPT, [key], [windowMs])
    return parseStorageResult(raw)
  }

  async release(key: string): Promise<void> {
    await this.redis.eval(DISTRIBUTED_RELEASE_SCRIPT, [key], [])
  }
}

export class DistributedAdminLoginThrottle {
  constructor(
    private readonly adapter: AdminLoginThrottleAdapter,
    private readonly limit = LOGIN_ATTEMPT_LIMIT,
    private readonly windowMs = LOGIN_ATTEMPT_WINDOW_MS,
  ) {}

  async reserve(identity: string): Promise<AdminLoginThrottleResult> {
    try {
      const result = await this.adapter.reserve(adminLoginStorageKey(identity), this.windowMs)
      return {
        allowed: result.count <= this.limit,
        available: true,
        retryAfterSeconds: Math.max(1, Math.ceil(result.resetInMs / 1000)),
      }
    } catch {
      return {
        allowed: false,
        available: false,
        retryAfterSeconds: Math.max(1, Math.ceil(this.windowMs / 1000)),
      }
    }
  }

  async release(identity: string): Promise<boolean> {
    try {
      await this.adapter.release(adminLoginStorageKey(identity))
      return true
    } catch {
      return false
    }
  }
}

function adminLoginStorageKey(identity: string): string {
  const digest = createHash("sha256").update(identity).digest("hex")
  return `ams:rate-limit:admin-login:${digest}`
}

function firstHeaderValue(value: string | null): string {
  return value?.split(",", 1)[0]?.trim().slice(0, 128) || "unknown"
}

export function internalAdminLoginIdentity(request: Pick<Request, "headers">): string {
  return firstHeaderValue(
    request.headers.get("x-vercel-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for"),
  )
}

export function createInternalAdminLoginThrottle(): DistributedAdminLoginThrottle | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) return null

  return new DistributedAdminLoginThrottle(
    new UpstashAdminLoginThrottleAdapter(new Redis({ url, token })),
  )
}
