import { createHash } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { AnalyticsCsvError } from "@/lib/analytics-csv"
import { analyticsIdempotencyKeySchema, getAnalyticsRunStore, toPublicAnalyticsRun, type AnalyticsRunStore } from "@/lib/server/analytics-runs"
import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { getEntitlementSnapshot, snapshotHasAgentAccess } from "@/lib/server/entitlements"
import { consumeDistributedAiRateLimit } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const MAX_CSV_BYTES = 2 * 1024 * 1024

type Dependencies = {
  authorize: typeof authorizeCustomerApiRequest
  getEntitlements: typeof getEntitlementSnapshot
  hasAgentAccess: typeof snapshotHasAgentAccess
  rateLimit: typeof consumeDistributedAiRateLimit
  analyze: (bytes: Uint8Array, name: string) => Promise<unknown>
  getRunStore: () => AnalyticsRunStore
}

const defaults: Dependencies = {
  authorize: authorizeCustomerApiRequest,
  getEntitlements: getEntitlementSnapshot,
  hasAgentAccess: snapshotHasAgentAccess,
  rateLimit: consumeDistributedAiRateLimit,
  analyze: async (bytes) => (await import("@/lib/analytics-csv")).profileAnalyticsCsv(bytes),
  getRunStore: getAnalyticsRunStore,
}

type TestGlobals = typeof globalThis & { __amsAnalyticsTestDependencies?: Partial<Dependencies> }
function dependencies(): Dependencies {
  const overrides = process.env.NODE_ENV === "production" ? {} : (globalThis as TestGlobals).__amsAnalyticsTestDependencies ?? {}
  return { ...defaults, ...overrides }
}

function json(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } })
}

function error(code: string, message: string, status: number) {
  return json({ ok: false, code, error: message, creditsCharged: 0 }, status)
}

async function principalFor(request: NextRequest, deps: Dependencies) {
  const principal = await deps.authorize(request)
  return principal?.kind === "customer" ? principal : null
}

export async function POST(request: NextRequest) {
  const deps = dependencies()
  const principal = await principalFor(request, deps)
  if (!principal) return error("CUSTOMER_SESSION_REQUIRED", "A signed customer session is required", 401)

  const idempotency = analyticsIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"))
  if (!idempotency.success) return error("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must contain 8 to 120 safe characters", 400)

  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return error("MULTIPART_REQUIRED", "Upload one CSV file as multipart form data", 415)
  const length = Number(request.headers.get("content-length"))
  if (Number.isFinite(length) && length > MAX_CSV_BYTES + 64 * 1024) return error("CSV_TOO_LARGE", "CSV files must not exceed 2 MiB", 413)

  let limit
  try { limit = await deps.rateLimit({ subject: principal.subject, operation: "analytics-agent-run" }) } catch { return error("RATE_LIMIT_UNAVAILABLE", "Analytics rate limiting is unavailable", 503) }
  if (!limit.available) return error("RATE_LIMIT_UNAVAILABLE", "Analytics rate limiting is unavailable", 503)
  if (!limit.allowed) return json({ ok: false, code: "ANALYTICS_RATE_LIMITED", error: "Analytics rate limit exceeded", creditsCharged: 0 }, 429, { "Retry-After": String(limit.retryAfterSeconds) })

  const snapshot = await deps.getEntitlements(principal.subject).catch(() => null)
  if (!snapshot?.configured) return error("ENTITLEMENTS_NOT_CONFIGURED", "Account entitlements are unavailable", 503)
  if (!deps.hasAgentAccess(snapshot, "analytics")) return error("SUBSCRIPTION_REQUIRED", "Analytics entitlement is required", 402)

  let form: FormData
  try { form = await request.formData() } catch { return error("INVALID_MULTIPART", "The multipart upload could not be read", 400) }
  const values = form.getAll("file")
  if (values.length !== 1 || !(values[0] instanceof File)) return error("CSV_FILE_REQUIRED", "Upload exactly one CSV file in the file field", 400)
  const file = values[0]
  if (file.size < 1 || file.size > MAX_CSV_BYTES) return error("CSV_TOO_LARGE", "CSV files must be between 1 byte and 2 MiB", 413)
  if (file.name.length > 255 || !/^[^\u0000-\u001f\u007f/\\]+\.csv$/i.test(file.name)) {
    return error("INVALID_CSV_NAME", "The upload must have a safe .csv filename no longer than 255 characters", 400)
  }
  if (file.type && !["text/csv", "application/vnd.ms-excel"].includes(file.type.toLowerCase())) {
    return error("CSV_FILE_REQUIRED", "The uploaded file must use a CSV content type", 415)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const fingerprint = createHash("sha256").update(file.name).update("\0").update(bytes).digest("hex")

  let store: AnalyticsRunStore
  try { store = deps.getRunStore() } catch { return error("ANALYTICS_RUN_STORE_UNAVAILABLE", "Analytics history is unavailable", 503) }
  let claim
  try { claim = await store.claim({ ownerSubject: principal.subject, idempotencyKey: idempotency.data, fileName: file.name, fileBytes: file.size, fingerprint }) } catch { return error("ANALYTICS_RUN_STORE_UNAVAILABLE", "Analytics history is unavailable", 503) }
  if (claim.status === "conflict") return error("ANALYTICS_IDEMPOTENCY_CONFLICT", "The idempotency key is already bound to a different CSV", 409)
  if (claim.status === "existing") {
    const run = toPublicAnalyticsRun(claim.record)
    if (run.status === "succeeded") return json({ ok: true, idempotent: true, creditsCharged: 0, run }, 200)
    if (run.status === "running") return json({ ok: false, code: "ANALYTICS_RUN_IN_PROGRESS", error: "This analytics run is already in progress", creditsCharged: 0, run }, 202)
    return json({ ok: false, code: "ANALYTICS_RUN_FAILED", error: "This analytics run did not complete", creditsCharged: 0, run }, 409)
  }

  let result: unknown
  try { result = await deps.analyze(bytes, file.name) } catch (cause) {
    try { await store.finish({ ownerSubject: principal.subject, idempotencyKey: idempotency.data, failed: true }) } catch { return error("ANALYTICS_RUN_STORE_UNAVAILABLE", "The failed analytics run could not be persisted", 503) }
    if (cause instanceof AnalyticsCsvError) {
      const location = cause.row ? ` at row ${cause.row}${cause.column ? `, column ${cause.column}` : ""}` : ""
      return error(cause.code, `${cause.message}${location}`, 422)
    }
    return error("ANALYSIS_FAILED", "The CSV could not be analyzed", 422)
  }
  try {
    const run = await store.finish({ ownerSubject: principal.subject, idempotencyKey: idempotency.data, result })
    return json({ ok: true, idempotent: false, creditsCharged: 0, run: toPublicAnalyticsRun(run) }, 200, { "X-RateLimit-Limit": String(limit.limit), "X-RateLimit-Remaining": String(limit.remaining) })
  } catch { return error("ANALYTICS_RUN_STORE_UNAVAILABLE", "The analytics result could not be persisted", 503) }
}

export async function GET(request: NextRequest) {
  const deps = dependencies()
  const principal = await principalFor(request, deps)
  if (!principal) return error("CUSTOMER_SESSION_REQUIRED", "A signed customer session is required", 401)
  try { return json({ ok: true, creditsCharged: 0, runs: await deps.getRunStore().listForOwner(principal.subject) }, 200) }
  catch { return error("ANALYTICS_RUN_STORE_UNAVAILABLE", "Analytics history is unavailable", 503) }
}
