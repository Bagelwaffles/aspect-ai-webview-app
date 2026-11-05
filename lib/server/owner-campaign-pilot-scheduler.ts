import { createHash, timingSafeEqual } from "node:crypto"
import { z } from "zod"

import {
  dispatchOwnerCampaignPilot,
  ownerCampaignPilotSendingAllowed,
  readOwnerCampaignPilot,
  verifyOwnerCampaignPilotReceipt,
  type OwnerCampaignPilotRecord,
} from "./owner-campaign-pilot"
import { ownerGmailContext, type GmailContext } from "./owner-gmail"

const MAX_PER_TICK = 3
const SCAN_BATCHES = 4
const CURSOR_TTL_SECONDS = 86400

/** Preview-only, independent approval switch for unattended owner-inbox tests. */
export function ownerCampaignAutoSendAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return ownerCampaignPilotSendingAllowed(env) &&
    env.AMS_OWNER_CAMPAIGN_AUTOSEND_ENABLED === "true"
}

/** A separate 32+-character secret; never reuse the monitoring or Stripe keys. */
export function authorizedOwnerCampaignWorker(
  authorization: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!ownerCampaignAutoSendAllowed(env)) return false
  const expected = env.AMS_OWNER_CAMPAIGN_WORKER_SECRET?.trim() ?? ""
  if (expected.length < 32 || expected.length > 256) return false
  if (!authorization?.startsWith("Bearer ") || authorization.length > 300) return false
  const presented = authorization.slice(7)
  if (presented.length !== expected.length) return false
  return timingSafeEqual(
    createHash("sha256").update(presented).digest(),
    createHash("sha256").update(expected).digest(),
  )
}

/** No campaign is allowed to advance while a previous send lacks an inbox receipt. */
export function ownerCampaignDueAction(record: OwnerCampaignPilotRecord | null, now: number) {
  if (!record || record.status !== "approved") return "skip" as const
  if (record.sends.some(send => send.state === "unconfirmed")) return "hold" as const
  if (record.sends.some(send => send.state === "accepted")) return "verify" as const
  const next = [0, 1, 2].find(step => !record.sends.some(send => send.step === step))
  if (next === undefined) return "complete" as const
  return Date.parse(record.input.steps[next].dueAt) <= now ? "send" as const : "not_due" as const
}

const SCAN = [
  "local page=redis.call('SCAN',ARGV[1],'MATCH',ARGV[2],'COUNT',100)",
  "return {page[1],page[2]}",
].join("\n")
const ID = z.string().uuid()

/**
 * Process at most three owner-approved pilot campaigns per request.
 * A cursor prevents repeatedly scanning only the first few records.
 * All sender state and per-message NX deduplication remain inside the
 * existing owner-campaign-pilot implementation; no customer mail is sent.
 */
export async function tickOwnerCampaignPilot(input: GmailContext = {}) {
  const c = ownerGmailContext(input)
  if (!ownerCampaignAutoSendAllowed(c.env)) return { status: "disabled" as const }
  const cursorKey = c.prefix + "campaign-pilot:worker:cursor"
  const rawCursor = await c.redis.get<string>(cursorKey)
  let cursor = typeof rawCursor === "string" && /^\d{1,20}$/.test(rawCursor) ? rawCursor : "0"
  const results: Array<{ status: string }> = []
  const visited = new Set<string>()
  for (let i = 0; i < SCAN_BATCHES && results.length < MAX_PER_TICK; i++) {
    const page = await c.redis.eval(SCAN, [], [cursor, c.prefix + "campaign-pilot:v1:*"])
    if (!Array.isArray(page) || page.length !== 2 || !Array.isArray(page[1])) {
      throw new Error("OWNER_CAMPAIGN_SCAN_INVALID")
    }
    cursor = String(page[0])
    for (const raw of page[1]) {
      if (results.length >= MAX_PER_TICK) break
      if (typeof raw !== "string") continue
      const id = raw.slice((c.prefix + "campaign-pilot:v1:").length)
      if (!ID.safeParse(id).success || visited.has(id)) continue
      visited.add(id)
      const record = await readOwnerCampaignPilot(id, input)
      if (!record || !await isOwnerPilotAutosendAuthorized(record, c)) continue
      const action = ownerCampaignDueAction(record, c.now)
      if (action === "send") {
        const outcome = await dispatchOwnerCampaignPilot(id, input)
        results.push({ status: outcome.status })
      } else if (action === "verify") {
        const outcome = await verifyOwnerCampaignPilotReceipt(id, input)
        results.push({ status: outcome.status })
      } else if (action === "hold") {
        results.push({ status: "hold" })
      }
    }
    if (cursor === "0") break
  }
  await c.redis.set(cursorKey, cursor, { ex: CURSOR_TTL_SECONDS })
  return {
    status: "ok" as const,
    checked: visited.size,
    processed: results.length,
    // Deliberately avoid recipient, subject, campaign content and provider IDs.
    outcomes: results.map(r => r.status),
  }
}

// Separate owner approval is required before review-only plans can be scheduled.
// A global feature flag NEVER enrolls all previously reviewed campaigns.
const AUTO_GRANT_TTL = 90 * 86400
const AUTO_GRANT_SCHEMA = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  approvedAt: z.string().datetime(),
}).strict()
function autoGrantKey(prefix: string, id: string) {
  return prefix + "campaign-pilot:autosend:v1:" + id
}
export async function authorizeOwnerPilotAutosend(id: string, input: GmailContext = {}) {
  const c = ownerGmailContext(input)
  if (c.env.VERCEL_ENV !== "preview") throw new Error("OWNER_AUTOSEND_PREVIEW_ONLY")
  const record = await readOwnerCampaignPilot(id, input)
  if (!record || record.status !== "approved" || !record.reviewedAt || record.sends.length) {
    throw new Error("OWNER_AUTOSEND_REVIEW_REQUIRED")
  }
  const primary = c.env.AMS_GMAIL_PRIMARY_EMAIL?.trim().toLowerCase()
  const secondary = c.env.AMS_GMAIL_SECONDARY_EMAIL?.trim().toLowerCase()
  if (!primary || !secondary || primary === secondary ||
      ![primary, secondary].includes(record.input.recipient)) {
    throw new Error("OWNER_AUTOSEND_RECIPIENT_INVALID")
  }
  const grant = {fingerprint: record.fingerprint, approvedAt: new Date(c.now).toISOString()}
  const key = autoGrantKey(c.prefix, id)
  const inserted = await c.redis.set(key, JSON.stringify(grant), {nx: true, ex: AUTO_GRANT_TTL})
  if (inserted !== "OK") {
    const raw = await c.redis.get<unknown>(key)
    const old = AUTO_GRANT_SCHEMA.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw)
    if (!old.success || old.data.fingerprint !== record.fingerprint) {
      throw new Error("OWNER_AUTOSEND_APPROVAL_CONFLICT")
    }
  }
  return {authorized: true}
}
async function isOwnerPilotAutosendAuthorized(record: OwnerCampaignPilotRecord, c: ReturnType<typeof ownerGmailContext>) {
  const raw = await c.redis.get<unknown>(autoGrantKey(c.prefix, record.input.id))
  if (!raw) return false
  const grant = AUTO_GRANT_SCHEMA.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw)
  return grant.success && grant.data.fingerprint === record.fingerprint && record.status === "approved"
}
