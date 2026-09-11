import { z } from "zod"

export const CUSTOMER_ASSET_MAX_BYTES = 250 * 1024 * 1024

const allowedExactTypes = new Set([
  "application/pdf",
  "application/json",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "text/markdown",
])

export function isAllowedCustomerAssetType(contentType: string) {
  const normalized = contentType.trim().toLowerCase()
  return (
    normalized.startsWith("image/") ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("video/") ||
    allowedExactTypes.has(normalized)
  )
}

export const customerAssetUploadRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(180),
    contentType: z.string().trim().min(1).max(120),
    sizeBytes: z.number().int().positive().max(CUSTOMER_ASSET_MAX_BYTES),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!isAllowedCustomerAssetType(value.contentType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentType"],
        message: "Unsupported file type",
      })
    }
  })
