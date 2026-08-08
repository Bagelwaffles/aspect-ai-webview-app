import { createHash } from "node:crypto"

import { z } from "zod"

export const FIVERR_QUICK_AUDIT_SLUG = "quick-marketing-audit" as const

export const fiverrNotificationSchema = z
  .object({
    message_id: z.string().trim().min(1).max(512),
    thread_id: z.string().trim().min(1).max(512).optional().nullable(),
    from: z.string().trim().min(3).max(1_000),
    subject: z.string().max(500).default(""),
    snippet: z.string().max(5_000).default(""),
    text: z.string().max(50_000).default(""),
    received_at: z.string().datetime().optional().nullable(),
    labels: z.array(z.string().max(200)).max(100).optional().default([]),
  })
  .strict()

export type FiverrNotificationInput = z.infer<typeof fiverrNotificationSchema>

export type FiverrEventType =
  | "new_order"
  | "requirements_received"
  | "buyer_message"
  | "revision_requested"
  | "deadline_warning"
  | "cancellation"
  | "order_completed"
  | "needs_review"

export type FiverrRecommendedAction =
  | "prepare_fulfillment"
  | "draft_buyer_response"
  | "prepare_revision"
  | "alert_deadline"
  | "record_cancellation"
  | "record_completion"
  | "manual_review"

export interface NormalizedFiverrEvent {
  source: "fiverr_email"
  message_id: string
  thread_id: string | null
  event_id: string
  idempotency_key: string
  sender_address: string
  sender_domain: string
  event_type: FiverrEventType
  recommended_action: FiverrRecommendedAction
  priority: "normal" | "high" | "urgent"
  subject: string
  received_at: string | null
  order_reference: string | null
  buyer_username: string | null
  deadline_at: string | null
  deadline_hint: string | null
  service_slug: typeof FIVERR_QUICK_AUDIT_SLUG | null
  quick_audit_match: boolean
  safe_context: string
  human_approval_required: true
  fiverr_action_allowed: false
  external_payment_allowed: false
  fulfillment?: {
    deliverables: readonly string[]
    required_inputs: readonly string[]
  }
}

const QUICK_AUDIT_DELIVERABLES = [
  "5 marketing problems",
  "5 specific fixes",
  "improved headline",
  "improved offer",
  "1 ready-to-use promotional post",
  "7-day action plan",
] as const

const QUICK_AUDIT_REQUIRED_INPUTS = [
  "business name",
  "website, Facebook page, or other public business URL",
  "product or service",
  "ideal customer",
  "biggest marketing problem",
  "desired result",
] as const

const EVENT_RULES: Array<{
  type: FiverrEventType
  action: FiverrRecommendedAction
  priority: NormalizedFiverrEvent["priority"]
  patterns: RegExp[]
}> = [
  {
    type: "revision_requested",
    action: "prepare_revision",
    priority: "high",
    patterns: [
      /revision\s+(?:was\s+)?requested/i,
      /requested\s+(?:a\s+)?revision/i,
      /needs?\s+(?:a\s+)?revision/i,
    ],
  },
  {
    type: "cancellation",
    action: "record_cancellation",
    priority: "high",
    patterns: [
      /order\s+(?:was\s+)?cancelled/i,
      /order\s+(?:was\s+)?canceled/i,
      /cancellation\s+request/i,
      /cancel\s+(?:the\s+)?order/i,
    ],
  },
  {
    type: "order_completed",
    action: "record_completion",
    priority: "normal",
    patterns: [
      /order\s+(?:is\s+)?complete/i,
      /order\s+(?:was\s+)?completed/i,
      /marked\s+(?:the\s+)?order\s+complete/i,
    ],
  },
  {
    type: "requirements_received",
    action: "prepare_fulfillment",
    priority: "high",
    patterns: [
      /submitted\s+(?:the\s+)?requirements/i,
      /requirements\s+(?:are\s+)?ready/i,
      /requirements\s+(?:were\s+)?received/i,
      /order\s+requirements/i,
    ],
  },
  {
    type: "new_order",
    action: "prepare_fulfillment",
    priority: "high",
    patterns: [
      /new\s+order/i,
      /you\s+(?:have|received)\s+(?:a\s+)?new\s+order/i,
      /placed\s+(?:an\s+)?order/i,
      /order\s+started/i,
    ],
  },
  {
    type: "buyer_message",
    action: "draft_buyer_response",
    priority: "normal",
    patterns: [
      /sent\s+you\s+(?:a\s+)?message/i,
      /new\s+message/i,
      /replied\s+to\s+you/i,
    ],
  },
  {
    type: "deadline_warning",
    action: "alert_deadline",
    priority: "urgent",
    patterns: [
      /delivery\s+(?:is\s+)?due/i,
      /due\s+in\s+\d+\s*(?:hours?|days?)/i,
      /deadline/i,
      /late\s+delivery/i,
    ],
  },
]

const REDACTED_CONTEXT_PATTERNS = [
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_\-]+\b/g,
  /\bwhsec_[A-Za-z0-9_\-]+\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/\-=]+\b/gi,
  /\b(?:password|secret|token|api[_ -]?key)\s*[:=]\s*\S+/gi,
]

function mailboxAddress(value: string): string | null {
  const angle = value.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/)
  const raw = angle?.[1] ?? value.match(/\b([^\s<>]+@[^\s<>]+)\b/)?.[1]
  return raw?.trim().toLowerCase() ?? null
}

export function isFiverrSender(value: string): boolean {
  const address = mailboxAddress(value)
  if (!address) return false
  const domain = address.split("@").at(-1) ?? ""
  return domain === "fiverr.com" || domain.endsWith(".fiverr.com")
}

function redactContext(value: string): string {
  return REDACTED_CONTEXT_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, "[REDACTED]"),
    value,
  )
}

function compactContext(input: FiverrNotificationInput): string {
  const combined = [input.subject, input.snippet, input.text]
    .filter(Boolean)
    .join("\n")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return redactContext(combined).slice(0, 8_000)
}

function classifyEvent(context: string) {
  for (const rule of EVENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(context))) return rule
  }

  return {
    type: "needs_review" as const,
    action: "manual_review" as const,
    priority: "normal" as const,
  }
}

function extractOrderReference(context: string): string | null {
  const fromUrl = context.match(/fiverr\.com\/orders?\/([A-Za-z0-9_-]{6,80})/i)?.[1]
  if (fromUrl) return fromUrl

  const fromLabel = context.match(
    /\border\s*(?:number|no\.?|id|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{5,79})\b/i,
  )?.[1]
  return fromLabel ?? null
}

function extractBuyerUsername(context: string): string | null {
  const patterns = [
    /\b([A-Za-z0-9._-]{2,40})\s+sent\s+you\s+(?:a\s+)?message\b/i,
    /\b([A-Za-z0-9._-]{2,40})\s+placed\s+(?:an\s+)?order\b/i,
    /\bbuyer\s*[:#-]?\s*([A-Za-z0-9._-]{2,40})\b/i,
  ]
  for (const pattern of patterns) {
    const match = context.match(pattern)?.[1]
    if (match) return match
  }
  return null
}

function extractDeadline(context: string, receivedAt: string | null) {
  const sentence = context
    .split(/(?<=[.!?])\s+|\n+/)
    .find((part) => /\b(?:deadline|delivery|due)\b/i.test(part))
  const deadlineHint = sentence?.trim().slice(0, 300) ?? null

  if (!receivedAt) return { deadlineAt: null, deadlineHint }
  const received = new Date(receivedAt)
  if (Number.isNaN(received.getTime())) return { deadlineAt: null, deadlineHint }

  const relative = context.match(/\bdue\s+in\s+(\d{1,3})\s*(hours?|days?)\b/i)
  if (!relative) return { deadlineAt: null, deadlineHint }

  const amount = Number(relative[1])
  const multiplier = relative[2].toLowerCase().startsWith("day") ? 86_400_000 : 3_600_000
  const deadline = new Date(received.getTime() + amount * multiplier)
  return { deadlineAt: deadline.toISOString(), deadlineHint }
}

function isQuickAudit(context: string): boolean {
  return (
    /quick\s+marketing\s+audit/i.test(context) ||
    (/marketing\s+audit/i.test(context) && /7[- ]day/i.test(context)) ||
    (/small\s+business\s+marketing/i.test(context) && /audit/i.test(context))
  )
}

export function normalizeFiverrNotification(raw: unknown): NormalizedFiverrEvent {
  const input = fiverrNotificationSchema.parse(raw)
  const senderAddress = mailboxAddress(input.from)
  if (!senderAddress || !isFiverrSender(senderAddress)) {
    throw new Error("FIVERR_SENDER_NOT_ALLOWED")
  }

  const senderDomain = senderAddress.split("@").at(-1) ?? ""
  const context = compactContext(input)
  const classification = classifyEvent(context)
  const receivedAt = input.received_at ?? null
  const deadline = extractDeadline(context, receivedAt)
  const quickAudit = isQuickAudit(context)
  const eventHash = createHash("sha256")
    .update(`fiverr-email\0${input.message_id}\0${context}`)
    .digest("hex")

  return {
    source: "fiverr_email",
    message_id: input.message_id,
    thread_id: input.thread_id ?? null,
    event_id: `fiverr_${eventHash.slice(0, 24)}`,
    idempotency_key: `fiverr-email-${createHash("sha256").update(input.message_id).digest("hex").slice(0, 48)}`,
    sender_address: senderAddress,
    sender_domain: senderDomain,
    event_type: classification.type,
    recommended_action: classification.action,
    priority: classification.priority,
    subject: input.subject.trim(),
    received_at: receivedAt,
    order_reference: extractOrderReference(context),
    buyer_username: extractBuyerUsername(context),
    deadline_at: deadline.deadlineAt,
    deadline_hint: deadline.deadlineHint,
    service_slug: quickAudit ? FIVERR_QUICK_AUDIT_SLUG : null,
    quick_audit_match: quickAudit,
    safe_context: context,
    human_approval_required: true,
    fiverr_action_allowed: false,
    external_payment_allowed: false,
    ...(quickAudit
      ? {
          fulfillment: {
            deliverables: QUICK_AUDIT_DELIVERABLES,
            required_inputs: QUICK_AUDIT_REQUIRED_INPUTS,
          },
        }
      : {}),
  }
}

export function buildFiverrOperatorBrief(event: NormalizedFiverrEvent) {
  return {
    event_id: event.event_id,
    order_reference: event.order_reference,
    buyer_username: event.buyer_username,
    event_type: event.event_type,
    priority: event.priority,
    recommended_action: event.recommended_action,
    deadline_at: event.deadline_at,
    deadline_hint: event.deadline_hint,
    service_slug: event.service_slug,
    human_approval_required: true,
    prohibited_actions: [
      "do not send Fiverr messages automatically",
      "do not accept or cancel orders automatically",
      "do not click Fiverr links automatically",
      "do not submit deliveries automatically",
      "do not move Fiverr payment or customer communication off-platform",
    ],
    ...(event.fulfillment ? { fulfillment: event.fulfillment } : {}),
  }
}
