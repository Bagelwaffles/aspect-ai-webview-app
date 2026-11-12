import { z } from "zod"
import { projectSpecialists } from "@/lib/operations/reporting"
import {
  readSpecialistReports, reportingRedis, reportingStoreGate,
  type ReportingOptions, type ReportingRead,
} from "@/lib/server/operations-report-store"

export const MONITOR_DEFINITIONS = [
  ["core-health", "Core Infrastructure"], ["revenue-fulfillment", "Revenue & Fulfillment"],
  ["overmind-tasks", "Overmind Task Queue"], ["social-publishing", "Social Publishing"],
  ["twitch-media", "Twitch Media & Rendering"], ["fiverr-operations", "Fiverr Operations"],
  ["android-play", "Google Play Release"], ["visibility-catalog", "Visibility & Catalog Truth"],
  ["execution-transparency", "Trust & Execution Transparency"], ["agent-lifecycle", "Agent Lifecycle"],
] as const
export const MONITOR_TTL_MS = 48 * 60 * 60 * 1000
const timestamp = z.string().datetime()
const signal = z.enum(["ok", "info", "warning", "critical", "not_configured"])
const resultSchema = z.object({ key: z.string(), status: signal, checkedAt: timestamp })
const snapshotSchema = z.object({ version: z.literal("backend-monitoring-v1"), checkedAt: timestamp, results: z.array(resultSchema).max(10) })
const eventSchema = z.object({ id: z.string().max(100), monitorKey: z.string(), toStatus: signal, createdAt: timestamp, recovery: z.boolean() })
export type MonitorRow = {
  key: string; name: string; observedAt: string | null; reportedStatus: string | null
  status: "unknown" | "stale" | "attention" | "blocked" | "not_configured"
}
function decode(raw: unknown) { return typeof raw === "string" ? JSON.parse(raw) : raw }
function validTime(time: string, now: Date) { return Date.parse(time) <= now.getTime() }
export function projectMonitorSnapshot(raw: unknown, now = new Date()): { observedAt: string; rows: MonitorRow[] } | null {
  const parsed = snapshotSchema.safeParse(raw)
  if (!parsed.success || !validTime(parsed.data.checkedAt, now)) return null
  const seen = new Set<string>()
  for (const entry of parsed.data.results) {
    if (seen.has(entry.key) || !MONITOR_DEFINITIONS.some(([key]) => key === entry.key) || !validTime(entry.checkedAt, now)) return null
    seen.add(entry.key)
  }
  return {
    observedAt: parsed.data.checkedAt,
    rows: MONITOR_DEFINITIONS.map(([key, name]) => {
      const entry = parsed.data.results.find(result => result.key === key)
      if (!entry) return { key, name, observedAt: null, reportedStatus: null, status: "unknown" }
      const observedAt = new Date(Math.min(Date.parse(entry.checkedAt), Date.parse(parsed.data.checkedAt))).toISOString()
      const stale = now.getTime() - Date.parse(observedAt) >= MONITOR_TTL_MS
      return { key, name, observedAt, reportedStatus: entry.status, status: stale ? "stale" : entry.status === "warning" ? "attention" : entry.status === "critical" ? "blocked" : entry.status === "not_configured" ? "not_configured" : "unknown" }
    }),
  }
}
export async function readMonitoringEvidence(options: ReportingOptions = {}) {
  const now = options.now ?? new Date()
  const checkedAt = now.toISOString()
  const unavailable = <T>(error: string): ReportingRead<T> => ({ state: "unavailable", data: null, checkedAt, error })
  const gate = reportingStoreGate(options.env ?? process.env)
  if (gate) return { snapshot: unavailable<ReturnType<typeof projectMonitorSnapshot>>(gate), events: unavailable<Array<z.infer<typeof eventSchema>>>(gate) }
  const client = reportingRedis(options)
  const snapshot = (async (): Promise<ReportingRead<NonNullable<ReturnType<typeof projectMonitorSnapshot>>>> => {
    try {
      const raw = await client.get<unknown>("ams:monitoring:v1:latest")
      if (raw === null) return { state: "unknown", data: null, checkedAt, error: "No saved snapshot; monitor execution is unverified." }
      const projection = projectMonitorSnapshot(decode(raw), now)
      if (!projection) return unavailable("Saved snapshot malformed; no health conclusion.")
      return { state: "available", data: projection, checkedAt, error: null }
    } catch { return unavailable("Monitor snapshot read failed; no health conclusion.") }
  })()
  const events = (async (): Promise<ReportingRead<Array<z.infer<typeof eventSchema>>>> => {
    try {
      const raw = await client.lrange<unknown>("ams:monitoring:v1:events", 0, 49)
      const parsed = raw.map(row => eventSchema.parse(decode(row)))
      if (parsed.some(row => !MONITOR_DEFINITIONS.some(([key]) => key === row.monitorKey) || !validTime(row.createdAt, now))) throw new Error("invalid event")
      return { state: "available", data: parsed.filter(row => now.getTime() - Date.parse(row.createdAt) < 90 * 86_400_000), checkedAt, error: null }
    } catch { return unavailable("Monitor event read failed; an empty incident list is not established.") }
  })()
  return { snapshot: await snapshot, events: await events }
}
const findingSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{40}$/), area: z.string().max(100),
  state: z.enum(["observed", "draft_pr", "checks_passed", "blocked"]),
  sourceObservedAt: timestamp, updatedAt: timestamp,
  policy: z.enum(["draft_only", "escalate"]),
  pr: z.object({ url: z.string().regex(/^https:\/\/github\.com\/Bagelwaffles\/aspect-ai-webview-app\/pull\/\d+$/), headSha: z.string().regex(/^[a-f0-9]{40}$/), ciVerifiedAt: timestamp.nullable() }).nullable(),
})
export async function readMaintenanceEvidence(options: ReportingOptions = {}): Promise<ReportingRead<Array<z.infer<typeof findingSchema>>>> {
  const now = options.now ?? new Date()
  const checkedAt = now.toISOString()
  try {
    const client = reportingRedis(options)
    const ids = await client.lrange<string>("ams:maintenance:v1:index", 0, 49)
    if (ids.some(id => !/^[a-f0-9]{40}$/.test(id))) throw new Error("invalid index")
    const raw = await Promise.all([...new Set(ids)].map(id => client.get<unknown>(`ams:maintenance:v1:finding:${id}`)))
    // Expired records are unknown, not silently converted into a successful empty result.
    const data = raw.map(value => findingSchema.parse(decode(value)))
    if (data.some(value => !validTime(value.sourceObservedAt, now) || !validTime(value.updatedAt, now) || (value.pr?.ciVerifiedAt && !validTime(value.pr.ciVerifiedAt, now)))) throw new Error("invalid finding time")
    return { state: "available", data, checkedAt, error: null }
  } catch { return { state: "unavailable", data: null, checkedAt, error: "Maintenance evidence unavailable or incomplete." } }
}
export async function getOperationsTelemetry(options: ReportingOptions = {}) {
  const now = options.now ?? new Date()
  const [reports, monitoring, maintenance] = await Promise.all([readSpecialistReports({ ...options, now }), readMonitoringEvidence({ ...options, now }), readMaintenanceEvidence({ ...options, now })])
  return { checkedAt: now.toISOString(), reports, monitoring, maintenance, specialists: projectSpecialists(reports.data ?? [], now) }
}
