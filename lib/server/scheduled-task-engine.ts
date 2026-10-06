import { createHash, createHmac, randomUUID } from "node:crypto"
import { Redis } from "@upstash/redis"
import { deliverGmailAlert } from "./owner-gmail-delivery"

export type TaskSchedule = { frequency: "hourly" | "daily" | "weekly"; timezone: string; hour: number; minute: number; weekday?: number }
export type TaskDefinition = { id: string; name: string; category: string; schedule: TaskSchedule }
export const scheduledTaskDefinitions: TaskDefinition[] = [
  { id: "ai-platform-intelligence", name: "AMS AI Platform Intelligence", category: "Business intelligence", schedule: { frequency: "daily", timezone: "America/Chicago", hour: 8, minute: 0 } },
  { id: "smokybanana03-weekly-brief", name: "SmokyBanana03 Weekly Brief", category: "Creator operations", schedule: { frequency: "weekly", timezone: "America/Chicago", weekday: 0, hour: 19, minute: 0 } },
  ...["primary", "secondary"].map(slot => ({ id: `gmail-${slot}-monitor`, name: `AMS ${slot} Gmail monitoring`, category: "Owner email", schedule: { frequency: "hourly" as const, timezone: "America/Chicago", hour: 0, minute: 0 } })),
]

// Iterate real UTC instants through an IANA zone. DST gaps are skipped and a
// repeated local hour has one due slot because successful runs advance the slot.
export function nextTaskExecution(schedule: TaskSchedule, after: Date): string {
  const format = new Intl.DateTimeFormat("en-US", { timeZone: schedule.timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit" })
  const previous = Object.fromEntries(format.formatToParts(after).map(part => [part.type, part.value]))
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  let instant = Math.floor(after.getTime() / 60_000) * 60_000 + 60_000
  for (let i = 0; i < 9 * 24 * 60; i++, instant += 60_000) {
    const parts = Object.fromEntries(format.formatToParts(instant).map(part => [part.type, part.value]))
    const sameDay = ["year", "month", "day"].every(key => parts[key] === previous[key])
    if (sameDay && schedule.frequency !== "hourly" && Number(previous.hour) * 60 + Number(previous.minute) >= schedule.hour * 60 + schedule.minute) continue
    if (sameDay && schedule.frequency === "hourly" && parts.hour === previous.hour && Number(previous.minute) >= schedule.minute) continue
    if (Number(parts.minute) !== schedule.minute) continue
    if (schedule.frequency !== "hourly" && Number(parts.hour) !== schedule.hour) continue
    if (schedule.frequency === "weekly" && parts.weekday !== weekdays[schedule.weekday ?? 0]) continue
    return new Date(instant).toISOString()
  }
  throw new Error("TASK_SCHEDULE_INVALID")
}

export type TaskResult = { summary: string; details: unknown; alert: boolean; discoveries?: string[]; dataQuality: "verified" | "partial" }
export type TaskRun = {
  id: string; trigger: "scheduled" | "manual" | "retry"; scheduledFor: string; startedAt: string; finishedAt: string | null;
  status: "running" | "succeeded" | "failed" | "interrupted"; attempt: number; error: string | null; result: TaskResult | null;
  notification: "none" | "pending" | "delivered" | "exhausted"; deliveryAttempts: number; nextDeliveryAt: string | null; deliveryReceipt: string | null;
}
export type TaskState = {
  id: string; owner: string; enabled: boolean; nextExecution: string; lastAttempt: string | null; lastSuccess: string | null;
  lastScheduledSuccess: string | null; lastScheduledTrigger: string | null; retryCount: number; retryAt: string | null;
  error: string | null; findings: string[]; history: TaskRun[]; missedRun: boolean;
}
export interface TaskStore {
  read(id: string): Promise<TaskState | null>
  lock(id: string, token: string): Promise<boolean>
  write(id: string, token: string, state: TaskState): Promise<void>
  release(id: string, token: string): Promise<void>
}
const PREFIX = "ams:scheduled-tasks:v1"
const LEASE_SECONDS = 180
export function createScheduledTaskStore(env: NodeJS.ProcessEnv = process.env): TaskStore {
  const url = env.UPSTASH_REDIS_REST_URL?.trim() || env.KV_REST_API_URL?.trim()
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() || env.KV_REST_API_TOKEN?.trim()
  if (!url || !token || !env.AMS_OWNER_EMAIL?.trim()) throw new Error("TASK_STORE_UNAVAILABLE")
  const redis = new Redis({ url, token })
  const owner = createHash("sha256").update(env.AMS_OWNER_EMAIL.trim().toLowerCase()).digest("hex")
  const key = (id: string) => `${PREFIX}:${owner}:${id}`
  return {
    async read(id) { const raw = await redis.get<TaskState | string>(key(id)); return typeof raw === "string" ? JSON.parse(raw) : raw },
    async lock(id, lease) { return await redis.set(`${key(id)}:lock`, lease, { nx: true, ex: LEASE_SECONDS }) === "OK" },
    async write(id, lease, state) {
      const result = await redis.eval("if redis.call('get',KEYS[1]) ~= ARGV[1] then return 0 end redis.call('set',KEYS[2],ARGV[2]); return 1", [`${key(id)}:lock`, key(id)], [lease, JSON.stringify(state)])
      if (Number(result) !== 1) throw new Error("TASK_LEASE_LOST")
    },
    async release(id, lease) { await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) end return 0", [`${key(id)}:lock`], [lease]) },
  }
}
export type TaskWorker = (definition: TaskDefinition, state: TaskState, now: Date) => Promise<TaskResult>
export type TaskDelivery = (run: TaskRun, definition: TaskDefinition) => Promise<string | null>
export function scheduledTaskOwner(env: NodeJS.ProcessEnv = process.env) {
  const email = env.AMS_OWNER_EMAIL?.trim().toLowerCase()
  if (!email) throw new Error("TASK_OWNER_UNAVAILABLE")
  return createHash("sha256").update(email).digest("hex")
}
export function initialTaskState(definition: TaskDefinition, owner: string, now: Date): TaskState {
  // New replacements remain disabled until production configuration is verified.
  return { id: definition.id, owner, enabled: false, nextExecution: nextTaskExecution(definition.schedule, now), lastAttempt: null, lastSuccess: null, lastScheduledSuccess: null, lastScheduledTrigger: null, retryCount: 0, retryAt: null, error: null, findings: [], history: [], missedRun: false }
}
export function taskErrorCode(error: unknown) {
  const code = error instanceof Error ? error.message : "TASK_EXECUTION_FAILED"
  return /^[A-Z][A-Z0-9_]{2,100}$/u.test(code) ? code : "TASK_EXECUTION_FAILED"
}
export function retryDelay(attempt: number) { return Math.min(60 * 60_000, 5 * 60_000 * 2 ** Math.max(0, attempt - 1)) }

export function createTaskDelivery(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch, localDeliver: typeof deliverGmailAlert = deliverGmailAlert): TaskDelivery {
  return async (run, definition) => {
    const raw = env.AMS_MONITOR_ALERT_WEBHOOK_URL?.trim()
    const secret = env.AMS_MONITOR_ALERT_WEBHOOK_SECRET?.trim()
    if (!raw || !secret) return null
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.username || url.password) return null
    const body = JSON.stringify({ source: "ams-scheduled-tasks", id: run.id, task: definition.name, createdAt: run.finishedAt, severity: run.status === "failed" ? "critical" : "actionable", summary: run.result?.summary ?? run.error, details: run.result?.details ?? null })
    // Vercel Authentication protects preview deployments, including same-origin
    // server-to-server fetches. Deliver only to the exact reviewed local receiver
    // inside a preview; preserve signed HTTPS transport in all other cases.
    const origin = env.PUBLIC_APP_URL || env.NEXTAUTH_URL
    let previewOwnReceiver = false
    if (env.VERCEL_ENV === "preview" && origin && env.AMS_GMAIL_SEND_ENABLED === "true") {
      try {
        const configured = new URL(origin)
        previewOwnReceiver = configured.origin === url.origin &&
          url.pathname === "/api/internal/monitoring/email" &&
          url.search === "" && url.hash === ""
      } catch { /* An invalid owner origin never permits local delivery. */ }
    }
    let receipt: { delivered?: boolean; deliveryId?: string } | null = null
    if (previewOwnReceiver) {
      // No Vercel SSO bypass token is created or deployed. The existing
      // encrypted Gmail vault and send opt-in still enforce the sender grant.
      receipt = await localDeliver(JSON.parse(body), run.id, { env })
    } else {
      const response = await fetcher(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(8_000), headers: { "Content-Type": "application/json", "X-AMS-Monitor-Signature": createHmac("sha256", secret).update(body).digest("hex"), "Idempotency-Key": run.id }, body })
      if (!response.ok) return null
      receipt = await response.json().catch(() => null) as { delivered?: boolean; deliveryId?: string } | null
    }
    // An HTTP acknowledgment or Gmail send response is not inbox delivery.
    return receipt?.delivered === true && typeof receipt.deliveryId === "string" && /^[A-Za-z0-9:_-]{1,160}$/u.test(receipt.deliveryId) ? receipt.deliveryId : null
  }
}

export async function operateScheduledTask(options: {
  definition: TaskDefinition; owner: string; store: TaskStore; worker: TaskWorker; deliver: TaskDelivery;
  action: "tick" | "pause" | "resume" | "run" | "retry"; now?: Date;
  requestId?: string;
  independentSchedule?: boolean;
}): Promise<{ outcome: string; state?: TaskState }> {
  const { definition, store, owner, worker, deliver, action } = options
  const now = options.now ?? new Date()
  const token = randomUUID()
  if (!await store.lock(definition.id, token)) return { outcome: "busy" }
  try {
    const state = await store.read(definition.id) ?? initialTaskState(definition, owner, now)
    if (state.owner !== owner) throw new Error("TASK_OWNER_MISMATCH")
    const save = () => store.write(definition.id, token, state)
    if (action === "pause" || action === "resume") {
      state.enabled = action === "resume"
      if (action === "resume") { state.nextExecution = nextTaskExecution(definition.schedule, now); state.retryAt = null; state.retryCount = 0 }
      await save(); return { outcome: action === "pause" ? "paused" : "resumed", state }
    }
    if (!state.enabled) return { outcome: "disabled", state }
    const recover = state.history.find(run => run.status === "running")
    if (recover) { recover.status = "interrupted"; recover.finishedAt = now.toISOString(); recover.error = "TASK_WORKER_INTERRUPTED"; state.error = recover.error; state.retryAt = now.toISOString() }

    // The outbox is persisted before delivery. Stable IDs require receiver-side
    // idempotency to cover a crash after send but before the receipt is saved.
    for (const pending of state.history.filter(run => run.notification === "pending" && (!run.nextDeliveryAt || Date.parse(run.nextDeliveryAt) <= now.getTime())).slice(0, 1)) {
      pending.deliveryAttempts++
      const receipt = await deliver(pending, definition).catch(() => null)
      if (receipt) { pending.notification = "delivered"; pending.deliveryReceipt = receipt; pending.nextDeliveryAt = null }
      else { pending.notification = pending.deliveryAttempts >= 5 ? "exhausted" : "pending"; pending.nextDeliveryAt = new Date(now.getTime() + retryDelay(pending.deliveryAttempts)).toISOString() }
      await save()
    }
    if (action === "retry") {
      const failedDelivery = state.history.find(run => run.notification === "exhausted")
      if (failedDelivery) { failedDelivery.notification = "pending"; failedDelivery.deliveryAttempts = 0; failedDelivery.nextDeliveryAt = now.toISOString(); await save(); return { outcome: "notification-retry-queued", state } }
      if (!state.error) return { outcome: "no-failed-execution", state }
      state.retryCount = 0
    }
    const due = Date.parse(state.nextExecution) <= now.getTime()
    const retry = state.retryAt !== null && Date.parse(state.retryAt) <= now.getTime()
    if (action === "tick" && !retry && !due) { await save(); return { outcome: "not-due", state } }
    if (action === "tick" && state.retryAt && !retry) { await save(); return { outcome: "backoff", state } }
    const last = state.history[0]
    const retrying = (action === "tick" && retry) || action === "retry"
    const scheduledFor = retrying && last ? last.scheduledFor : action === "run" ? now.toISOString() : state.nextExecution
    const attempt = retrying && last ? last.attempt + 1 : 1
    const isScheduled = action === "tick" && options.independentSchedule !== false && (!retrying || last?.trigger === "scheduled")
    const runId = createHash("sha256").update(`${owner}:${definition.id}:${action === "run" ? options.requestId ?? scheduledFor : scheduledFor}:${attempt}`).digest("hex")
    if (state.history.some(run => run.id === runId && run.status === "succeeded")) return { outcome: "already-completed", state }
    const run: TaskRun = { id: runId, trigger: isScheduled ? "scheduled" : action === "run" ? "manual" : "retry", scheduledFor, startedAt: now.toISOString(), finishedAt: null, status: "running", attempt, result: null, error: null, notification: "none", deliveryAttempts: 0, nextDeliveryAt: null, deliveryReceipt: null }
    state.lastAttempt = run.startedAt
    if (isScheduled) state.lastScheduledTrigger = run.startedAt
    state.missedRun = isScheduled && now.getTime() - Date.parse(scheduledFor) > 2 * 60 * 60_000
    state.history = [run, ...state.history].slice(0, 60)
    await save()
    try {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        run.result = await Promise.race([worker(definition, state, now), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("TASK_WORKER_TIMEOUT")), 35_000) })])
      } finally { if (timeout) clearTimeout(timeout) }
      run.status = "succeeded"; state.lastSuccess = now.toISOString(); state.error = null; state.retryAt = null; state.retryCount = 0
      if (isScheduled) state.lastScheduledSuccess = now.toISOString()
      state.findings = [...new Set([...state.findings, ...(run.result.discoveries ?? [])])].slice(-2000)
      run.notification = run.result.alert ? "pending" : "none"
    } catch (error) {
      run.status = "failed"; run.error = taskErrorCode(error)
      run.notification = state.error === run.error ? "none" : "pending"
      state.error = run.error; state.retryCount = retrying ? state.retryCount + 1 : 1
      state.retryAt = state.retryCount < 4 ? new Date(now.getTime() + retryDelay(state.retryCount)).toISOString() : null
    }
    run.finishedAt = new Date().toISOString()
    // Coalesce missed slots, rather than replaying historical jobs in a burst.
    if (run.status === "succeeded" || !state.retryAt) state.nextExecution = nextTaskExecution(definition.schedule, now)
    await save()
    if (run.notification === "pending") {
      run.deliveryAttempts++
      const receipt = await deliver(run, definition).catch(() => null)
      if (receipt) { run.notification = "delivered"; run.deliveryReceipt = receipt }
      else run.nextDeliveryAt = new Date(now.getTime() + retryDelay(1)).toISOString()
      await save()
    }
    return { outcome: run.status, state }
  } finally { await store.release(definition.id, token) }
}
