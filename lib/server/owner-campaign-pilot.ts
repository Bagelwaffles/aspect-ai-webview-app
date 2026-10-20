import { createHash } from "node:crypto"
import { z } from "zod"

import { gmailAccessToken, gmailConfig, ownerGmailContext, type GmailContext } from "./owner-gmail"

const ID = z.string().uuid()
const HEADER = z.string().trim().min(3).max(120).regex(/^[\x20-\x7e]+$/u)
const BODY = z.string().trim().min(10).max(4000).refine(v => !/[\x00-\x08\x0b\x0e-\x1f\x7f]/u.test(v))
const STEP = z.object({
  subject: HEADER,
  body: BODY,
  dueAt: z.string().datetime({ offset: true }),
}).strict()

const campaignFields = z.object({
  id: ID,
  recipient: z.string().trim().email().max(254),
  steps: z.tuple([STEP, STEP, STEP]),
}).strict()
// Legacy generated inputs remain valid; manual provenance is explicit and cannot
// carry a generation ID or a claimed billing/credit state.
export const ownerCampaignPilotInputSchema = z.union([
  campaignFields.extend({
    sourceRunId: z.string().regex(/^content-run-[A-Za-z0-9-]{8,80}$/u),
  }).strict(),
  campaignFields.extend({
    source: z.object({
      kind: z.literal("owner-authored-preview-test"),
      creditUsage: z.literal("none"),
    }).strict(),
  }).strict(),
])
export type OwnerCampaignPilotInput = z.infer<typeof ownerCampaignPilotInputSchema>

export const ownerCampaignPilotRecordSchema = z.object({
  input: ownerCampaignPilotInputSchema,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  status: z.enum(["draft", "approved", "stopped"]),
  revision: z.number().int().nonnegative(),
  reviewedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sends: z.array(z.object({
    step: z.number().int().min(0).max(2),
    state: z.enum(["accepted", "unconfirmed", "delivered"]),
    providerId: z.string().max(100).nullable(),
    receiptId: z.string().max(100).nullable().optional(),
    at: z.string().datetime(),
  }).strict()).max(3),
}).strict()
export type OwnerCampaignPilotRecord = z.infer<typeof ownerCampaignPilotRecordSchema>
export type PilotDispatchResult =
  | { status: "disabled" | "not_due" | "stopped" | "duplicate" | "unconfirmed" | "receipt_required"; step?: number }
  | { status: "accepted"; step: number; providerId: string }

const RECORD_TTL_SECONDS = 90 * 86400
const SEND_LIMIT = 3
const SENT_ID = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/u) })
const CAS = [
  "local raw=redis.call('GET',KEYS[1])",
  "if not raw then return 0 end",
  "local ok,old=pcall(cjson.decode,raw)",
  "if not ok or old.revision ~= tonumber(ARGV[1]) then return 0 end",
  "redis.call('SET',KEYS[1],ARGV[2],'EX',tonumber(ARGV[3]))",
  "return 1",
].join("\n")

function fingerprint(input: OwnerCampaignPilotInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}
function campaignKey(prefix: string, id: string) { return prefix + "campaign-pilot:v1:" + id }
function parseRecord(raw: unknown): OwnerCampaignPilotRecord | null {
  if (!raw) return null
  return ownerCampaignPilotRecordSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw)
}

export function validateOwnerCampaignPilot(input: unknown, env: NodeJS.ProcessEnv, now: number) {
  const data = ownerCampaignPilotInputSchema.parse(input)
  if ("source" in data) {
    if (env.VERCEL_ENV !== "preview" || env.AMS_GMAIL_CONSENT_MODE !== "testing") {
      throw new Error("CAMPAIGN_MANUAL_SOURCE_PREVIEW_ONLY")
    }
    if (data.steps.some(step => !step.subject.startsWith("[AMS PREVIEW TEST] ") ||
        !step.body.startsWith("Owner-authored Preview test. No AI generation or credits used."))) {
      throw new Error("CAMPAIGN_MANUAL_SOURCE_LABEL_REQUIRED")
    }
  }
  const primary = env.AMS_GMAIL_PRIMARY_EMAIL?.trim().toLowerCase()
  const secondary = env.AMS_GMAIL_SECONDARY_EMAIL?.trim().toLowerCase()
  // Owner-controlled test inboxes only. No mailing lists or customer addresses.
  if (!primary || !secondary || primary === secondary ||
      ![primary, secondary].includes(data.recipient.toLowerCase())) {
    throw new Error("CAMPAIGN_TEST_RECIPIENT_REQUIRED")
  }
  const dates = data.steps.map(step => Date.parse(step.dueAt))
  if (dates.some(ms => !Number.isFinite(ms) ||
    ms < now + 10 * 60_000 || ms > now + 30 * 86400_000)) {
    throw new Error("CAMPAIGN_TEST_DATES_INVALID")
  }
  if (dates.some((ms, index) => index > 0 && ms < dates[index - 1] + 86400_000)) {
    throw new Error("CAMPAIGN_TEST_CADENCE_INVALID")
  }
  return {
    ...data,
    recipient: data.recipient.toLowerCase(),
    steps: data.steps.map(step => ({
      ...step,
      // Store canonical timestamps; the sender does not infer a local timezone.
      dueAt: new Date(step.dueAt).toISOString(),
    })) as OwnerCampaignPilotInput["steps"],
  }
}

export function ownerCampaignPilotSendingAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "preview" &&
    env.AMS_GMAIL_CONSENT_MODE === "testing" &&
    env.AMS_GMAIL_SEND_ENABLED === "true" &&
    env.AMS_OWNER_CAMPAIGN_PILOT_ENABLED === "true"
}

export async function createOwnerCampaignPilot(raw: unknown, input: GmailContext = {}) {
  const c = ownerGmailContext(input)
  const data = validateOwnerCampaignPilot(raw, c.env, c.now)
  const key = campaignKey(c.prefix, data.id)
  const existing = parseRecord(await c.redis.get<unknown>(key))
  const fp = fingerprint(data)
  if (existing) {
    if (existing.fingerprint !== fp) throw new Error("CAMPAIGN_IDEMPOTENCY_CONFLICT")
    return { created: false, record: existing }
  }
  const at = new Date(c.now).toISOString()
  const record: OwnerCampaignPilotRecord = {
    input: data, fingerprint: fp,
    status: "draft", revision: 0, reviewedAt: null,
    createdAt: at, updatedAt: at, sends: [],
  }
  const wrote = await c.redis.set(key, JSON.stringify(record), { nx: true, ex: RECORD_TTL_SECONDS })
  if (wrote === "OK") return { created: true, record }
  const winner = parseRecord(await c.redis.get<unknown>(key))
  if (!winner || winner.fingerprint !== fp) throw new Error("CAMPAIGN_IDEMPOTENCY_CONFLICT")
  return { created: false, record: winner }
}

export async function readOwnerCampaignPilot(id: string, input: GmailContext = {}) {
  const parsed = ID.parse(id)
  const c = ownerGmailContext(input)
  return parseRecord(await c.redis.get<unknown>(campaignKey(c.prefix, parsed)))
}

async function compareSet(c: ReturnType<typeof ownerGmailContext>, record: OwnerCampaignPilotRecord, next: OwnerCampaignPilotRecord) {
  const key = campaignKey(c.prefix, record.input.id)
  const result = await c.redis.eval(CAS, [key], [String(record.revision), JSON.stringify(next), String(RECORD_TTL_SECONDS)])
  if (Number(result) !== 1) throw new Error("CAMPAIGN_REVISION_CONFLICT")
  return next
}

export async function changeOwnerCampaignPilot(
  id: string, action: "approve" | "stop", input: GmailContext = {},
) {
  const c = ownerGmailContext(input)
  const record = await readOwnerCampaignPilot(id, input)
  if (!record) throw new Error("CAMPAIGN_NOT_FOUND")
  if (action === "approve" && record.status !== "draft") throw new Error("CAMPAIGN_ALREADY_REVIEWED")
  if (action === "stop" && record.status === "stopped") return record
  if (action === "approve" && record.sends.length) throw new Error("CAMPAIGN_ALREADY_STARTED")
  const at = new Date(c.now).toISOString()
  return compareSet(c, record, {
    ...record, status: action === "approve" ? "approved" : "stopped",
    reviewedAt: action === "approve" ? at : record.reviewedAt,
    revision: record.revision + 1, updatedAt: at,
  })
}

/**
 * A bounded, explicit owner-initiated PREVIEW test. Never a public sending
 * endpoint. A durable per-step NX claim happens before provider I/O; any
 * ambiguous response is final until independently reconciled. No auto-retry.
 */
export async function dispatchOwnerCampaignPilot(id: string, input: GmailContext = {}): Promise<PilotDispatchResult> {
  const c = ownerGmailContext(input)
  if (!ownerCampaignPilotSendingAllowed(c.env)) return { status: "disabled" }
  const record = await readOwnerCampaignPilot(id, input)
  if (!record || record.status !== "approved") return { status: "stopped" }
  // Never move past a Gmail API acceptance without an independently verified
  // owner-inbox receipt. Unconfirmed sends are blocked for reconciliation.
  if (record.sends.some(sent => sent.state !== "delivered")) {
    return { status: "receipt_required" }
  }
  const nextStep = Array.from({ length: SEND_LIMIT }, (_, i) => i)
    .find(i => !record.sends.some(sent => sent.step === i))
  if (nextStep === undefined) return { status: "stopped" }
  if (Date.parse(record.input.steps[nextStep].dueAt) > c.now) return { status: "not_due" }

  const config = gmailConfig("primary", c.env)
  const token = await gmailAccessToken("primary", input)
  const claimKey = campaignKey(c.prefix, id) + ":step:" + nextStep
  const claim = await c.redis.set(claimKey, "uncertain", { nx: true, ex: RECORD_TTL_SECONDS })
  if (claim !== "OK") return { status: "duplicate", step: nextStep }
  // Re-read the state after the claim, so a stop action cannot race past it.
  const current = await readOwnerCampaignPilot(id, input)
  if (!current || current.status !== "approved") return { status: "stopped" }
  const step = current.input.steps[nextStep]
  const uniqueMessageId = createHash("sha256").update(id + ":" + nextStep).digest("hex")
  const message = [
    "From: Aspect Marketing Solutions <" + config.primary + ">",
    "To: " + current.input.recipient,
    "Subject: " + step.subject,
    "Message-ID: <ams-pilot-" + uniqueMessageId + "@aspectmarketingsolutions.app>",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "X-AMS-Campaign-Pilot: controlled-owner-test",
    "",
    step.body,
  ].join("\r\n")
  let result: PilotDispatchResult = { status: "unconfirmed", step: nextStep }
  try {
    const response = await c.fetcher("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(message).toString("base64url") }),
    })
    if (response.ok) {
      const body = SENT_ID.safeParse(await response.json().catch(() => null))
      if (body.success) result = { status: "accepted", step: nextStep, providerId: body.data.id }
    }
  } catch {
    // A timeout can occur after provider acceptance; do not retry.
  }
  const timestamp = new Date(c.now).toISOString()
  try {
    const fresh = await readOwnerCampaignPilot(id, input)
    if (fresh) await compareSet(c, fresh, {
      ...fresh, revision: fresh.revision + 1, updatedAt: timestamp,
      sends: [...fresh.sends, {
        step: nextStep,
        state: result.status === "accepted" ? "accepted" : "unconfirmed",
        providerId: result.status === "accepted" ? result.providerId : null,
        receiptId: null, at: timestamp,
      }],
    })
  } catch {
    // Claim remains durable; ambiguous persistence never permits resend.
  }
  return result
}


const gmailMetadataSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/u),
  labelIds: z.array(z.string()).default([]),
  payload: z.object({
    headers: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
  }).optional(),
})
const gmailSearchSchema = z.object({
  messages: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/u) })).max(2).default([]),
})
function mailHeader(message: z.infer<typeof gmailMetadataSchema>, key: string) {
  return message.payload?.headers.find(h => h.name.toLowerCase() === key.toLowerCase())?.value?.trim() ?? ""
}
function matchesOneAddress(raw: string, email: string) {
  const matches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? []
  return matches.length === 1 && matches[0].toLowerCase() === email
}

/**
 * Independently verify an owner-inbox copy before advancing a campaign step.
 * A Gmail send HTTP 200 or provider message ID is insufficient evidence.
 * A failed/ambiguous lookup never marks delivery, unlocks the next step,
 * or retries the original send.
 */
export async function verifyOwnerCampaignPilotReceipt(id: string, input: GmailContext = {}) {
  const c = ownerGmailContext(input)
  if (c.env.VERCEL_ENV !== "preview") return { status: "disabled" as const }
  const record = await readOwnerCampaignPilot(id, input)
  if (!record) return { status: "not_found" as const }
  const awaiting = record.sends.find(sent => sent.state === "accepted")
  if (!awaiting?.providerId) return { status: "no_accepted_send" as const }
  const primaryConfig = gmailConfig("primary", c.env)
  const primaryToken = await gmailAccessToken("primary", input)
  const readMetadata = async (token: string, messageId: string) => {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + messageId)
    url.searchParams.set("format", "metadata")
    for (const name of ["Message-ID", "From", "To", "Subject"]) url.searchParams.append("metadataHeaders", name)
    const response = await c.fetcher(url.toString(), {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error("CAMPAIGN_RECEIPT_UNAVAILABLE")
    return gmailMetadataSchema.parse(await response.json())
  }
  // Google may change a sender-supplied RFC Message-ID. Trust the exact
  // header of the actual provider-accepted message instead.
  const submitted = await readMetadata(primaryToken, awaiting.providerId)
  if (submitted.id !== awaiting.providerId ||
      !matchesOneAddress(mailHeader(submitted, "From"), primaryConfig.primary)) {
    throw new Error("CAMPAIGN_SENT_MESSAGE_MISMATCH")
  }
  const rfcId = mailHeader(submitted, "Message-ID")
  if (!/^<[A-Za-z0-9._%+=-]{1,180}@[A-Za-z0-9.-]{1,120}>$/u.test(rfcId)) {
    return { status: "unconfirmed" as const, step: awaiting.step }
  }
  const slot = record.input.recipient === primaryConfig.primary ? "primary" : "secondary"
  const token = slot === "primary" ? primaryToken : await gmailAccessToken("secondary", input)
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
  url.searchParams.set("q", "in:inbox rfc822msgid:" + rfcId.slice(1, -1))
  url.searchParams.set("maxResults", "2")
  const response = await c.fetcher(url.toString(), {
    method: "GET",
    headers: { Authorization: "Bearer " + token },
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error("CAMPAIGN_RECEIPT_UNAVAILABLE")
  const results = gmailSearchSchema.parse(await response.json())
  let receiptId: string | null = null
  for (const item of results.messages) {
    const inbox = await readMetadata(token, item.id)
    if (inbox.id === item.id && inbox.labelIds.includes("INBOX") &&
        mailHeader(inbox, "Message-ID") === rfcId &&
        matchesOneAddress(mailHeader(inbox, "From"), primaryConfig.primary) &&
        matchesOneAddress(mailHeader(inbox, "To"), record.input.recipient) &&
        mailHeader(inbox, "Subject") === record.input.steps[awaiting.step].subject) {
      receiptId = inbox.id
      break
    }
  }
  if (!receiptId) return { status: "unconfirmed" as const, step: awaiting.step }
  const latest = await readOwnerCampaignPilot(id, input)
  if (!latest || latest.status !== "approved") return { status: "stopped" as const }
  const matching = latest.sends.find(sent =>
    sent.step === awaiting.step && sent.state === "accepted" && sent.providerId === awaiting.providerId)
  if (!matching) return { status: "stale" as const }
  const now = new Date(c.now).toISOString()
  const next: OwnerCampaignPilotRecord = {
    ...latest, revision: latest.revision + 1, updatedAt: now,
    sends: latest.sends.map(sent =>
      sent.step === awaiting.step ? { ...sent, state: "delivered" as const, receiptId } : sent),
  }
  await compareSet(c, latest, ownerCampaignPilotRecordSchema.parse(next))
  return { status: "delivered" as const, step: awaiting.step }
}
