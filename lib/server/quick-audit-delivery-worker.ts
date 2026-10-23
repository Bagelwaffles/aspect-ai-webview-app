/**
 * Preview-only Quick Audit transactional delivery worker core.
 *
 * This module NEVER owns Gmail credentials, registers a Cron job, or sends
 * customer emails. An approved authenticated owner-only Preview adapter must
 * provide the sender. The default policy is disabled.
 */
import { Redis } from "@upstash/redis"

import {
  QuickAuditDeliveryOutbox,
} from "./quick-audit-delivery-outbox"
import {
  RedisQuickAuditResultStore,
  type NativeQuickAuditResult,
  type QuickAuditResultStore,
} from "./quick-audit-native"

type PaidCompletion = {
  status: "completed"
  checkoutSessionId: string
  requestId: string
  n8nAuditId: string
}

export interface PaidQuickAuditProof {
  readSession(checkoutSessionId: string): Promise<PaidCompletion | null>
}
export interface QuickAuditTransactionalSender {
  /** Provider acceptance ID is not proof of recipient inbox delivery. */
  send(input: { recipient: string; subject: string; plainText: string }): Promise<{ messageId: string }>
}
export type QuickAuditDeliveryOutcome =
  | { status: "disabled" | "held" | "duplicate" | "submitted" | "uncertain" }

type StoreReader = { get<T = unknown>(key: string): Promise<T | null> }
function createRedis(): StoreReader | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  return url && token ? new Redis({ url, token }) : null
}
export class RedisPaidQuickAuditProof implements PaidQuickAuditProof {
  constructor(private readonly redis: StoreReader | null = createRedis()) {}
  async readSession(id: string): Promise<PaidCompletion | null> {
    if (!/^cs_test_[A-Za-z0-9]{8,200}$/.test(id)) return null
    if (!this.redis) throw new Error("QUICK_AUDIT_DELIVERY_STORE_UNAVAILABLE")
    const raw = await this.redis.get<unknown>(`ams:quick-audit:session:${id}`)
    let parsed: unknown = raw
    if (typeof raw === "string") {
      try { parsed = JSON.parse(raw) } catch { return null }
    }
    if (!parsed || typeof parsed !== "object") return null
    const candidate = parsed as Partial<PaidCompletion>
    return candidate.status === "completed" &&
      candidate.checkoutSessionId === id &&
      typeof candidate.requestId === "string" &&
      typeof candidate.n8nAuditId === "string"
      ? candidate as PaidCompletion
      : null
  }
}

/** Text-only delivery: no HTML injection, external image tracking, or insecure report URL. */
export function renderQuickAuditPlainText(result: NativeQuickAuditResult): string {
  const findingLines = result.findings.map((finding, index) =>
    `${index + 1}. ${finding.title}\nObservation: ${finding.observation}\nRecommended fix: ${finding.fix}`
  )
  const planLines = result.sevenDayPlan.map(day => `Day ${day.day}: ${day.action}`)
  return [
    "ASPECT MARKETING SOLUTIONS — QUICK MARKETING AUDIT",
    `Business: ${result.businessName}`,
    `Website: ${result.websiteUrl}`,
    `Industry: ${result.industry}`,
    `Business goal: ${result.goal}`,
    `Audit reference: ${result.auditId}`,
    `Generated: ${result.generatedAt}`,
    "",
    "WHAT'S WORKING",
    ...(result.strengths.length ? result.strengths : ["No strengths were automatically confirmed by this website scan."]),
    "",
    "FIVE PRIORITY FINDINGS AND RECOMMENDED FIXES",
    ...findingLines,
    "",
    "SUGGESTED HEADLINE",
    result.improvedHeadline,
    "",
    "SUGGESTED OFFER",
    result.improvedOffer,
    "",
    "SUGGESTED PROMOTIONAL POST",
    result.promotionalPost,
    "",
    "YOUR SEVEN-DAY ACTION PLAN",
    ...planLines,
    "",
    "Note: Automated website checks are limited signals, not a complete human review or a guarantee of results.",
    "Reply to this message if you need help understanding your audit.",
    "Aspect Marketing Solutions",
  ].join("\n\n")
}

export async function deliverQuickAuditOwnerPreview(input: {
  requestId: string
  sender: QuickAuditTransactionalSender
  env?: NodeJS.ProcessEnv
  outbox?: QuickAuditDeliveryOutbox
  proof?: PaidQuickAuditProof
  reports?: QuickAuditResultStore
}): Promise<QuickAuditDeliveryOutcome> {
  const env = input.env ?? process.env
  // Never infer a production customer-send permission from this owner test.
  if (env.VERCEL_ENV !== "preview" ||
      env.AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED !== "true") {
    return { status: "disabled" }
  }
  const ownerEmail = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim().toLowerCase() ?? ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return { status: "disabled" }

  const outbox = input.outbox ?? new QuickAuditDeliveryOutbox()
  const proofStore = input.proof ?? new RedisPaidQuickAuditProof()
  const reportStore = input.reports ?? new RedisQuickAuditResultStore()
  const pending = await outbox.read(input.requestId)
  if (!pending) return { status: "held" }
  if (pending.state !== "queued") return { status: "duplicate" }
  if (pending.recipient !== ownerEmail || !pending.checkoutSessionId.startsWith("cs_test_")) {
    return { status: "held" }
  }

  // Independent durable evidence: Stripe webhook completion record PLUS report.
  const settled = await proofStore.readSession(pending.checkoutSessionId)
  if (!settled || settled.status !== "completed" ||
      settled.checkoutSessionId !== pending.checkoutSessionId ||
      settled.requestId !== pending.requestId ||
      settled.n8nAuditId !== pending.auditId) {
    return { status: "held" }
  }
  const report = await reportStore.getByRequestId(pending.requestId)
  if (!report || report.requestId !== pending.requestId ||
      report.auditId !== pending.auditId || report.version !== "native-v1" ||
      report.findings.length !== 5 || report.sevenDayPlan.length !== 7) {
    return { status: "held" }
  }

  const claim = await outbox.claim(pending.requestId, {
    enabled: true, ownerOnly: true, ownerEmail,
  })
  if (!claim) return { status: "duplicate" }
  try {
    const response = await input.sender.send({
      recipient: ownerEmail,
      subject: `Your AMS Quick Marketing Audit — ${report.auditId}`,
      plainText: renderQuickAuditPlainText(report),
    })
    if (!response.messageId?.trim()) throw new Error("PROVIDER_ACCEPTANCE_UNKNOWN")
    const persisted = await outbox.finish(claim, {
      state: "submitted", providerMessageId: response.messageId,
    })
    return { status: persisted ? "submitted" : "uncertain" }
  } catch {
    // An ambiguous provider response must NEVER cause a second automatic email.
    await outbox.finish(claim, { state: "uncertain", code: "SEND_OUTCOME_UNKNOWN" })
      .catch(() => undefined)
    return { status: "uncertain" }
  }
}
