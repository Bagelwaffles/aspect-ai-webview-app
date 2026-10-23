/**
 * Resend adapter for future isolated AMS Quick Audit Preview delivery.
 *
 * NOT wired to a public route, cron, or production sender. This file cannot
 * send unless an approved server-only caller instantiates and invokes it with
 * configured credentials. It makes no DNS, payment, or OAuth changes.
 */
import { createHash } from "node:crypto"

import {
  AMS_CUSTOMER_FROM_ADDRESS,
  AMS_CUSTOMER_FROM_NAME,
  type QuickAuditTransactionalSender,
} from "./quick-audit-delivery-worker"

const DOMAIN = "aspectmarketingsolutions.app"
const BASE_URL = "https://api.resend.com"
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ResendSenderOptions = {
  env?: NodeJS.ProcessEnv
  fetcher?: typeof fetch
}

/**
 * Authorization is based on a *fresh provider-side domain lookup*, not an
 * owner-set "verified" boolean. An API key without the necessary domain-read
 * permissions fails closed. A valid inbound Cloudflare forward is not enough.
 */
export function createResendAuditSender({
  env = process.env,
  fetcher = fetch,
}: ResendSenderOptions = {}): QuickAuditTransactionalSender {
  const token = env.AMS_RESEND_API_KEY?.trim()
  const domainId = env.AMS_RESEND_DOMAIN_ID?.trim()
  if (!token || !domainId || !uuid.test(domainId) ||
      env.VERCEL_ENV !== "preview" ||
      env.AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED !== "true") {
    throw new Error("AMS_RESEND_SENDER_NOT_CONFIGURED")
  }

  const headers = { Authorization: `Bearer ${token}` }
  const inspectSender: QuickAuditTransactionalSender["inspectSender"] = async (address) => {
    if (address.trim().toLowerCase() !== AMS_CUSTOMER_FROM_ADDRESS) return null
    try {
      const response = await fetcher(`${BASE_URL}/domains/${domainId}`, {
        method: "GET",
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) return null
      const json: unknown = await response.json()
      if (!json || typeof json !== "object") return null
      const domain = json as Record<string, unknown>
      const capabilities = domain.capabilities as Record<string, unknown> | null | undefined
      if (domain.id !== domainId ||
          domain.name !== DOMAIN ||
          domain.status !== "verified" ||
          !capabilities || capabilities.sending !== "enabled") return null
      return {
        address: AMS_CUSTOMER_FROM_ADDRESS,
        displayName: AMS_CUSTOMER_FROM_NAME,
        replyToAddress: AMS_CUSTOMER_FROM_ADDRESS,
        verificationStatus: "accepted",
      }
    } catch {
      return null
    }
  }

  return {
    inspectSender,
    async send(input) {
      if (input.fromAddress !== AMS_CUSTOMER_FROM_ADDRESS ||
          input.fromName !== AMS_CUSTOMER_FROM_NAME ||
          input.replyToAddress !== AMS_CUSTOMER_FROM_ADDRESS ||
          !input.recipient.trim() ||
          !input.subject.trim() ||
          !input.plainText.trim()) {
        throw new Error("AMS_BUSINESS_SENDER_IDENTITY_REQUIRED")
      }
      // Recheck at point of use. Never assume a successful prior validation
      // remains valid after a DNS change, revoked API key, or domain disable.
      if (!(await inspectSender(AMS_CUSTOMER_FROM_ADDRESS))) {
        throw new Error("AMS_RESEND_DOMAIN_NOT_VERIFIED")
      }
      // Stable per payload, without leaking recipient/content to provider logs
      // in the key. Durable Redis claim in delivery worker remains canonical;
      // Resend's idempotency window is only 24 hours.
      const idempotencyKey = "ams-audit-" + createHash("sha256")
        .update(JSON.stringify({
          recipient: input.recipient.toLowerCase(),
          subject: input.subject,
          content: input.plainText,
        })).digest("hex")

      const response = await fetcher(`${BASE_URL}/emails`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: `${AMS_CUSTOMER_FROM_NAME} <${AMS_CUSTOMER_FROM_ADDRESS}>`,
          to: [input.recipient],
          reply_to: AMS_CUSTOMER_FROM_ADDRESS,
          subject: input.subject,
          text: input.plainText,
        }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error("AMS_RESEND_SEND_UNCONFIRMED")
      const data: unknown = await response.json().catch(() => null)
      if (!data || typeof data !== "object" ||
          typeof (data as { id?: unknown }).id !== "string" ||
          !uuid.test((data as { id: string }).id)) {
        throw new Error("AMS_RESEND_ACCEPTANCE_UNCONFIRMED")
      }
      return {
        messageId: (data as { id: string }).id,
        // Provider does not return a From header on POST /emails; this value
        // reflects the exact request submitted, NOT independent recipient proof.
        fromAddress: AMS_CUSTOMER_FROM_ADDRESS,
      }
    },
  }
}
