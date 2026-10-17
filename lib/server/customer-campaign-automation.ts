import { z } from "zod"

/**
 * Draft scheduling for customer Email Campaign / Nurture outputs.
 * This module never enrolls a recipient or sends messages.
 * Future dispatch requires its own consent, connection, and unsubscribe gates.
 */
export const customerCampaignAutomationInputSchema = z.object({
  idempotencyKey: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/),
  kind: z.enum(["email-campaign", "nurture"]),
  title: z.string().trim().min(3).max(120),
  sourceRunId: z.string().regex(/^content-run-[a-f0-9-]{36}$/),
  startAt: z.string().datetime({ offset: true }),
  sequenceLength: z.union([z.literal(3), z.literal(5), z.literal(7)]),
  cadenceDays: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(7)]),
}).strict()

export type CustomerCampaignAutomationInput = z.infer<typeof customerCampaignAutomationInputSchema>
export const customerCampaignAutomationStatusSchema = z.enum(["draft", "reviewed", "paused"])
export type CustomerCampaignAutomationStatus = z.infer<typeof customerCampaignAutomationStatusSchema>

export const customerCampaignAutomationRecordSchema = z.object({
  id: z.string().uuid(),
  ownerSubject: z.string().min(1),
  idempotencyKey: customerCampaignAutomationInputSchema.shape.idempotencyKey,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  kind: customerCampaignAutomationInputSchema.shape.kind,
  title: customerCampaignAutomationInputSchema.shape.title,
  sourceRunId: customerCampaignAutomationInputSchema.shape.sourceRunId,
  sourceRunUpdatedAt: z.string().datetime(),
  sequenceLength: customerCampaignAutomationInputSchema.shape.sequenceLength,
  cadenceDays: customerCampaignAutomationInputSchema.shape.cadenceDays,
  startAt: z.string().datetime(),
  preview: z.array(z.object({
    step: z.number().int().positive().max(7),
    dueAt: z.string().datetime(),
    action: z.literal("review-only"),
  }).strict()).min(3).max(7),
  status: customerCampaignAutomationStatusSchema,
  deliveryEnabled: z.literal(false),
  recipientCount: z.literal(0),
  reviewedAt: z.string().datetime().nullable(),
  pausedAt: z.string().datetime().nullable(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()
export type CustomerCampaignAutomationRecord = z.infer<typeof customerCampaignAutomationRecordSchema>

/** Enforces a bounded UTC plan, with no real dispatch side effects. */
export function buildCustomerCampaignPreview(
  input: CustomerCampaignAutomationInput,
  now = new Date(),
): CustomerCampaignAutomationRecord["preview"] {
  const data = customerCampaignAutomationInputSchema.parse(input)
  const start = Date.parse(data.startAt)
  if (!Number.isFinite(start) ||
      start < now.getTime() + 10 * 60_000 ||
      start > now.getTime() + 90 * 86_400_000) {
    throw new Error("AUTOMATION_START_TIME_OUT_OF_RANGE")
  }
  const preview = Array.from({ length: data.sequenceLength }, (_, i) => ({
    step: i + 1,
    dueAt: new Date(start + i * data.cadenceDays * 86_400_000).toISOString(),
    action: "review-only" as const,
  }))
  return customerCampaignAutomationRecordSchema.shape.preview.parse(preview)
}

export function toCustomerCampaignAutomation(
  record: CustomerCampaignAutomationRecord,
): Omit<CustomerCampaignAutomationRecord, "ownerSubject" | "idempotencyKey" | "fingerprint"> {
  const { ownerSubject: _owner, idempotencyKey: _key, fingerprint: _fp, ...safe } =
    customerCampaignAutomationRecordSchema.parse(record)
  return safe
}
