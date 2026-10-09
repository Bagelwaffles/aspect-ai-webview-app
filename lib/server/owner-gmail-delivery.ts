import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { gmailAccessToken, gmailConfig, ownerGmailContext, type GmailContext } from "./owner-gmail"
import { gmailProviderFailure } from "./owner-gmail-diagnostics"
export function verifyMonitorSignature(body: string, signature: string | null, secret: string | undefined) {
  if (!secret || !signature || !/^[a-f0-9]{64}$/u.test(signature)) return false
  return timingSafeEqual(Buffer.from(signature, "hex"), createHmac("sha256", secret).update(body).digest())
}
const eventSchema = z.object({ source: z.literal("ams-scheduled-tasks"), id: z.union([z.string().uuid(), z.string().regex(/^[a-f0-9]{64}$/u)]), task: z.string().max(200), severity: z.enum(["critical", "actionable"]), createdAt: z.string().nullable(), summary: z.string().nullable(), details: z.unknown() })
const receiptSchema = z.object({ status: z.enum(["uncertain", "failed", "delivered"]), messageId: z.string(), deliveryId: z.string().optional(), attempt: z.string().uuid().optional() })
const replaceClaim = "if redis.call('get',KEYS[1]) == ARGV[1] then redis.call('set',KEYS[1],ARGV[2]); return 1 end return 0"
const rejectionProof = z.object({ id: z.string(), code: z.literal("GMAIL_SEND_UNCONFIRMED"), diagnostic: z.object({ operation: z.literal("send"), httpStatus: z.number().int().min(300).max(599) }) })
export async function deliverGmailAlert(raw: unknown, idempotency: string | null, input: GmailContext = {}) {
  const event = eventSchema.parse(raw)
  if (idempotency !== event.id) throw new Error("GMAIL_DELIVERY_ID_INVALID")
  const c = ownerGmailContext(input), config = gmailConfig("primary", c.env)
  if (c.env.AMS_GMAIL_SEND_ENABLED !== "true") throw new Error("GMAIL_SEND_DISABLED")
  const key = `${c.prefix}delivery:${event.id}`
  const messageId = `ams-${createHash("sha256").update(event.id).digest("hex")}@aspectmarketingsolutions.app`
  const existing = await c.redis.get<string>(key)
  let retryable = false
  if (existing) {
    const receipt = receiptSchema.parse(typeof existing === "string" ? JSON.parse(existing) : existing)
    if (receipt.status === "delivered") return { delivered: true, deliveryId: receipt.deliveryId }
    retryable = receipt.status === "failed"
    // Upgrade only legacy claims whose protected owner-test record proves a
    // received send rejection. Never infer rejection from an empty inbox.
    if (receipt.status === "uncertain" && !receipt.attempt) {
      const record = await c.redis.get<string>(`${c.prefix}test:${event.id}`)
      const proof = rejectionProof.safeParse(typeof record === "string" ? JSON.parse(record) : record)
      retryable = proof.success && proof.data.id === event.id
    }
  }
  const token = await gmailAccessToken("primary", input)
  const findReceipt = async () => {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
    url.searchParams.set("q", `in:inbox rfc822msgid:${messageId}`); url.searchParams.set("maxResults", "1")
    const response = await c.fetcher(url.toString(), { headers: { Authorization: `Bearer ${token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000) })
    if (!response.ok) throw await gmailProviderFailure(response, "receipt", "GMAIL_RECEIPT_UNAVAILABLE")
    const data = z.object({ messages: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/u) })).max(1).default([]) }).parse(await response.json())
    const id = data.messages[0]?.id
    if (!id) return { delivered: false }
    const deliveryId = `gmail:${id}`
    await c.redis.set(key, JSON.stringify({ status: "delivered", messageId, deliveryId }))
    return { delivered: true, deliveryId }
  }
  // Gmail has no send idempotency API. Persist the uncertain state BEFORE sending.
  // A received rejection is retryable; unknown outcomes reconcile receipts only.
  if (existing && !retryable) return findReceipt()
  const claim = JSON.stringify({ status: "uncertain", messageId, attempt: randomUUID() })
  const claimed = existing
    ? await c.redis.eval(replaceClaim, [key], [typeof existing === "string" ? existing : JSON.stringify(existing), claim]) === 1
    : await c.redis.set(key, claim, { nx: true }) === "OK"
  if (!claimed) return findReceipt()
  const content = ["An AMS cloud task requires owner review.", `Priority: ${event.severity}`, "Open the protected Scheduled Tasks dashboard for details.", `${new URL(config.redirect).origin}/owner/scheduled-tasks`].join("\r\n")
  // Never forward email subjects, senders, message bodies, task prompts or private results.
  const mime = [`From: ${config.primary}`, `To: ${config.primary}`, "Subject: AMS owner task alert", `Message-ID: <${messageId}>`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", content].join("\r\n")
  const response = await c.fetcher("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(8_000), body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }) })
  if (!response.ok) {
    // Persist the definitive outcome before reading diagnostics. Compare the
    // attempt claim so a stale sender cannot overwrite a newer attempt/receipt.
    if (response.status >= 300 && response.status <= 599) await c.redis.eval(replaceClaim, [key], [claim, JSON.stringify({ status: "failed", messageId })])
    throw await gmailProviderFailure(response, "send", "GMAIL_SEND_UNCONFIRMED")
  }
  // A successful send HTTP request does not establish delivery to the inbox.
  return findReceipt()
}
