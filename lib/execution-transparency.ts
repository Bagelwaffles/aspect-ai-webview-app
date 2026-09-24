import { z } from "zod"

export const EXECUTION_TRANSPARENCY_VERSION = "execution-provenance-v1" as const

export const executionTransparencyPolicySchema = z
  .object({
    discloseAiGeneration: z.literal(true),
    discloseAutomaticVerification: z.literal(true),
    discloseHumanReview: z.literal(true),
    discloseExternalProviders: z.literal(true),
    requireExplicitHumanConsent: z.literal(true),
    requireExplicitExternalProviderConsent: z.literal(true),
    persistConsentDecision: z.literal(true),
  })
  .strict()

export type ExecutionTransparencyPolicy = z.infer<
  typeof executionTransparencyPolicySchema
>

export const DEFAULT_EXECUTION_TRANSPARENCY_POLICY: ExecutionTransparencyPolicy =
  Object.freeze({
    discloseAiGeneration: true,
    discloseAutomaticVerification: true,
    discloseHumanReview: true,
    discloseExternalProviders: true,
    requireExplicitHumanConsent: true,
    requireExplicitExternalProviderConsent: true,
    persistConsentDecision: true,
  })

export const executionConsentStateSchema = z.enum([
  "not-required",
  "granted",
  "not-granted",
])

export type ExecutionConsentState = z.infer<typeof executionConsentStateSchema>

export const executionProvenanceLabelSchema = z.enum([
  "AI_GENERATED",
  "AUTOMATICALLY_VERIFIED",
  "HUMAN_REVIEWED",
  "EXTERNAL_PROVIDER",
  "CUSTOMER_APPROVED",
])

export type ExecutionProvenanceLabel = z.infer<
  typeof executionProvenanceLabelSchema
>

export const executionProvenanceSchema = z
  .object({
    version: z.literal(EXECUTION_TRANSPARENCY_VERSION),
    aiGenerated: z.boolean(),
    automaticallyVerified: z.boolean(),
    humanReviewed: z.boolean(),
    externalProviders: z.array(z.string().trim().min(1).max(160)).max(12),
    customerConsent: z
      .object({
        humanReview: executionConsentStateSchema,
        externalProvider: executionConsentStateSchema,
        recordedAt: z.string().datetime().nullable(),
      })
      .strict(),
    labels: z.array(executionProvenanceLabelSchema).max(5),
  })
  .strict()
  .superRefine((record, context) => {
    const labels = new Set(record.labels)
    const checks: Array<[boolean, ExecutionProvenanceLabel]> = [
      [record.aiGenerated, "AI_GENERATED"],
      [record.automaticallyVerified, "AUTOMATICALLY_VERIFIED"],
      [record.humanReviewed, "HUMAN_REVIEWED"],
      [record.externalProviders.length > 0, "EXTERNAL_PROVIDER"],
      [
        record.customerConsent.humanReview === "granted" ||
          record.customerConsent.externalProvider === "granted",
        "CUSTOMER_APPROVED",
      ],
    ]

    for (const [enabled, label] of checks) {
      if (enabled !== labels.has(label)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Execution provenance label mismatch: ${label}`,
        })
      }
    }

    if (
      record.humanReviewed &&
      record.customerConsent.humanReview !== "granted"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Human review requires explicit customer consent",
      })
    }

    if (
      record.externalProviders.length > 0 &&
      record.customerConsent.externalProvider !== "granted"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "External provider processing requires explicit customer consent",
      })
    }

    const hasConsent =
      record.customerConsent.humanReview === "granted" ||
      record.customerConsent.externalProvider === "granted"
    if (hasConsent !== Boolean(record.customerConsent.recordedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Granted customer consent must have a recorded timestamp",
      })
    }
  })

export type ExecutionProvenance = z.infer<typeof executionProvenanceSchema>

export function hasExplicitExternalProcessingConsent(
  value: string | null | undefined,
): boolean {
  return value?.trim().toLowerCase() === "granted"
}

export function buildExecutionProvenance(input: {
  aiGenerated: boolean
  automaticallyVerified: boolean
  humanReviewed: boolean
  externalProviders?: string[]
  humanReviewConsent?: ExecutionConsentState
  externalProviderConsent?: ExecutionConsentState
  consentRecordedAt?: string | null
}): ExecutionProvenance {
  const externalProviders = [
    ...new Set((input.externalProviders ?? []).map((value) => value.trim()).filter(Boolean)),
  ]
  const humanReview = input.humanReviewConsent ?? "not-required"
  const externalProvider =
    input.externalProviderConsent ??
    (externalProviders.length ? "not-granted" : "not-required")
  const labels: ExecutionProvenanceLabel[] = []

  if (input.aiGenerated) labels.push("AI_GENERATED")
  if (input.automaticallyVerified) labels.push("AUTOMATICALLY_VERIFIED")
  if (input.humanReviewed) labels.push("HUMAN_REVIEWED")
  if (externalProviders.length) labels.push("EXTERNAL_PROVIDER")
  if (humanReview === "granted" || externalProvider === "granted") {
    labels.push("CUSTOMER_APPROVED")
  }

  return executionProvenanceSchema.parse({
    version: EXECUTION_TRANSPARENCY_VERSION,
    aiGenerated: input.aiGenerated,
    automaticallyVerified: input.automaticallyVerified,
    humanReviewed: input.humanReviewed,
    externalProviders,
    customerConsent: {
      humanReview,
      externalProvider,
      recordedAt: input.consentRecordedAt ?? null,
    },
    labels,
  })
}
