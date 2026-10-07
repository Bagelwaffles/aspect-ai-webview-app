import { createHash } from "node:crypto"
import { z } from "zod"
import { gmailConfig, ownerGmailContext, type GmailContext, type GmailSlot } from "./owner-gmail"

type Header = { name: string; value: string }
export type AutoReplyDecision = "disabled" | "ineligible" | "stale" | "duplicate" | "rate-limited" | "accepted" | "unconfirmed"

const ID_PATTERN = /^<[^<>\s]{3,200}>$/u
const ADDRESS_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu
const SUBJECT_BRAND = /aspect marketing|quick marketing audit|aspectmarketingsolutions|(?:^|\W)AMS(?:\W|$)/iu
const SUBJECT_INQUIRY = /\b(?:inquiry|enquiry|question|help|support|interested|quote|pricing|consultation|demo|marketing audit)\b/iu
const SENSITIVE = /\b(?:refund|cancel|chargeback|dispute|security|payment|billing|invoice|legal|password|account|order|complaint|unsubscribe)\b/iu
const SEND_WINDOW_MS = 2 * 60 * 60_000
const CLAIM_TTL_SECONDS = 90 * 86400
const DAILY_LIMIT = 20
const sentMessageSchema = z.object({ id: z.string().min(1).max(200) })

function header(headers: Header[], name: string) {
  return headers.find(item => item.name.toLowerCase() === name.toLowerCase())?.value ?? ""
}
function addresses(raw: string) {
  return [...raw.matchAll(ADDRESS_PATTERN)].map(match => match[0].toLowerCase())
}

export function eligibleBusinessInquiry(headers: Header[], primaryEmail: string, secondaryEmail: string) {
  const subject = header(headers, "Subject").trim()
  if (!/^[\x20-\x7e]{1,120}$/u.test(subject) || /^(?:re|fw|fwd)\s*:/iu.test(subject)) return null
  if (!SUBJECT_BRAND.test(subject) || !SUBJECT_INQUIRY.test(subject) || SENSITIVE.test(subject)) return null
  const senders = addresses(header(headers, "From"))
  const recipients = addresses(header(headers, "To"))
  if (senders.length !== 1 || recipients.length === 0 || !recipients.includes(primaryEmail.toLowerCase())) return null
  const sender = senders[0]
  if (sender === primaryEmail.toLowerCase() || sender === secondaryEmail.toLowerCase()) return null
  if (/^(?:no-?reply|do-?not-?reply|postmaster|mailer-daemon|bounce|notifications?)@/iu.test(sender)) return null
  const replyTo = header(headers, "Reply-To")
  if (replyTo && (addresses(replyTo).length !== 1 || addresses(replyTo)[0] !== sender)) return null
  if (header(headers, "In-Reply-To") || header(headers, "References") ||
    header(headers, "List-Id") || header(headers, "List-Unsubscribe") ||
    header(headers, "List-Post") || header(headers, "X-Auto-Response-Suppress")) return null
  if (/^(?:bulk|list|junk)/iu.test(header(headers, "Precedence").trim())) return null
  const autoSubmitted = header(headers, "Auto-Submitted").trim().toLowerCase()
  if (autoSubmitted && autoSubmitted !== "no") return null
  const originalMessageId = header(headers, "Message-ID").trim()
  if (!ID_PATTERN.test(originalMessageId)) return null
  return { recipient: sender, subject, originalMessageId }
}

/**
 * Conservative, owner-authorized FIRST-CONTACT acknowledgement only.
 * Does not read message bodies, generate free-form replies, make offers,
 * approve payments, or claim that a human completed any action.
 * A Redis claim is durable BEFORE a send; ambiguous sends are never retried.
 */
export async function maybeAutoReplyToBusinessInquiry(options: {
  slot: GmailSlot
  messageId: string
  threadId?: string
  internalDate: number
  headers: Header[]
  token: string
}, input: GmailContext = {}): Promise<AutoReplyDecision> {
  const env = input.env ?? process.env
  if (options.slot !== "primary" || env.AMS_GMAIL_AUTOREPLY_ENABLED !== "true" ||
    env.AMS_GMAIL_SEND_ENABLED !== "true") return "disabled"
  const c = ownerGmailContext(input)
  const config = gmailConfig("primary", env)
  const eligible = eligibleBusinessInquiry(options.headers, config.primary, env.AMS_GMAIL_SECONDARY_EMAIL ?? "")
  if (!eligible || !/^[A-Za-z0-9_-]{1,200}$/u.test(options.messageId) ||
    !/^[A-Za-z0-9_-]{1,200}$/u.test(options.threadId ?? "")) return "ineligible"
  if (!Number.isFinite(options.internalDate) ||
    options.internalDate > c.now + 300_000 ||
    options.internalDate < c.now - SEND_WINDOW_MS) return "stale"

  const hash = createHash("sha256").update(options.messageId).digest("hex")
  const key = c.prefix + "autoreply:" + hash
  const claim = await c.redis.set(key, JSON.stringify({ status: "uncertain", time: c.now }), { nx: true, ex: CLAIM_TTL_SECONDS })
  if (claim !== "OK") return "duplicate"

  // A strict global daily cap prevents a spoofed inquiry storm from driving sends.
  const date = new Date(c.now).toISOString().slice(0, 10)
  const dailyKey = c.prefix + "autoreply-count:" + date
  const lua = "local n=tonumber(redis.call('get',KEYS[1]) or '0'); if n>=tonumber(ARGV[1]) then return 0 end redis.call('incr',KEYS[1]); redis.call('expire',KEYS[1],ARGV[2]); return 1"
  const admitted = await c.redis.eval(lua, [dailyKey], [String(DAILY_LIMIT), String(2 * 86400)])
  if (Number(admitted) !== 1) {
    await c.redis.set(key, JSON.stringify({ status: "rate-limited", time: c.now }), { ex: CLAIM_TTL_SECONDS })
    return "rate-limited"
  }

  // Subject is ASCII and cannot inject MIME headers. This is a generic receipt,
  // not a personalized answer or order/payment confirmation.
  const replyId = "<ams-auto-" + hash + "@aspectmarketingsolutions.app>"
  const message = [
    "From: Aspect Marketing Solutions <" + config.primary + ">",
    "To: " + eligible.recipient,
    "Subject: Re: " + eligible.subject,
    "Message-ID: " + replyId,
    "In-Reply-To: " + eligible.originalMessageId,
    "References: " + eligible.originalMessageId,
    "Auto-Submitted: auto-replied",
    "X-Auto-Response-Suppress: All",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Thanks for contacting Aspect Marketing Solutions.",
    "",
    "This is an automatic acknowledgement that your inquiry was received.",
    "Your message is available for our team to review. No account, payment,",
    "order or service changes have been made as a result of this email.",
    "",
    "Aspect Marketing Solutions",
  ].join("\r\n")
  try {
    const response = await c.fetcher("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: "Bearer " + options.token, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(message).toString("base64url"), threadId: options.threadId }),
    })
    if (!response.ok) return "unconfirmed"
    const parsed = sentMessageSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) return "unconfirmed"
    await c.redis.set(key, JSON.stringify({ status: "accepted", time: c.now }), { ex: CLAIM_TTL_SECONDS })
    return "accepted"
  } catch {
    // The send may have succeeded despite a timeout. Never resend automatically.
    return "unconfirmed"
  }
}
