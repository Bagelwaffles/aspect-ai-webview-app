import { createHash } from "node:crypto"
import { Redis } from "@upstash/redis"
import {
  SPECIALISTS, parseReport, parseStoredReport, reportContentKey,
  type ReportEnvelope, type SpecialistId,
} from "@/lib/operations/reporting"

export const REPORTING_PREVIEW_BRANCH = "feat/ams-maintenance-agent-pipeline-20261015"
// Read-only Vercel branch URL ↔ Upstash metadata match, 2026-11-12. Never accept a fallback DB.
const PREVIEW_URL_SHA256 = "9581dcc2901b318fc8e2b1e0a75c5ba159cd9d9c1a8ec27d0002fb3c9ad8d6dc"
export const REPORT_PREFIX = "ams:maintenance:v1:reporting:v1:owner"
export const REPORT_RETENTION_SECONDS = 90 * 24 * 60 * 60
export const REPORT_HISTORY_LIMIT = 100

export type ReportingRedis = {
  get<T = unknown>(key: string): Promise<T | null>
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>
  eval(script: string, keys: string[], args: string[]): Promise<unknown>
}
export type ReportingOptions = { env?: NodeJS.ProcessEnv; now?: Date; redis?: ReportingRedis }
export type ReportingRead<T> = {
  state: "available" | "unknown" | "not_configured" | "unavailable"
  data: T | null
  checkedAt: string
  error: string | null
}

export function reportingPreviewEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === REPORTING_PREVIEW_BRANCH
}
/** Call only after validating the signed internal-admin session cookie. */
export function isReportingOwnerEmail(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env) {
  const owner = env.AMS_OWNER_EMAIL?.trim().toLowerCase()
  return Boolean(owner && email?.trim().toLowerCase() === owner)
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex") }
export function reportingStoreGate(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!reportingPreviewEnabled(env)) return "REPORTING_PREVIEW_ONLY"
  const raw = env.UPSTASH_REDIS_REST_URL?.trim()
  if (!raw || !env.UPSTASH_REDIS_REST_TOKEN?.trim()) return "REPORTING_STORE_NOT_CONFIGURED"
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        url.pathname !== "/" || hash(url.origin) !== PREVIEW_URL_SHA256) {
      return "REPORTING_STORE_IDENTITY_UNVERIFIED"
    }
  } catch { return "REPORTING_STORE_IDENTITY_UNVERIFIED" }
  return null
}
export function reportingRedis(options: ReportingOptions = {}): ReportingRedis {
  const env = options.env ?? process.env
  const gate = reportingStoreGate(env)
  if (gate) throw new Error(gate)
  return options.redis ?? new Redis({
    url: env.UPSTASH_REDIS_REST_URL!.trim(), token: env.UPSTASH_REDIS_REST_TOKEN!.trim(),
    retry: false, signal: () => AbortSignal.timeout(5_000),
  })
}
export function specialistSourceId(specialistId: SpecialistId) {
  return `owner-reviewed-specialist:${specialistId}`
}
function binding(specialistId: SpecialistId) {
  return { specialistId, sourceSystemId: specialistSourceId(specialistId) }
}

// One atomic transaction: two immutable identities, bounded history, and latest observation.
// A burst of old evidence must never evict the latest report from the current projection.
// Replays neither duplicate history nor refresh evidence/retention timestamps.
export const REPORT_WRITE_SCRIPT = `
local byId = redis.call('GET', KEYS[1])
local byDedupe = redis.call('GET', KEYS[2])
if byId or byDedupe then
  if not byId or not byDedupe or byId ~= byDedupe then return {'conflict'} end
  local old = cjson.decode(byId)
  if old.contentHash ~= ARGV[1] then return {'conflict'} end
  return {'duplicate', byId}
end
local historyType = redis.call('TYPE', KEYS[3]).ok
if historyType ~= 'none' and historyType ~= 'list' then return {'invalid'} end
local incoming = cjson.decode(ARGV[2])
local latestRaw = redis.call('GET', KEYS[4])
local replaceLatest = not latestRaw
if latestRaw then
  local latest = cjson.decode(latestRaw)
  if type(latest.report) ~= 'table' or type(latest.report.observedAt) ~= 'string' or type(latest.report.reportId) ~= 'string' then
    return {'invalid'}
  end
  replaceLatest = incoming.report.observedAt > latest.report.observedAt or
    (incoming.report.observedAt == latest.report.observedAt and incoming.report.reportId < latest.report.reportId)
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('LPUSH', KEYS[3], ARGV[2])
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[4]) - 1)
redis.call('EXPIRE', KEYS[3], ARGV[3])
if replaceLatest then redis.call('SET', KEYS[4], ARGV[2], 'EX', ARGV[3]) end
return {'created', ARGV[2]}
`
function scope(specialistId: SpecialistId) { return `${REPORT_PREFIX}:${specialistId}` }
function unwrap(raw: unknown): unknown {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw
  if (!value || typeof value !== "object" || !("report" in value)) throw new Error("REPORTING_STORED_REPORT_INVALID")
  if (!("contentHash" in value) || typeof value.contentHash !== "string" ||
      value.contentHash !== hash(reportContentKey(value.report as ReportEnvelope))) {
    throw new Error("REPORTING_STORED_REPORT_INVALID")
  }
  return value.report
}
export async function saveSpecialistReport(specialistId: SpecialistId, input: unknown, options: ReportingOptions = {}) {
  const now = options.now ?? new Date()
  const parsed = parseReport(input, binding(specialistId), now)
  if (!parsed.ok) throw new Error("REPORTING_PAYLOAD_INVALID")
  const report = parsed.report
  const client = reportingRedis(options)
  const stored = JSON.stringify({ contentHash: hash(reportContentKey(report)), report })
  const result = await client.eval(REPORT_WRITE_SCRIPT, [
    `${scope(specialistId)}:id:${hash(report.reportId)}`,
    `${scope(specialistId)}:dedupe:${hash(report.dedupeKey)}`,
    `${scope(specialistId)}:history`,
    `${scope(specialistId)}:latest`,
  ], [hash(reportContentKey(report)), stored, String(REPORT_RETENTION_SECONDS), String(REPORT_HISTORY_LIMIT)])
  if (Array.isArray(result) && result[0] === "invalid") throw new Error("REPORTING_STORED_REPORT_INVALID")
  if (Array.isArray(result) && result.length === 1 && result[0] === "conflict") {
    throw new Error("REPORTING_IDENTITY_CONFLICT")
  }
  if (!Array.isArray(result) || result.length !== 2 || !["created", "duplicate"].includes(String(result[0]))) {
    throw new Error("REPORTING_STORE_RESPONSE_INVALID")
  }
  const saved = parseStoredReport(unwrap(result[1]), binding(specialistId), now)
  if (!saved.ok) throw new Error("REPORTING_STORED_REPORT_INVALID")
  return { report: saved.report, created: result[0] === "created" }
}
export async function readSpecialistReports(options: ReportingOptions = {}): Promise<ReportingRead<ReportEnvelope[]>> {
  const now = options.now ?? new Date()
  const checkedAt = now.toISOString()
  const gate = reportingStoreGate(options.env ?? process.env)
  if (gate) return { state: gate === "REPORTING_STORE_NOT_CONFIGURED" ? "not_configured" : "unavailable", data: null, checkedAt, error: gate }
  try {
    const client = reportingRedis(options)
    const lanes = await Promise.all(SPECIALISTS.map(async (specialist) => {
      const [rows, latest] = await Promise.all([
        client.lrange<unknown>(`${scope(specialist.id)}:history`, 0, REPORT_HISTORY_LIMIT - 1),
        client.get<unknown>(`${scope(specialist.id)}:latest`),
      ])
      const byId = new Map<string, ReportEnvelope>()
      const byDedupe = new Map<string, ReportEnvelope>()
      for (const raw of latest === null ? rows : [latest, ...rows]) {
        const value = parseStoredReport(unwrap(raw), binding(specialist.id), now)
        if (!value.ok) throw new Error("REPORTING_STORED_REPORT_INVALID")
        const report = value.report
        for (const prior of [byId.get(report.reportId), byDedupe.get(report.dedupeKey)]) {
          if (prior && (reportContentKey(prior) !== reportContentKey(report) || prior.receivedAt !== report.receivedAt)) {
            throw new Error("REPORTING_STORED_REPORT_INVALID")
          }
        }
        byId.set(report.reportId, report)
        byDedupe.set(report.dedupeKey, report)
      }
      return [...byId.values()].filter((report) => now.getTime() - Date.parse(report.receivedAt) < REPORT_RETENTION_SECONDS * 1000)
    }))
    return { state: "available", data: lanes.flat(), checkedAt, error: null }
  } catch {
    return { state: "unavailable", data: null, checkedAt, error: "REPORTING_READ_FAILED" }
  }
}
