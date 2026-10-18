import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import { gmailAccessToken, ownerGmailContext, type GmailContext, type GmailSlot, type GmailTokenEvidence } from "./owner-gmail"
import { runGmailMonitor } from "./owner-gmail-monitor"
import { gmailFailureDiagnostic } from "./owner-gmail-diagnostics"
import { gmailTestFailure } from "../gmail-connection-feedback"
import { createScheduledTaskStore, initialTaskState, scheduledTaskDefinitions, scheduledTaskOwner, type TaskStore } from "./scheduled-task-engine"

const tokenEvidenceSchema = z.object({ refreshed: z.boolean(), exchangeHttpStatus: z.number().int().nullable(), persisted: z.boolean(), accessTokenReplaced: z.boolean(), refreshTokenAvailable: z.boolean(), accessTokenExpiresAt: z.string().datetime().nullable() })
export const refreshVerificationSchema = z.object({
  id: z.string().uuid(), slot: z.enum(["primary", "secondary"]),
  status: z.enum(["passed", "awaiting-expiry", "inconclusive", "failed"]),
  token: tokenEvidenceSchema.optional(), monitoringReadSucceeded: z.boolean().optional(),
  checkpointPreserved: z.boolean().optional(), taskStateUnchanged: z.boolean().optional(), otherGrantUnchanged: z.boolean().optional(),
  repeatedMessages: z.number().int().nonnegative().optional(), dedupPassed: z.boolean().optional(),
  notificationSends: z.literal(0), automaticReplies: z.literal(false), code: z.string().optional(),
  diagnostic: z.object({ operation: z.enum(["token", "send", "receipt"]), httpStatus: z.number().int(), reason: z.string(), category: z.string() }).optional(),
})
export type RefreshVerification = z.infer<typeof refreshVerificationSchema>
export function requirePreviewRefreshVerification(env = process.env) {
  if (env.VERCEL_ENV !== "preview") throw new Error("GMAIL_VERIFICATION_PREVIEW_ONLY")
  if (env.AMS_GMAIL_AUTOREPLY_ENABLED === "true") throw new Error("GMAIL_VERIFICATION_REPLIES_MUST_BE_OFF")
}
export async function verifyOwnerGmailRefresh(slot: GmailSlot, id: string, input: GmailContext & { store?: TaskStore } = {}): Promise<RefreshVerification> {
  const c = ownerGmailContext(input)
  requirePreviewRefreshVerification(c.env)
  z.string().uuid().parse(id)
  const key = `${c.prefix}refresh-verification:${slot}:${id}`
  const store = input.store ?? createScheduledTaskStore(c.env)
  const definition = scheduledTaskDefinitions.find(task => task.id === `gmail-${slot}-monitor`)!
  const lease = randomUUID()
  if (!await store.lock(definition.id, lease)) throw new Error("GMAIL_VERIFICATION_BUSY")
  try {
    const previous = await c.redis.get<string>(key)
    if (previous) return refreshVerificationSchema.parse(typeof previous === "string" ? JSON.parse(previous) : previous)
    const original = await store.read(definition.id)
    const snapshot = structuredClone(original ?? initialTaskState(definition, scheduledTaskOwner(c.env), new Date(c.now)))
    const otherSlot = slot === "primary" ? "secondary" : "primary"
    const otherGrant = JSON.stringify(await c.redis.get(`${c.prefix}${otherSlot}`))
    let token: GmailTokenEvidence | undefined
    const pages: string[][] = []
    const deadline = AbortSignal.timeout(40_000)
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = new URL(String(url))
      const method = init?.method ?? "GET"
      const readOnlyGmail = target.origin === "https://gmail.googleapis.com" && method === "GET" && /^\/gmail\/v1\/users\/me\/messages(?:\/[A-Za-z0-9_-]+)?$/u.test(target.pathname)
      const tokenExchange = target.href === "https://oauth2.googleapis.com/token" && method === "POST"
      if (!readOnlyGmail && !tokenExchange) throw new Error("GMAIL_VERIFICATION_REQUEST_BLOCKED")
      const response = await c.fetcher(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline })
      if (readOnlyGmail && target.pathname.endsWith("/messages") && response.ok) {
        const page = z.object({ messages: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/u) })).max(25).default([]) }).parse(await response.clone().json())
        pages.push(page.messages.map(message => message.id))
      }
      return response
    }) as typeof fetch
    const context: GmailContext = { ...input, env: { ...c.env, AMS_GMAIL_AUTOREPLY_ENABLED: "false" }, redis: c.redis, fetcher }
    let result: RefreshVerification
    try {
      await gmailAccessToken(slot, { ...context, onTokenUse: evidence => { token = evidence } })
      if (!token?.refreshed) {
        result = { id, slot, status: "awaiting-expiry", token, notificationSends: 0, automaticReplies: false }
      } else {
        if (!token.persisted) throw new Error("GMAIL_VERIFICATION_PERSISTENCE_FAILED")
        const now = new Date(c.now)
        const first = await runGmailMonitor(slot, structuredClone(snapshot), now, context)
        // Replay the SAME cursor/time window; do not advance a paused worker.
        const replay = structuredClone(snapshot)
        replay.findings = [...new Set([...snapshot.findings, ...(first.discoveries ?? [])])]
        const second = await runGmailMonitor(slot, replay, now, context)
        const discovery = (message: string) => `gmail:${slot}:${createHash("sha256").update(message).digest("hex")}`
        const firstPage = new Set(pages[0] ?? [])
        const repeatedMessages = (pages[1] ?? []).filter(message => firstPage.has(message) && replay.findings.includes(discovery(message))).length
        const dedupPassed = repeatedMessages > 0 && !(second.discoveries ?? []).some(message => replay.findings.includes(message))
        const taskStateUnchanged = JSON.stringify(await store.read(definition.id)) === JSON.stringify(original)
        const prior = snapshot.history.find(run => run.status === "succeeded" && run.result)?.result?.details
        const checkpointPreserved = taskStateUnchanged && original !== null && z.object({ checkpoint: z.number().finite() }).safeParse(prior).success
        const otherGrantUnchanged = JSON.stringify(await c.redis.get(`${c.prefix}${otherSlot}`)) === otherGrant
        result = { id, slot, status: dedupPassed && checkpointPreserved && otherGrantUnchanged && token.accessTokenReplaced ? "passed" : "inconclusive", token, monitoringReadSucceeded: true, checkpointPreserved, taskStateUnchanged, otherGrantUnchanged, repeatedMessages, dedupPassed, notificationSends: 0, automaticReplies: false }
      }
    } catch (error) {
      const code = error instanceof Error && error.message === "GMAIL_VERIFICATION_PERSISTENCE_FAILED" ? error.message : gmailTestFailure(error)
      result = { id, slot, status: "failed", token, code, diagnostic: gmailFailureDiagnostic(error), otherGrantUnchanged: JSON.stringify(await c.redis.get(`${c.prefix}${otherSlot}`)) === otherGrant, taskStateUnchanged: JSON.stringify(await store.read(definition.id)) === JSON.stringify(original), notificationSends: 0, automaticReplies: false }
    }
    await c.redis.set(key, JSON.stringify(result), { ex: 30 * 86400 })
    return result
  } finally { await store.release(definition.id, lease) }
}
