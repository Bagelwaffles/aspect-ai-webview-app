import { z } from "zod"

const categories = {
  accessNotConfigured: "api-configuration", SERVICE_DISABLED: "api-configuration",
  insufficientPermissions: "permissions", ACCESS_TOKEN_SCOPE_INSUFFICIENT: "permissions",
  authError: "authentication", AUTH_TOKEN_INVALID: "authentication", invalid_grant: "authentication",
  invalid_client: "oauth-configuration", unauthorized_client: "oauth-configuration",
  rateLimitExceeded: "quota", userRateLimitExceeded: "quota", dailyLimitExceeded: "quota", RATE_LIMIT_EXCEEDED: "quota",
  domainPolicy: "policy", forbidden: "permissions",
  badRequest: "request", invalidArgument: "request",
  backendError: "provider", internalError: "provider", temporarily_unavailable: "provider",
} as const
type Operation = "send" | "receipt" | "token"
type FailureCode = "GMAIL_SEND_UNCONFIRMED" | "GMAIL_RECEIPT_UNAVAILABLE" | "GMAIL_TOKEN_UNAVAILABLE" | "GMAIL_REAUTHORIZE_REQUIRED" | "GMAIL_CONFIG_REQUIRED"
type Reason = keyof typeof categories | "unknown"
export type GmailFailureDiagnostic = Readonly<{
  operation: Operation; httpStatus: number; reason: Reason;
  category: typeof categories[keyof typeof categories] | "unknown"
}>
const bodySchema = z.object({ error: z.union([
  z.string(),
  z.object({
    errors: z.array(z.object({ reason: z.string().optional() })).max(64).optional(),
    details: z.array(z.object({ "@type": z.string().optional(), reason: z.string().optional() })).max(64).optional(),
  }),
]) })

// Provider bodies can include tokens, addresses, message content and project IDs.
// Read at most 16 KiB; only exact allowlisted reason strings survive parsing.
async function providerReason(response: Response): Promise<Reason> {
  const reader = response.body?.getReader()
  if (!reader) return "unknown"
  try {
    let bytes = 0, text = ""
    const decoder = new TextDecoder()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 16_384) return "unknown"
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    const parsed = bodySchema.safeParse(JSON.parse(text))
    if (!parsed.success) return "unknown"
    const error = parsed.data.error
    const reasons = typeof error === "string" ? [error] : [
      ...(error.details ?? []).filter(detail => detail["@type"] === "type.googleapis.com/google.rpc.ErrorInfo").map(detail => detail.reason),
      ...(error.errors ?? []).map(detail => detail.reason),
    ]
    return reasons.find((reason): reason is keyof typeof categories => typeof reason === "string" && Object.hasOwn(categories, reason)) ?? "unknown"
  } catch { return "unknown" }
  finally { await reader.cancel().catch(() => undefined) }
}
class GmailProviderError extends Error {
  constructor(code: FailureCode, readonly diagnostic: GmailFailureDiagnostic) { super(code) }
}
export function gmailFailureDiagnostic(error: unknown) {
  return error instanceof GmailProviderError ? error.diagnostic : undefined
}
export async function gmailProviderFailure(response: Response, operation: Operation, code: FailureCode) {
  const reason = await providerReason(response)
  const diagnostic: GmailFailureDiagnostic = Object.freeze({
    operation, httpStatus: response.status, reason,
    category: reason === "unknown" ? "unknown" : categories[reason],
  })
  // Fixed fields only; never log the exception, request, raw body or identity.
  console.warn("AMS_GMAIL_PROVIDER_FAILURE", JSON.stringify(diagnostic))
  if (operation === "token") {
    if (reason === "invalid_grant") code = "GMAIL_REAUTHORIZE_REQUIRED"
    if (reason === "invalid_client" || reason === "unauthorized_client") code = "GMAIL_CONFIG_REQUIRED"
  }
  return new GmailProviderError(code, diagnostic)
}
