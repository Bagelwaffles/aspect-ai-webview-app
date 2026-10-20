import IORedis from "ioredis"
import { Redis } from "@upstash/redis"

export interface OwnerRedis {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string, options?: { ex?: number; nx?: boolean }): Promise<unknown>
  eval(script: string, keys: string[], args: string[]): Promise<unknown>
}

/** Only owner Gmail and its scheduled-task store may select this transport. */
export function aivenPreviewOptions(env: NodeJS.ProcessEnv) {
  if (env.VERCEL_ENV !== "preview" || env.AMS_OWNER_PREVIEW_STORE !== "aiven") throw new Error("OWNER_STORE_PREVIEW_ONLY")
  if (env.AMS_GMAIL_SEND_ENABLED === "true" || env.AMS_GMAIL_AUTOREPLY_ENABLED === "true" || env.AMS_SCHEDULED_TASKS_ENABLED === "true") throw new Error("OWNER_STORE_AUTOMATION_MUST_BE_OFF")
  const uri = env.AMS_OWNER_VALKEY_URL
  if (!uri) throw new Error("OWNER_STORE_CONFIG_REQUIRED")
  let url: URL
  try { url = new URL(uri) } catch { throw new Error("OWNER_STORE_CONFIG_INVALID") }
  if (!["rediss:", "valkeys:"].includes(url.protocol) || !url.hostname.endsWith(".aivencloud.com") || !url.password || !url.port || url.search || url.hash || !["", "/", "/0"].includes(url.pathname)) throw new Error("OWNER_STORE_CONFIG_INVALID")
  return {
    host: url.hostname, port: Number(url.port), username: decodeURIComponent(url.username) || "default", password: decodeURIComponent(url.password),
    tls: { rejectUnauthorized: true, servername: url.hostname, minVersion: "TLSv1.2" as const, ...(env.AMS_OWNER_VALKEY_CA ? { ca: env.AMS_OWNER_VALKEY_CA } : {}) },
    lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null,
    autoResendUnfulfilledCommands: false, connectTimeout: 8000, commandTimeout: 10000,
  }
}

export type ValkeyTransport = Pick<IORedis, "get" | "set" | "eval" | "connect" | "on" | "disconnect">
export function adaptOwnerValkey(client: ValkeyTransport): OwnerRedis {
  let connection: Promise<unknown> | undefined
  // Never log driver errors: they can contain connection details. Never replay
  // ambiguous writes; a failed connection needs a fresh adapter instance.
  client.on("error", () => {})
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { await (connection ??= client.connect()); return await operation() }
    catch { throw new Error("OWNER_STORE_UNAVAILABLE") }
  }
  return {
    get: <T>(key: string) => run(async () => {
      const raw = await client.get(key)
      if (raw === null) return null
      // Match Upstash automatic deserialization; Lua still sees raw bytes.
      try { return JSON.parse(raw) as T } catch { return raw as T }
    }),
    set: (key, value, options) => run(async () => {
      if (options?.ex !== undefined) {
        if (!Number.isSafeInteger(options.ex) || options.ex <= 0) throw new Error("INVALID_TTL")
        return options.nx ? client.set(key, value, "EX", options.ex, "NX") : client.set(key, value, "EX", options.ex)
      }
      return options?.nx ? client.set(key, value, "NX") : client.set(key, value)
    }),
    eval: (script, keys, args) => run(() => client.eval(script, keys.length, ...keys, ...args)),
  }
}

let cached: { identity: string; redis: OwnerRedis } | undefined
export function createOwnerRedis(env: NodeJS.ProcessEnv = process.env): OwnerRedis | null {
  if (env.AMS_OWNER_PREVIEW_STORE === "aiven") {
    const options = aivenPreviewOptions(env)
    const identity = JSON.stringify(options)
    if (cached?.identity === identity) return cached.redis
    const redis = adaptOwnerValkey(new IORedis(options))
    cached = { identity, redis }
    return redis
  }
  if (env.AMS_OWNER_PREVIEW_STORE) throw new Error("OWNER_STORE_CONFIG_INVALID")
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN
  return url && token ? new Redis({ url, token }) : null
}
