/**
 * Read-only preparation for a *future* approved customer Resend sender.
 *
 * This module neither sends messages nor modifies Stripe, Redis or the outbox.
 * The existing PR #300 Preview sender is owner-only; never bypass it by
 * calling Resend directly from here. Deliver only after independently
 * authorizing a customer outbox claim.
 */
import type Stripe from "stripe"

import type { NativeQuickAuditResult } from "./quick-audit-native"
import {
  createBuyerReportAccessToken,
  isBuyerReportAccessConfigured,
} from "./quick-audit-report-access"

const CANONICAL_SITE = "https://www.aspectmarketingsolutions.app"
const APPROVED_PREVIEW_HOST = /^aspect-ai-overlord-[a-z0-9]+-kimberleyaversbiz-4131s-projects\\.vercel\\.app$/u

function verifiedReportOrigin(expectedLivemode: boolean, reportBaseUrl: string | undefined): string {
  if (expectedLivemode) {
    if (reportBaseUrl && reportBaseUrl !== CANONICAL_SITE) throw new Error("AUDIT_BUYER_REPORT_ORIGIN_INVALID")
    return CANONICAL_SITE
  }
  if (!reportBaseUrl) throw new Error("AUDIT_BUYER_REPORT_ORIGIN_INVALID")
  let url: URL
  try { url = new URL(reportBaseUrl) } catch { throw new Error("AUDIT_BUYER_REPORT_ORIGIN_INVALID") }
  if (url.protocol !== "https:" ||
      url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash ||
      !APPROVED_PREVIEW_HOST.test(url.hostname)) {
    throw new Error("AUDIT_BUYER_REPORT_ORIGIN_INVALID")
  }
  return url.origin
}

const AUDIT_OFFER = "quick-marketing-audit"

type StripeReader = {
  retrieveCheckoutSession(id: string): Promise<Stripe.Checkout.Session>
  listLineItems(id: string): Promise<Stripe.ApiList<Stripe.LineItem>>
}

export type PreparedBuyerQuickAuditEmail = {
  recipient: string
  auditId: string
  requestId: string
  checkoutSessionId: string
  subject: string
  plainText: string
  /** Sensitive bearer link. Do not log, persist to analytics or include in webhook responses. */
  reportUrl: string
}

/**
 * This must be called only from an approved, authenticated fulfillment worker
 * after the order and result are durably complete. Re-read Stripe directly
 * using the correct account to avoid trusting webhook metadata alone.
 */
export async function prepareVerifiedBuyerQuickAuditEmail(input: {
  sessionId: string
  expectedPriceId: string
  expectedLivemode: boolean
  report: NativeQuickAuditResult
  signingSecret: string | undefined
  /** Source-controlled production site or exact Vercel-provided protected Preview deployment URL. */
  reportBaseUrl?: string
  stripe: StripeReader
  now?: number
}): Promise<PreparedBuyerQuickAuditEmail> {
  const { sessionId, expectedPriceId, expectedLivemode, report, stripe } = input
  if (!/^cs_(?:live|test)_[A-Za-z0-9]{8,200}$/.test(sessionId) ||
      sessionId.startsWith("cs_live_") !== expectedLivemode ||
      !/^price_[A-Za-z0-9]+$/.test(expectedPriceId)) {
    throw new Error("AUDIT_BUYER_DELIVERY_SCOPE_INVALID")
  }
  if (!isBuyerReportAccessConfigured(input.signingSecret)) {
    throw new Error("AUDIT_BUYER_DELIVERY_TOKEN_UNCONFIGURED")
  }
  // Prevent a sandbox token or session ID from being delivered to the LIVE
  // domain, and reject caller-supplied phishing/redirect origins.
  const reportOrigin = verifiedReportOrigin(expectedLivemode, input.reportBaseUrl)
  const session = await stripe.retrieveCheckoutSession(sessionId)
  if (session.id !== sessionId ||
      session.livemode !== expectedLivemode ||
      session.mode !== "payment" ||
      session.status !== "complete" ||
      session.payment_status !== "paid" ||
      session.metadata?.ams_offer !== AUDIT_OFFER ||
      session.amount_total !== 4900 ||
      session.currency?.toLowerCase() !== "usd") {
    throw new Error("AUDIT_BUYER_DELIVERY_PAYMENT_UNVERIFIED")
  }
  const requestId = session.metadata?.ams_request_id?.trim()
  if (!requestId || requestId.length > 200 ||
      report.version !== "native-v1" ||
      report.requestId !== requestId ||
      !/^audit_[a-f0-9]{24}$/.test(report.auditId) ||
      report.findings.length !== 5 ||
      report.sevenDayPlan.length !== 7) {
    throw new Error("AUDIT_BUYER_DELIVERY_REPORT_MISMATCH")
  }
  const lineItems = await stripe.listLineItems(sessionId)
  if (lineItems.has_more ||
      lineItems.data.length !== 1 ||
      lineItems.data[0].price?.id !== expectedPriceId ||
      lineItems.data[0].quantity !== 1) {
    throw new Error("AUDIT_BUYER_DELIVERY_PRICE_MISMATCH")
  }
  const detailEmail = session.customer_details?.email?.trim().toLowerCase()
  const sessionEmail = session.customer_email?.trim().toLowerCase()
  if (detailEmail && sessionEmail && detailEmail !== sessionEmail) {
    throw new Error("AUDIT_BUYER_DELIVERY_RECIPIENT_CONFLICT")
  }
  const recipient = detailEmail || sessionEmail
  if (!recipient || recipient.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("AUDIT_BUYER_DELIVERY_RECIPIENT_UNVERIFIED")
  }

  const token = createBuyerReportAccessToken({
    checkoutSessionId: sessionId,
    requestId,
    buyerEmail: recipient,
  }, input.signingSecret!, input.now)
  const url = new URL("/quick-marketing-audit/thanks", reportOrigin)
  url.searchParams.set("session_id", sessionId)
  // The fragment does not reach the website in an HTTP request. The browser
  // transfers it to an Authorization header and promptly removes it from URL.
  url.hash = new URLSearchParams({ report_token: token }).toString()

  return {
    recipient,
    auditId: report.auditId,
    requestId,
    checkoutSessionId: sessionId,
    subject: "Your AMS Quick Marketing Audit is ready",
    plainText: [
      "Your Aspect Marketing Solutions Quick Marketing Audit is ready.",
      "",
      "Open your private report:",
      url.toString(),
      "",
      "The report link expires after 14 days. It is a private access link: do not forward it.",
      "If you need a replacement after expiry, reply to this email for assistance.",
      "",
      "This email concerns your completed $49 Quick Marketing Audit.",
      "Aspect Marketing Solutions",
    ].join("\n"),
    reportUrl: url.toString(),
  }
}
