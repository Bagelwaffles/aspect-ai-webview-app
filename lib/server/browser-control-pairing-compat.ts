import { createHash, randomBytes, randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"

const PREFIX = "ams:browser-control:v1"
const PRIMARY_WORKER_KEY = `${PREFIX}:primary-worker`
const AUDIT_KEY = `${PREFIX}:audit`

function getRedis(): Redis {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) throw new Error("BROWSER_CONTROL_STORAGE_UNAVAILABLE")
  return new Redis({ url, token })
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function normalizePairingCode(value: string) {
  return value.trim().toUpperCase()
}

function pairingKey(code: string) {
  return `${PREFIX}:pair:${sha256(normalizePairingCode(code))}`
}

function workerKey(id: string) {
  return `${PREFIX}:worker:${id}`
}

function workerTokenKey(id: string) {
  return `${PREFIX}:worker-token:${id}`
}

export async function pairBrowserWorkerCompat(input: {
  code: string
  name?: string
  version?: string
  platform?: string
  browser?: string
}): Promise<{ workerId: string; token: string }> {
  const redis = getRedis()
  const key = pairingKey(input.code)

  // @upstash/redis JSON-deserializes values by default. A sentinel written as
  // the string "1" can therefore be returned as the number 1. Accept both
  // representations while preserving one-time use and the existing TTL.
  const pairing = await redis.get<string | number>(key)
  if (pairing !== "1" && pairing !== 1) throw new Error("INVALID_OR_EXPIRED_PAIRING_CODE")
  await redis.del(key)

  const workerId = randomUUID()
  const token = randomBytes(32).toString("base64url")
  const now = new Date().toISOString()
  const worker = {
    id: workerId,
    name: input.name?.trim().slice(0, 100) || "AMS Windows Browser Worker",
    version: input.version?.trim().slice(0, 40) || "1.0.0",
    platform: input.platform?.trim().slice(0, 100) || "unknown",
    browser: input.browser?.trim().slice(0, 100) || "Microsoft Edge",
    pairedAt: now,
    lastSeenAt: now,
    currentJobId: null,
  }

  await Promise.all([
    redis.set(workerTokenKey(workerId), sha256(token)),
    redis.set(workerKey(workerId), worker),
    redis.set(PRIMARY_WORKER_KEY, workerId),
  ])
  await redis.lpush(AUDIT_KEY, {
    at: now,
    type: "worker.paired",
    detail: worker.name,
    workerId,
  })
  await redis.ltrim(AUDIT_KEY, 0, 99)

  return { workerId, token }
}
