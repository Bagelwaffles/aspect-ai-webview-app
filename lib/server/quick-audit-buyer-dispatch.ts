/**
 * Protected Preview-only handoff to the existing PR #300 outbox/sender contracts.
 *
 * There is intentionally NO route, cron, provider SDK, public endpoint, or
 * production dispatch here. Requires injected isolated proof/store/outbox,
 * exact owner-only TEST recipient and separately authenticated sender.
 * No live Stripe key, no real buyer email, and no automatic retry.
 */
import type { NativeQuickAuditResult, QuickAuditResultStore } from "./quick-audit-native"
import { prepareVerifiedBuyerQuickAuditEmail } from "./quick-audit-buyer-delivery"

const FROM = "kimberley@aspectmarketingsolutions.app"
const FROM_NAME = "Aspect Marketing Solutions"
const PREVIEW_BRANCH = "feat/ams-audit-buyer-link-integration-20261029"

type AuditDeliveryState = "queued" | "sending" | "submitted" | "delivered" | "failed" | "uncertain"
type DeliveryRecord = {
  auditId: string
  requestId: string
  checkoutSessionId: string
  recipient: string
  state: AuditDeliveryState
  createdAt: string
  attemptId?: string
  providerMessageId?: string
  lastErrorCode?: string
}
type Outbox = {
  read(requestId: string): Promise<DeliveryRecord | null>
  claim(requestId: string, flags: { enabled: boolean; ownerOnly: boolean; ownerEmail: string }): Promise<DeliveryRecord | null>
  finish(
    claim: DeliveryRecord,
    outcome: { state: "submitted" | "delivered" | "failed" | "uncertain"; providerMessageId?: string; code?: string },
  ): Promise<boolean>
}
type PaidProof = {
  readSession(id: string): Promise<{
    status: "completed"
    checkoutSessionId: string
    requestId: string
    n8nAuditId: string
  } | null>
}
type TransactionalSender = {
  inspectSender(address: string): Promise<{
    address: string
    displayName: string
    replyToAddress: string
    verificationStatus: "accepted" | "pending" | "missing"
  } | null>
  send(input: {
    recipient: string
    fromAddress: string
    fromName: string
    replyToAddress: string
    subject: string
    plainText: string
  }): Promise<{ messageId: string; fromAddress: string }>
}
type StripeReader = Parameters<typeof prepareVerifiedBuyerQuickAuditEmail>[0]["stripe"]
export type BuyerDispatchResult = "disabled" | "held" | "duplicate" | "submitted" | "uncertain"

/**
 * Only a protected, separately owner-authorized Preview worker should call
 * this. The proof/outbox/sender interfaces match the existing #300 contracts
 * but are injectable so a fake can test the whole flow without network calls.
 */
export async function dispatchApprovedQuickAuditOwnerPreview(input: {
  requestId: string
  env: NodeJS.ProcessEnv
  proof: PaidProof
  outbox: Outbox
  reports: Pick<QuickAuditResultStore, "getByRequestId">
  stripe: StripeReader
  sender: TransactionalSender
  now?: number
}): Promise<BuyerDispatchResult> {
  const { env, requestId } = input
  const owner = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim().toLowerCase() ?? ""
  const now = input.now ?? Date.now()
  const expiresAt = Date.parse(env.AMS_QUICK_AUDIT_BUYER_DISPATCH_UNTIL ?? "")
  // This is deliberately NOT a live-customer-sending path. Production must
  // have a separately reviewed and authorized delivery adapter.
  if (env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== PREVIEW_BRANCH ||
      env.AMS_QUICK_AUDIT_BUYER_DISPATCH_ENABLED !== "true" ||
      env.AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED !== "true" ||
      env.AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED !== "true" ||
      env.AMS_STRIPE_PILOT_ACCOUNT_ID !== "acct_1UTtFMGuhFCl8JHa" ||
      !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - now > 10 * 60_000 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner) ||
      !/^price_[A-Za-z0-9]+$/.test(env.AMS_STRIPE_PILOT_PRICE_ID ?? "")) {
    return "disabled"
  }
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(requestId)) return "held"

  const record = await input.outbox.read(requestId)
  if (!record) return "held"
  if (record.state !== "queued") return "duplicate"
  if (record.requestId !== requestId ||
      record.recipient !== owner ||
      !/^cs_test_[A-Za-z0-9]{8,200}$/.test(record.checkoutSessionId)) return "held"

  const paid = await input.proof.readSession(record.checkoutSessionId)
  if (!paid || paid.status !== "completed" ||
      paid.checkoutSessionId !== record.checkoutSessionId ||
      paid.requestId !== requestId ||
      paid.n8nAuditId !== record.auditId) return "held"

  const report: NativeQuickAuditResult | null = await input.reports.getByRequestId(requestId)
  if (!report || report.requestId !== requestId || report.auditId !== record.auditId) return "held"

  // No claim or message is produced until a fresh Stripe paid-order lookup,
  // exact price and the exact Stripe buyer address have been verified.
  let message: Awaited<ReturnType<typeof prepareVerifiedBuyerQuickAuditEmail>>
  try {
    message = await prepareVerifiedBuyerQuickAuditEmail({
      sessionId: record.checkoutSessionId,
      expectedPriceId: env.AMS_STRIPE_PILOT_PRICE_ID!,
      expectedLivemode: false,
      signingSecret: env.AMS_QUICK_AUDIT_REPORT_ACCESS_SECRET,
      reportBaseUrl: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined,
      report,
      stripe: input.stripe,
      now: input.now,
    })
  } catch {
    return "held"
  }
  if (message.recipient !== owner ||
      message.requestId !== requestId ||
      message.auditId !== record.auditId ||
      message.checkoutSessionId !== record.checkoutSessionId) return "held"

  try {
    const identity = await input.sender.inspectSender(FROM)
    if (!identity ||
        identity.verificationStatus !== "accepted" ||
        identity.address.trim().toLowerCase() !== FROM ||
        identity.displayName.trim() !== FROM_NAME ||
        identity.replyToAddress.trim().toLowerCase() !== FROM) return "held"
  } catch {
    return "held"
  }

  // The existing #300 outbox implements Redis compare-and-set. A claimed or
  // uncertain send must never be automatically replayed by this function.
  const claim = await input.outbox.claim(requestId, { enabled: true, ownerOnly: true, ownerEmail: owner })
  if (!claim) return "duplicate"
  if (claim.state !== "sending" ||
      claim.requestId !== requestId ||
      claim.checkoutSessionId !== record.checkoutSessionId ||
      claim.recipient !== owner ||
      claim.auditId !== record.auditId ||
      !claim.attemptId) {
    // A suspicious claim must not send. Leave it marked uncertain for review.
    if (claim.state === "sending" && claim.attemptId) {
      await input.outbox.finish(claim, { state: "uncertain", code: "CLAIM_MISMATCH" }).catch(() => undefined)
    }
    return "uncertain"
  }
  try {
    const response = await input.sender.send({
      recipient: message.recipient,
      fromAddress: FROM,
      fromName: FROM_NAME,
      replyToAddress: FROM,
      subject: message.subject,
      plainText: message.plainText,
    })
    if (!response.messageId?.trim() ||
        response.fromAddress.trim().toLowerCase() !== FROM) throw new Error("SENDER_RECEIPT_UNVERIFIED")
    const saved = await input.outbox.finish(claim, { state: "submitted", providerMessageId: response.messageId })
    return saved ? "submitted" : "uncertain"
  } catch {
    await input.outbox.finish(claim, { state: "uncertain", code: "SEND_OUTCOME_UNKNOWN" }).catch(() => undefined)
    return "uncertain"
  }
}
