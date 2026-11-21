import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { gmailAccessToken, gmailConfig, ownerGmailContext, type GmailContext } from "./owner-gmail"
import { gmailProviderFailure } from "./owner-gmail-diagnostics"

export function verifyMonitorSignature(body: string, signature: string | null, secret: string | undefined) {
  if (!secret || !signature || !/^[a-f0-9]{64}$/u.test(signature)) return false
  return timingSafeEqual(Buffer.from(signature, "hex"), createHmac("sha256", secret).update(body).digest())
}

const eventSchema = z.object({ source: z.literal("ams-scheduled-tasks"), id: z.union([z.string().uuid(), z.string().regex(/^[a-f0-9]{64}$/u)]), task: z.string().max(200), severity: z.enum(["critical", "actionable"]), createdAt: z.string().nullable(), summary: z.string().nullable(), details: z.unknown() })
const gmailId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/u)
const receiptSchema = z.object({
  status: z.enum(["uncertain", "failed", "submitted", "delivered"]),
  messageId: z.string(),
  deliveryId: z.string().optional(),
  attempt: z.string().uuid().optional(),
  providerId: gmailId.optional(),
})
type Receipt = z.infer<typeof receiptSchema>
const sentSchema = z.object({ id: gmailId })
const senderMetadataSchema = z.object({
  id: gmailId,
  labelIds: z.array(z.string()).default([]),
  payload: z.object({ headers: z.array(z.object({ name: z.string(), value: z.string() })).default([]) }).optional(),
})
const replaceClaim = "if redis.call('get',KEYS[1]) == ARGV[1] then redis.call('set',KEYS[1],ARGV[2]); return 1 end return 0"
const rejectionProof = z.object({ id: z.string(), code: z.literal("GMAIL_SEND_UNCONFIRMED"), diagnostic: z.object({ operation: z.literal("send"), httpStatus: z.number().int().min(300).max(599) }) })

export async function deliverGmailAlert(raw: unknown, idempotency: string | null, input: GmailContext = {}) {
  const event = eventSchema.parse(raw)
  if (idempotency !== event.id) throw new Error("GMAIL_DELIVERY_ID_INVALID")
  const c = ownerGmailContext(input), config = gmailConfig("primary", c.env)
  if (c.env.AMS_GMAIL_SEND_ENABLED !== "true") throw new Error("GMAIL_SEND_DISABLED")
  const key = `${c.prefix}delivery:${event.id}`
  const messageId = `ams-${createHash("sha256").update(event.id).digest("hex")}@aspectmarketingsolutions.app`
  const stored = await c.redis.get<string>(key)
  const existing: Receipt | null = stored ? receiptSchema.parse(typeof stored === "string" ? JSON.parse(stored) : stored) : null
  if (existing?.status === "delivered") return { delivered: true, deliveryId: existing.deliveryId }

  let retryable = existing?.status === "failed"
  // A legacy uncertain record is only retried with explicit proof of a
  // definite provider rejection; timeouts, absent inbox mail and receipt
  // lookup failures never authorize another send.
  if (existing?.status === "uncertain" && !existing.attempt) {
    const record = await c.redis.get<string>(`${c.prefix}test:${event.id}`)
    const proof = rejectionProof.safeParse(typeof record === "string" ? JSON.parse(record) : record)
    retryable = proof.success && proof.data.id === event.id
  }
  const token = await gmailAccessToken("primary", input)
  const request = (url: string) => c.fetcher(url, {
    headers: { Authorization: `Bearer ${token}` }, redirect: "error",
    cache: "no-store", signal: AbortSignal.timeout(8_000),
  })
  const receiptSuccess = async (inboxId: string) => {
    const deliveryId = `gmail:${inboxId}`
    await c.redis.set(key, JSON.stringify({ status: "delivered", messageId, deliveryId }))
    return { delivered: true, deliveryId }
  }
  const findReceipt = async (record: Receipt | null): Promise<{ delivered: boolean; deliveryId?: string }> => {
    if (record?.status === "delivered") return { delivered: true, deliveryId: record.deliveryId }
    if (record?.providerId) {
      // Gmail may replace a caller-supplied RFC Message-ID. Read the actual
      // Message-ID from the Gmail ID returned by messages.send and only then
      // correlate the distinct self-received inbox copy.
      const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${record.providerId}`)
      url.searchParams.set("format", "metadata")
      url.searchParams.set("metadataHeaders", "Message-ID")
      const response = await request(url.toString())
      if (!response.ok) throw await gmailProviderFailure(response, "receipt", "GMAIL_RECEIPT_UNAVAILABLE")
      const meta = senderMetadataSchema.parse(await response.json())
      if (meta.id !== record.providerId) throw new Error("GMAIL_RECEIPT_UNAVAILABLE")
      if (meta.labelIds.includes("INBOX")) return receiptSuccess(meta.id)
      const rfcId = meta.payload?.headers.find(header => header.name.toLowerCase() === "message-id")?.value.trim() ?? ""
      if (!/^<[A-Za-z0-9._%+=-]{1,180}@[A-Za-z0-9.-]{1,120}>$/u.test(rfcId)) return { delivered: false }
      const inbox = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
      inbox.searchParams.set("q", `in:inbox rfc822msgid:${rfcId.slice(1, -1)}`)
      inbox.searchParams.set("maxResults", "1")
      const received = await request(inbox.toString())
      if (!received.ok) throw await gmailProviderFailure(received, "receipt", "GMAIL_RECEIPT_UNAVAILABLE")
      const page = z.object({ messages: z.array(z.object({ id: gmailId })).max(1).default([]) }).parse(await received.json())
      return page.messages[0] ? receiptSuccess(page.messages[0].id) : { delivered: false }
    }

    // Backwards compatibility for older, possibly unconfirmable send claims.
    // Never resend a legacy ambiguous claim when search fails.
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
    url.searchParams.set("q", `in:inbox rfc822msgid:${messageId}`)
    url.searchParams.set("maxResults", "1")
    const response = await request(url.toString())
    if (!response.ok) throw await gmailProviderFailure(response, "receipt", "GMAIL_RECEIPT_UNAVAILABLE")
    const page = z.object({ messages: z.array(z.object({ id: gmailId })).max(1).default([]) }).parse(await response.json())
    return page.messages[0] ? receiptSuccess(page.messages[0].id) : { delivered: false }
  }

  if (existing && !retryable) return findReceipt(existing)

  // Claim BEFORE sending. A definite send rejection may reopen the claim;
  // a timeout or accepted-but-unconfirmed send MUST NOT be retried.
  const claim = JSON.stringify({ status: "uncertain", messageId, attempt: randomUUID() })
  const claimed = stored
    ? await c.redis.eval(replaceClaim, [key], [typeof stored === "string" ? stored : JSON.stringify(stored), claim]) === 1
    : await c.redis.set(key, claim, { nx: true }) === "OK"
  if (!claimed) {
    const changed = await c.redis.get<string>(key)
    return findReceipt(changed ? receiptSchema.parse(typeof changed === "string" ? JSON.parse(changed) : changed) : null)
  }

  const content = ["An AMS cloud task requires owner review.", `Priority: ${event.severity}`, "Open the protected Scheduled Tasks dashboard for details.", `${new URL(config.redirect).origin}/owner/scheduled-tasks`].join("\r\n")
  // Never forward subjects, senders, message bodies, task prompts or private results.
  const mime = [`From: ${config.primary}`, `To: ${config.primary}`, "Subject: AMS owner task alert", `Message-ID: <${messageId}>`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", content].join("\r\n")
  const response = await c.fetcher("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    redirect: "error", signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
  })
  if (!response.ok) {
    if (response.status >= 300 && response.status <= 599) {
      await c.redis.eval(replaceClaim, [key], [claim, JSON.stringify({ status: "failed", messageId })])
    }
    throw await gmailProviderFailure(response, "send", "GMAIL_SEND_UNCONFIRMED")
  }

  // Gmail's returned immutable message ID is the authoritative identifier.
  // Persist it BEFORE receipt lookup so a failed lookup never resends.
  const sent = sentSchema.safeParse(await response.json().catch(() => null))
  if (!sent.success) return { delivered: false }
  const submitted: Receipt = { status: "submitted", messageId, providerId: sent.data.id }
  const transitioned = await c.redis.eval(replaceClaim, [key], [claim, JSON.stringify(submitted)])
  if (Number(transitioned) !== 1) return { delivered: false }
  return findReceipt(submitted)
}
