import { createHash, randomBytes, randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"
import type { NextRequest } from "next/server"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"
import {
  riskForBrowserAction,
  type BrowserJobInput,
  type BrowserRisk,
} from "@/lib/browser-control-policy"

const PREFIX = "ams:browser-control:v1"
const PRIMARY_WORKER_KEY = `${PREFIX}:primary-worker`
const QUEUE_KEY = `${PREFIX}:queue`
const RECENT_JOBS_KEY = `${PREFIX}:recent-jobs`
const AUDIT_KEY = `${PREFIX}:audit`
const KILL_SWITCH_KEY = `${PREFIX}:kill-switch`
const PAIRING_TTL_SECONDS = 10 * 60
const CAPTURE_TTL_SECONDS = 24 * 60 * 60
const ONLINE_WINDOW_MS = 45_000
const JOB_LEASE_MS = 2 * 60_000
const JOB_TTL_SECONDS = 7 * 24 * 60 * 60
const MAX_CAPTURE_BASE64 = 850_000
let redisForTests: Redis | null = null

export type BrowserJobStatus =
  | "awaiting_approval"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "owner_action_required"

export type BrowserWorkerRecord = {
  id: string
  name: string
  version: string
  platform: string
  browser: string
  pairedAt: string
  lastSeenAt: string
  currentJobId: string | null
}

export type BrowserJobResult = {
  title?: string
  finalUrl?: string
  text?: string
  captureAvailable?: boolean
  captureSha256?: string
  durationMs?: number
  ownerAction?: BrowserOwnerAction
}

export type BrowserOwnerAction =
  | "login_required"
  | "mfa_required"
  | "captcha_required"
  | "consent_required"
  | "security_check_required"

export type BrowserJob = BrowserJobInput & {
  id: string
  risk: BrowserRisk
  status: BrowserJobStatus
  createdAt: string
  approvedAt?: string
  claimedAt?: string
  leaseExpiresAt?: string
  completedAt?: string
  claimedBy?: string
  attemptCount?: number
  idempotencyKey?: string
  result?: BrowserJobResult
  error?: string
}

export type BrowserAuditEvent = {
  at: string
  type: string
  detail: string
  jobId?: string
  workerId?: string
}

export type BrowserControlSnapshot = {
  configured: boolean
  killSwitch: boolean
  worker: (BrowserWorkerRecord & { online: boolean; ageMs: number }) | null
  jobs: BrowserJob[]
  audit: BrowserAuditEvent[]
}

export function __setBrowserControlRedisForTests(redis: Redis | null) {
  redisForTests = redis
}

function getRedis(): Redis {
  if (redisForTests) return redisForTests
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) throw new Error("BROWSER_CONTROL_STORAGE_UNAVAILABLE")
  return new Redis({ url, token })
}

function jobKey(id: string) {
  return `${PREFIX}:job:${id}`
}

function workerKey(id: string) {
  return `${PREFIX}:worker:${id}`
}

function workerTokenKey(id: string) {
  return `${PREFIX}:worker-token:${id}`
}

function pairingKey(code: string) {
  return `${PREFIX}:pair:${sha256(normalizePairingCode(code))}`
}

function captureKey(jobId: string) {
  return `${PREFIX}:capture:${jobId}`
}

function idempotencyKey(value: string) {
  return `${PREFIX}:idempotency:${sha256(value)}`
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function normalizePairingCode(value: string) {
  return value.trim().toUpperCase()
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

async function putJob(redis: Redis, job: BrowserJob) {
  await redis.set(jobKey(job.id), job, { ex: JOB_TTL_SECONDS })
}

async function getJob(redis: Redis, id: string): Promise<BrowserJob | null> {
  return (await redis.get<BrowserJob>(jobKey(id))) ?? null
}

async function audit(redis: Redis, event: BrowserAuditEvent) {
  await redis.lpush(AUDIT_KEY, event)
  await redis.ltrim(AUDIT_KEY, 0, 99)
}

async function rememberJob(redis: Redis, id: string) {
  await redis.lpush(RECENT_JOBS_KEY, id)
  await redis.ltrim(RECENT_JOBS_KEY, 0, 49)
}

function isLeaseExpired(job: BrowserJob, now = Date.now()) {
  return job.status === "running" && (!job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) <= now)
}

async function recoverStaleRunningJobs(redis: Redis) {
  const ids = await redis.lrange<string>(RECENT_JOBS_KEY, 0, 49)
  const now = Date.now()
  for (const id of ids) {
    const job = await getJob(redis, id)
    if (!job || !isLeaseExpired(job, now)) continue
    const updated: BrowserJob = {
      ...job,
      status: "queued",
      claimedAt: undefined,
      claimedBy: undefined,
      leaseExpiresAt: undefined,
      error: "Worker lease expired before result was reported; job returned to queue.",
    }
    await putJob(redis, updated)
    await redis.rpush(QUEUE_KEY, id)
    await audit(redis, {
      at: new Date().toISOString(),
      type: "job.recovered",
      detail: "Expired worker lease returned job to queue",
      jobId: id,
      workerId: job.claimedBy,
    })
  }
}

export async function browserAdminAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.INTERNAL_ADMIN_SECRET?.trim()
  if (!secret) return false
  const cookie = request.cookies.get("ams_internal_admin_access")?.value
  return Boolean(await verifyInternalAdminCookie(cookie, secret))
}

export async function createBrowserPairingCode(): Promise<{ code: string; expiresInSeconds: number }> {
  const redis = getRedis()
  const raw = randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12)
  const code = `AMS-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
  await redis.set(pairingKey(code), "1", { ex: PAIRING_TTL_SECONDS })
  await audit(redis, { at: new Date().toISOString(), type: "pairing.created", detail: "One-time worker pairing code created" })
  return { code, expiresInSeconds: PAIRING_TTL_SECONDS }
}

export async function pairBrowserWorker(input: {
  code: string
  name?: string
  version?: string
  platform?: string
  browser?: string
}): Promise<{ workerId: string; token: string }> {
  const redis = getRedis()
  const key = pairingKey(input.code)
  const pairing = await redis.get<string | number>(key)
  if (pairing !== "1" && pairing !== 1) throw new Error("INVALID_OR_EXPIRED_PAIRING_CODE")
  await redis.del(key)

  const workerId = randomUUID()
  const token = randomBytes(32).toString("base64url")
  const now = new Date().toISOString()
  const worker: BrowserWorkerRecord = {
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
  await audit(redis, { at: now, type: "worker.paired", detail: worker.name, workerId })
  return { workerId, token }
}

export async function authenticateBrowserWorker(request: NextRequest): Promise<string | null> {
  const workerId = request.headers.get("x-ams-worker-id")?.trim()
  const authorization = request.headers.get("authorization")?.trim()
  if (!workerId || !authorization?.startsWith("Bearer ")) return null
  const token = authorization.slice("Bearer ".length).trim()
  if (!token || token.length > 256) return null

  const redis = getRedis()
  const stored = await redis.get<string>(workerTokenKey(workerId))
  if (!stored || !safeEqual(stored, sha256(token))) return null
  return workerId
}

export async function recordBrowserHeartbeat(
  workerId: string,
  metadata: { version?: string; platform?: string; browser?: string; currentJobId?: string | null },
): Promise<{ disabled: boolean }> {
  const redis = getRedis()
  const worker = await redis.get<BrowserWorkerRecord>(workerKey(workerId))
  if (!worker) throw new Error("WORKER_NOT_FOUND")

  const updated: BrowserWorkerRecord = {
    ...worker,
    version: metadata.version?.trim().slice(0, 40) || worker.version,
    platform: metadata.platform?.trim().slice(0, 100) || worker.platform,
    browser: metadata.browser?.trim().slice(0, 100) || worker.browser,
    currentJobId: metadata.currentJobId === undefined ? worker.currentJobId : metadata.currentJobId,
    lastSeenAt: new Date().toISOString(),
  }
  await redis.set(workerKey(workerId), updated)
  return { disabled: (await redis.get<string>(KILL_SWITCH_KEY)) === "1" }
}

export async function createBrowserJob(input: BrowserJobInput): Promise<BrowserJob> {
  const redis = getRedis()
  if ((await redis.get<string>(KILL_SWITCH_KEY)) === "1") throw new Error("BROWSER_CONTROL_DISABLED")
  if (input.idempotencyKey) {
    const existingId = await redis.get<string>(idempotencyKey(input.idempotencyKey))
    if (existingId) {
      const existing = await getJob(redis, existingId)
      if (existing) return existing
    }
  }
  const risk = riskForBrowserAction(input.action)
  const status: BrowserJobStatus = risk === "green" ? "queued" : "awaiting_approval"
  const job: BrowserJob = {
    ...input,
    id: randomUUID(),
    risk,
    status,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
  }

  await putJob(redis, job)
  if (input.idempotencyKey) await redis.set(idempotencyKey(input.idempotencyKey), job.id, { ex: JOB_TTL_SECONDS })
  await rememberJob(redis, job.id)
  if (status === "queued") await redis.rpush(QUEUE_KEY, job.id)
  await audit(redis, {
    at: job.createdAt,
    type: "job.created",
    detail: `${job.action} ${job.url} (${job.risk})`,
    jobId: job.id,
  })
  return job
}

export async function approveBrowserJob(id: string): Promise<BrowserJob> {
  const redis = getRedis()
  if ((await redis.get<string>(KILL_SWITCH_KEY)) === "1") throw new Error("BROWSER_CONTROL_DISABLED")
  const job = await getJob(redis, id)
  if (!job) throw new Error("JOB_NOT_FOUND")
  if (job.status !== "awaiting_approval") throw new Error("JOB_NOT_AWAITING_APPROVAL")

  const updated: BrowserJob = { ...job, status: "queued", approvedAt: new Date().toISOString() }
  await putJob(redis, updated)
  await redis.rpush(QUEUE_KEY, id)
  await audit(redis, { at: updated.approvedAt!, type: "job.approved", detail: `${job.action} approved`, jobId: id })
  return updated
}

export async function claimBrowserJob(workerId: string): Promise<{ disabled: boolean; job: BrowserJob | null }> {
  const redis = getRedis()
  if ((await redis.get<string>(KILL_SWITCH_KEY)) === "1") return { disabled: true, job: null }
  await recoverStaleRunningJobs(redis)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = await redis.lpop<string>(QUEUE_KEY)
    if (!id) return { disabled: false, job: null }
    const job = await getJob(redis, id)
    if (!job || job.status !== "queued") continue

    const now = Date.now()
    const claimedAt = new Date(now).toISOString()
    const updated: BrowserJob = {
      ...job,
      status: "running",
      claimedAt,
      claimedBy: workerId,
      leaseExpiresAt: new Date(now + JOB_LEASE_MS).toISOString(),
      attemptCount: (job.attemptCount ?? 0) + 1,
    }
    await putJob(redis, updated)

    const worker = await redis.get<BrowserWorkerRecord>(workerKey(workerId))
    if (worker) await redis.set(workerKey(workerId), { ...worker, currentJobId: id, lastSeenAt: claimedAt })
    await audit(redis, { at: claimedAt, type: "job.claimed", detail: job.action, jobId: id, workerId })
    return { disabled: false, job: updated }
  }

  return { disabled: false, job: null }
}

export async function completeBrowserJob(
  workerId: string,
  input: {
    jobId: string
    ok: boolean
    title?: string
    finalUrl?: string
    text?: string
    error?: string
    durationMs?: number
    captureBase64?: string
    captureSha256?: string
    ownerAction?: BrowserOwnerAction
  },
): Promise<BrowserJob> {
  const redis = getRedis()
  const job = await getJob(redis, input.jobId)
  if (!job) throw new Error("JOB_NOT_FOUND")
  if (job.status !== "running" || job.claimedBy !== workerId) {
    if (["succeeded", "failed", "owner_action_required", "cancelled"].includes(job.status) && job.claimedBy === workerId) return job
    throw new Error("JOB_NOT_CLAIMED_BY_WORKER")
  }

  let captureAvailable = false
  if (input.captureBase64 && input.captureBase64.length <= MAX_CAPTURE_BASE64 && /^[A-Za-z0-9+/=]+$/.test(input.captureBase64)) {
    await redis.set(captureKey(job.id), input.captureBase64, { ex: CAPTURE_TTL_SECONDS })
    captureAvailable = true
  }

  const completedAt = new Date().toISOString()
  const result: BrowserJobResult = {
    title: input.title?.slice(0, 500),
    finalUrl: input.finalUrl?.slice(0, 2048),
    text: input.text?.slice(0, 20_000),
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs!)) : undefined,
    captureAvailable,
    captureSha256: input.captureSha256?.slice(0, 128),
    ownerAction: input.ownerAction,
  }
  const status: BrowserJobStatus = input.ownerAction ? "owner_action_required" : input.ok ? "succeeded" : "failed"
  const updated: BrowserJob = {
    ...job,
    status,
    completedAt,
    leaseExpiresAt: undefined,
    result,
    error: input.ok && !input.ownerAction ? undefined : input.error?.slice(0, 2000) || "Browser worker reported failure",
  }

  await putJob(redis, updated)
  const worker = await redis.get<BrowserWorkerRecord>(workerKey(workerId))
  if (worker) await redis.set(workerKey(workerId), { ...worker, currentJobId: null, lastSeenAt: completedAt })
  await audit(redis, {
    at: completedAt,
    type: input.ownerAction ? "job.owner_action_required" : input.ok ? "job.succeeded" : "job.failed",
    detail: input.ownerAction ? input.ownerAction : input.ok ? job.action : updated.error || "failed",
    jobId: job.id,
    workerId,
  })
  return updated
}

export async function getBrowserCapture(jobId: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const redis = getRedis()
  const base64 = await redis.get<string>(captureKey(jobId))
  if (!base64) return null
  const decoded = Buffer.from(base64, "base64")
  const copy = new Uint8Array(decoded.length)
  copy.set(decoded)
  return copy
}

export async function setBrowserKillSwitch(disabled: boolean): Promise<void> {
  const redis = getRedis()
  if (disabled) await redis.set(KILL_SWITCH_KEY, "1")
  else await redis.del(KILL_SWITCH_KEY)
  await audit(redis, {
    at: new Date().toISOString(),
    type: disabled ? "kill-switch.enabled" : "kill-switch.disabled",
    detail: disabled ? "Browser job claiming disabled" : "Browser job claiming enabled",
  })
}

export async function getBrowserControlSnapshot(): Promise<BrowserControlSnapshot> {
  let redis: Redis
  try {
    redis = getRedis()
  } catch {
    return { configured: false, killSwitch: true, worker: null, jobs: [], audit: [] }
  }

  await recoverStaleRunningJobs(redis)

  const [workerId, killSwitch, recentIds, auditEvents] = await Promise.all([
    redis.get<string>(PRIMARY_WORKER_KEY),
    redis.get<string>(KILL_SWITCH_KEY),
    redis.lrange<string>(RECENT_JOBS_KEY, 0, 19),
    redis.lrange<BrowserAuditEvent>(AUDIT_KEY, 0, 29),
  ])

  const rawWorker = workerId ? await redis.get<BrowserWorkerRecord>(workerKey(workerId)) : null
  const jobs = (await Promise.all(recentIds.map((id) => getJob(redis, id)))).filter((job): job is BrowserJob => Boolean(job))
  let worker: BrowserControlSnapshot["worker"] = null
  if (rawWorker) {
    const ageMs = Math.max(0, Date.now() - Date.parse(rawWorker.lastSeenAt))
    worker = { ...rawWorker, ageMs, online: ageMs <= ONLINE_WINDOW_MS && killSwitch !== "1" }
  }

  return {
    configured: true,
    killSwitch: killSwitch === "1",
    worker,
    jobs,
    audit: auditEvents,
  }
}
