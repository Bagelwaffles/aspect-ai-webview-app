import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  getMaintenanceFinding,
  listMaintenanceFindings,
  markChecksPassed,
  normalizeMaintenanceInput,
  recordDraftPr,
  recordMaintenanceFinding,
  maintenanceActionPolicy,
} from "@/lib/server/maintenance-lifecycle"
import { verifyMaintenanceChecks, verifyMaintenanceDraftPr } from "@/lib/server/maintenance-github-proof"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const externalInput = z.object({
  action: z.literal("record_research"),
  area: z.string().min(2).max(100),
  summary: z.string().min(10).max(600),
  sourceFingerprint: z.string().min(8).max(256),
  sourceObservedAt: z.string().datetime(),
  evidenceUrl: z.string().url().max(800),
  businessImpact: z.string().max(300).optional(),
}).strict()

const attachInput = z.object({
  action: z.literal("attach_draft_pr"),
  findingId: z.string().regex(/^[a-f0-9]{40}$/),
  prNumber: z.number().int().positive(),
  headSha: z.string().regex(/^[a-f0-9]{40}$/),
}).strict()

const verifyInput = z.object({
  action: z.literal("verify_pr_checks"),
  findingId: z.string().regex(/^[a-f0-9]{40}$/),
}).strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)
  try {
    const findings = await listMaintenanceFindings()
    return json({
      ok: true,
      findings,
      maintenanceCronEnabled: process.env.AMS_MAINTENANCE_ENABLED === "true",
      implementationExecutorEnabled: false,
      productionDeploymentEnabled: false,
      customerFacing: false,
    })
  } catch {
    return json({ ok: false, code: "MAINTENANCE_STORE_UNAVAILABLE" }, 503)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)
  let payload: unknown
  try {
    const text = await request.text()
    if (text.length > 8_192) return json({ ok: false, code: "MAINTENANCE_PAYLOAD_TOO_LARGE" }, 413)
    payload = JSON.parse(text)
  } catch {
    return json({ ok: false, code: "MAINTENANCE_INVALID_JSON" }, 400)
  }
  const research = externalInput.safeParse(payload)
  if (research.success) {
    try {
      const d = research.data
      const finding = normalizeMaintenanceInput({
        origin: "owner_research", category: "update", area: d.area,
        summary: d.summary, sourceFingerprint: d.sourceFingerprint,
        sourceObservedAt: d.sourceObservedAt, severity: "opportunity",
        evidenceUrl: d.evidenceUrl, businessImpact: d.businessImpact,
        estimatedCostUsd: null,
      })
      if (!finding.evidenceUrl) return json({ ok: false, code: "MAINTENANCE_EVIDENCE_URL_INVALID" }, 400)
      const saved = await recordMaintenanceFinding(finding)
      return json({ ok: true, ...saved, executionPerformed: false })
    } catch (error) {
      const code = error instanceof Error ? error.message : "MAINTENANCE_WRITE_FAILED"
      return json({ ok: false, code }, code === "MAINTENANCE_STORE_UNAVAILABLE" ? 503 : 400)
    }
  }
  const attach = attachInput.safeParse(payload)
  if (attach.success) {
    try {
      const d = attach.data
      const existing = await getMaintenanceFinding(d.findingId)
      if (!existing) return json({ ok: false, code: "MAINTENANCE_FINDING_NOT_FOUND" }, 404)
      const url = await verifyMaintenanceDraftPr(d.prNumber, d.headSha)
      const saved = await recordDraftPr(d.findingId, { url, headSha: d.headSha })
      return json({ ok: true, finding: saved, executionPerformed: false })
    } catch (error) {
      const code = error instanceof Error ? error.message : "MAINTENANCE_PR_PROOF_FAILED"
      return json({ ok: false, code }, /UNAVAILABLE/u.test(code) ? 503 : 409)
    }
  }
  const verification = verifyInput.safeParse(payload)
  if (verification.success) {
    try {
      const finding = await getMaintenanceFinding(verification.data.findingId)
      if (!finding?.pr) return json({ ok: false, code: "MAINTENANCE_PR_NOT_RECORDED" }, 409)
      const match = finding.pr.url.match(/\/pull\/(\d+)$/u)
      if (!match) return json({ ok: false, code: "MAINTENANCE_PR_PROOF_INVALID" }, 409)
      await verifyMaintenanceDraftPr(Number(match[1]), finding.pr.headSha)
      await verifyMaintenanceChecks(finding.pr.headSha)
      const saved = await markChecksPassed(finding.id, finding.pr.headSha)
      return json({ ok: true, finding: saved, productionReleaseAuthorized: false })
    } catch (error) {
      const code = error instanceof Error ? error.message : "MAINTENANCE_CHECKS_PROOF_FAILED"
      return json({ ok: false, code }, /UNAVAILABLE/u.test(code) ? 503 : 409)
    }
  }
  return json({
    ok: false, code: "MAINTENANCE_ACTION_FORBIDDEN",
    allowed: ["record_research", "attach_draft_pr", "verify_pr_checks"],
    productionPolicy: maintenanceActionPolicy("production_deploy"),
  }, 400)
}
