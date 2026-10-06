import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { gmailAccessToken, gmailConfig, ownerGmailContext, type GmailContext } from "./owner-gmail"
export function verifyMonitorSignature(body: string, signature: string | null, secret: string | undefined) {
  if (!secret || !signature || !/^[a-f0-9]{64}$/u.test(signature)) return false
  return timingSafeEqual(Buffer.from(signature, "hex"), createHmac("sha256", secret).update(body).digest())
}
const eventSchema = z.object({ source: z.literal("ams-scheduled-tasks"), id: z.string().uuid(), task: z.string().max(200), severity: z.enum(["critical", "actionable"]), createdAt: z.string().nullable(), summary: z.string().nullable(), details: z.unknown() })
const receiptSchema = z.object({ status: z.enum(["uncertain", "delivered"]), messageId: z.string(), deliveryId: z.string().optional() })
export async function deliverGmailAlert(raw: unknown, idempotency: string | null, input: GmailContext = {}) {
  const event = eventSchema.parse(raw)
  if (idempotency !== event.id) throw new Error("GMAIL_DELIVERY_ID_INVALID")
  const c = ownerGmailContext(input), config = gmailConfig("primary", c.env)
  if (c.env.AMS_GMAIL_SEND_ENABLED !== "true") throw new Error("GMAIL_SEND_DISABLED")
  const key = `${c.prefix}delivery:${event.id}`
  const messageId = `ams-${createHash("sha256").update(event.id).digest("hex")}@aspectmarketingsolutions.app`
  const existing = await c.redis.get<string>(key)
  if (existing) {
    const receipt = receiptSchema.parse(typeof existing === "string" ? JSON.parse(existing) : existing)
    if (receipt.status === "delivered") return { delivered: true, deliveryId: receipt.deliveryId }
  }
  const token = await gmailAccessToken("primary", input)
  const findReceipt = async () => {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
    url.searchParams.set("q", `in:inbox rfc822msgid:${messageId}`); url.searchParams.set("maxResults", "1")
    const response = await c.fetcher(url.toString(), { headers: { Authorization: `Bearer ${token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000) })
    if (!response.ok) throw new Error("GMAIL_RECEIPT_UNAVAILABLE")
    const data = z.object({ messages: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/u) })).max(1).default([]) }).parse(await response.json())
    const id = data.messages[0]?.id
    if (!id) return { delivered: false }
    const deliveryId = `gmail:${id}`
    await c.redis.set(key, JSON.stringify({ status: "delivered", messageId, deliveryId }))
    return { delivered: true, deliveryId }
  }
  // Gmail has no send idempotency API. Persist the uncertain state BEFORE sending.
  // Retries reconcile the inbox receipt only; they never resend ambiguous requests.
  if (existing) return findReceipt()
  const claimed = await c.redis.set(key, JSON.stringify({ status: "uncertain", messageId }), { nx: true })
  if (claimed !== "OK") return findReceipt()
  const content = ["An AMS cloud task requires owner review.", `Priority: ${event.severity}`, "Open the protected Scheduled Tasks dashboard for details.", `${new URL(config.redirect).origin}/owner/scheduled-tasks`].join("\r\n")
  // Never forward email subjects, senders, message bodies, task prompts or private results.
  const mime = [`From: ${config.primary}`, `To: ${config.primary}`, "Subject: AMS owner task alert", `Message-ID: <${messageId}>`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", content].join("\r\n")
  const response = await c.fetcher("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(8_000), body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }) })
  if (!response.ok) throw new Error("GMAIL_SEND_UNCONFIRMED")
  // A successful send HTTP request does not establish delivery to the inbox.
  return findReceipt()
}
