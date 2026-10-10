import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import { ownerGmailContext, type GmailContext, type GmailSlot } from "./owner-gmail"
import { runGmailMonitor } from "./owner-gmail-monitor"
import { createScheduledTaskStore, scheduledTaskDefinitions, type TaskRun, type TaskStore } from "./scheduled-task-engine"
import { requirePreviewRefreshVerification } from "./owner-gmail-refresh-verification"

export const checkpointInitializationSchema = z.object({
  id: z.string().uuid(), slot: z.enum(["primary", "secondary"]), status: z.enum(["initialized", "already-initialized"]),
  checkpoint: z.number().finite(), persisted: z.literal(true), taskEnabledUnchanged: z.literal(true),
  otherGrantUnchanged: z.boolean(), notificationSends: z.literal(0), automaticReplies: z.literal(false),
})
export type CheckpointInitialization = z.infer<typeof checkpointInitializationSchema>
const continuationSchema = z.object({ checkpoint: z.number().finite() })

export async function initializeOwnerGmailCheckpoint(slot: GmailSlot, id: string, input: GmailContext & { store?: TaskStore } = {}): Promise<CheckpointInitialization> {
  const c = ownerGmailContext(input)
  requirePreviewRefreshVerification(c.env)
  z.string().uuid().parse(id)
  const store = input.store ?? createScheduledTaskStore(c.env)
  const definition = scheduledTaskDefinitions.find(task => task.id === `gmail-${slot}-monitor`)!
  const lease = randomUUID()
  if (!await store.lock(definition.id, lease)) throw new Error("GMAIL_INITIALIZATION_BUSY")
  try {
    const state = await store.read(definition.id)
    if (!state) throw new Error("GMAIL_INITIALIZATION_STATE_REQUIRED")
    if (state.enabled) throw new Error("GMAIL_INITIALIZATION_TASK_MUST_BE_PAUSED")
    const existing = state.history.find(run => run.status === "succeeded" && continuationSchema.safeParse(run.result?.details).success)
    if (existing) {
      return { id, slot, status: "already-initialized", checkpoint: continuationSchema.parse(existing.result!.details).checkpoint, persisted: true, taskEnabledUnchanged: true, otherGrantUnchanged: true, notificationSends: 0, automaticReplies: false }
    }
    const originalEnabled = state.enabled
    const otherSlot = slot === "primary" ? "secondary" : "primary"
    const otherGrant = JSON.stringify(await c.redis.get(`${c.prefix}${otherSlot}`))
    const deadline = AbortSignal.timeout(40_000)
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = new URL(String(url)), method = init?.method ?? "GET"
      const readOnlyGmail = target.origin === "https://gmail.googleapis.com" && method === "GET" && /^\/gmail\/v1\/users\/me\/messages(?:\/[A-Za-z0-9_-]+)?$/u.test(target.pathname)
      const tokenExchange = target.href === "https://oauth2.googleapis.com/token" && method === "POST"
      if (!readOnlyGmail && !tokenExchange) throw new Error("GMAIL_INITIALIZATION_REQUEST_BLOCKED")
      return c.fetcher(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline })
    }) as typeof fetch
    const now = new Date(c.now)
    const result = await runGmailMonitor(slot, structuredClone(state), now, { ...input, env: { ...c.env, AMS_GMAIL_AUTOREPLY_ENABLED: "false" }, redis: c.redis, fetcher })
    const continuation = continuationSchema.parse(result.details)
    const runId = createHash("sha256").update(`${state.owner}:${definition.id}:initialization:${id}`).digest("hex")
    const run: TaskRun = { id: runId, trigger: "initialization", scheduledFor: now.toISOString(), startedAt: now.toISOString(), finishedAt: now.toISOString(), status: "succeeded", attempt: 1, error: null, result: { ...result, alert: false }, notification: "none", deliveryAttempts: 0, nextDeliveryAt: null, deliveryReceipt: null }
    state.history = [run, ...state.history].slice(0, 60)
    state.findings = [...new Set([...state.findings, ...(result.discoveries ?? [])])].slice(-2000)
    await store.write(definition.id, lease, state)
    const persisted = await store.read(definition.id)
    const storedRun = persisted?.history.find(candidate => candidate.id === runId)
    if (!persisted || persisted.enabled !== originalEnabled || !storedRun || !continuationSchema.safeParse(storedRun.result?.details).success) throw new Error("GMAIL_INITIALIZATION_PERSISTENCE_FAILED")
    return { id, slot, status: "initialized", checkpoint: continuation.checkpoint, persisted: true, taskEnabledUnchanged: true, otherGrantUnchanged: JSON.stringify(await c.redis.get(`${c.prefix}${otherSlot}`)) === otherGrant, notificationSends: 0, automaticReplies: false }
  } finally { await store.release(definition.id, lease) }
}
