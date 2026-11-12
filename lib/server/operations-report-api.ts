import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { SPECIALISTS, type SpecialistId } from "@/lib/operations/reporting"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  readSpecialistReports, saveSpecialistReport, reportingPreviewEnabled,
  type ReportingOptions,
} from "@/lib/server/operations-report-store"

const envelope = z.object({
  specialistId: z.string(),
  reviewedAgainstRepoSha: z.string().regex(/^[a-f0-9]{40}$/),
  attestations: z.object({ publicOnly: z.literal(true), noSensitiveData: z.literal(true), sourceReviewed: z.literal(true) }).strict(),
  report: z.unknown(),
}).strict()
type Dependencies = ReportingOptions & {
  authorize?: typeof authorizeOwnerApiRequest
  read?: typeof readSpecialistReports
  save?: typeof saveSpecialistReport
}
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
}
const MAX_BODY_BYTES = 16_384
async function boundedBody(request: NextRequest): Promise<string | null> {
  const declared = request.headers.get("content-length")
  if (declared && Number(declared) > MAX_BODY_BYTES) return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let total = 0
  let text = ""
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return text + decoder.decode()
      total += chunk.value.byteLength
      if (total > MAX_BODY_BYTES) { await reader.cancel(); return null }
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally { reader.releaseLock() }
}
export async function handleReportingGet(request: NextRequest, deps: Dependencies = {}) {
  const env = deps.env ?? process.env
  if (!reportingPreviewEnabled(env)) return json({ code: "NOT_FOUND" }, 404)
  const auth = await (deps.authorize ?? authorizeOwnerApiRequest)(request, { env })
  if (!auth.ok) return json({ code: auth.code }, auth.status)
  const result = await (deps.read ?? readSpecialistReports)(deps)
  return json({ ...result, automaticTransportVerified: false, sourceAuthenticityMachineVerified: false, mayExecute: false }, result.state === "available" ? 200 : 503)
}
export async function handleReportingPost(request: NextRequest, deps: Dependencies = {}) {
  const env = deps.env ?? process.env
  if (!reportingPreviewEnabled(env)) return json({ code: "NOT_FOUND" }, 404)
  const auth = await (deps.authorize ?? authorizeOwnerApiRequest)(request, { requireTrustedOrigin: true, env })
  if (!auth.ok) return json({ code: auth.code }, auth.status)
  let payload: unknown
  try {
    const text = await boundedBody(request)
    if (text === null) return json({ code: "REPORTING_PAYLOAD_TOO_LARGE" }, 413)
    payload = JSON.parse(text)
  } catch { return json({ code: "REPORTING_INVALID_JSON" }, 400) }
  const parsed = envelope.safeParse(payload)
  if (!parsed.success || !SPECIALISTS.some((source) => source.id === parsed.data.specialistId)) return json({ code: "REPORTING_PAYLOAD_INVALID" }, 400)
  if (!env.VERCEL_GIT_COMMIT_SHA || parsed.data.reviewedAgainstRepoSha !== env.VERCEL_GIT_COMMIT_SHA) return json({ code: "REPORTING_COMMIT_MISMATCH" }, 409)
  try {
    const result = await (deps.save ?? saveSpecialistReport)(parsed.data.specialistId as SpecialistId, parsed.data.report, deps)
    return json({ ...result, mayExecute: false, approvalGranted: false, sourceAuthenticityMachineVerified: false }, result.created ? 201 : 200)
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "REPORTING_PAYLOAD_INVALID") return json({ code }, 400)
    if (code === "REPORTING_IDENTITY_CONFLICT") return json({ code }, 409)
    return json({ code: "REPORTING_STORE_UNAVAILABLE", outcome: "unknown; read back or replay the identical report before creating a new ID" }, 503)
  }
}
