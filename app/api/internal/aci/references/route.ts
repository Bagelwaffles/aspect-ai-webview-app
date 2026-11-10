import { NextRequest, NextResponse } from "next/server"

import seed from "@/docs/aci/public-research-seed.v1.json"
import { assessPublicResearchCandidate } from "@/lib/aci/research-evidence"
import { selectAciResearchReferences } from "@/lib/aci/research-review"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Preview-only, owner-authenticated, read-only source citation metadata.
// No customer data, secrets, unreviewed claims, model calls, Redis or tools.
type Authorization = typeof authorizeOwnerApiRequest
type ReferenceDependencies = {
  authorize?: Authorization
  env?: NodeJS.ProcessEnv
  now?: Date
}

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

// Exported solely for isolated test injection; the actual HTTP GET binds to
// authorizeOwnerApiRequest and process.env without any test dependency override.
export async function handleAciReferenceGet(
  request: NextRequest,
  dependencies: ReferenceDependencies = {},
) {
  const env = dependencies.env ?? process.env
  // The release of this route must not automatically expose ACI in Production.
  if (env.VERCEL_ENV !== "preview") {
    return json({ ok: false, code: "ACI_PREVIEW_ONLY" }, 404)
  }
  const authorize = dependencies.authorize ?? authorizeOwnerApiRequest
  const authorization = await authorize(request)
  if (!authorization.ok) {
    return json({ ok: false, code: authorization.code }, authorization.status)
  }
  const now = dependencies.now ?? new Date()
  if (!Number.isFinite(now.getTime())) {
    return json({ ok: false, code: "ACI_INVALID_CLOCK" }, 503)
  }
  const url = request.nextUrl
  const keys = [...url.searchParams.keys()]
  if (
    keys.some((key) => !["agentSlug", "sourceRepoSha", "maxReferences"].includes(key)) ||
    new Set(keys).size !== keys.length
  ) {
    return json({ ok: false, code: "ACI_INVALID_QUERY" }, 400)
  }

  const agentSlug = url.searchParams.get("agentSlug") ?? ""
  const sourceRepoSha = url.searchParams.get("sourceRepoSha") ?? ""
  const maxText = url.searchParams.get("maxReferences")
  const maxReferences = maxText === null ? 3 : Number(maxText)
  if (
    !/^[a-z0-9][a-z0-9-]{1,79}$/.test(agentSlug) ||
    !/^[a-f0-9]{40}$/.test(sourceRepoSha) ||
    (maxText !== null && !/^[1-5]$/.test(maxText)) ||
    !Number.isSafeInteger(maxReferences)
  ) {
    return json({ ok: false, code: "ACI_INVALID_QUERY" }, 400)
  }

  const candidates: unknown[] = seed.records.filter((item) =>
    item.affectedAgentId === agentSlug && item.baselineRepoSha === sourceRepoSha
  )
  if (candidates.length === 0) {
    return json({
      ok: true, status: "no_references", references: [],
      sourceVerified: false, memoryRuntimeActive: false, productionApproved: false,
    }, 200)
  }
  const normalized = candidates.map((candidate) => assessPublicResearchCandidate(candidate, now))
  if (normalized.some((result) => !result.accepted)) {
    return json({ ok: false, code: "ACI_RESEARCH_INVALID_OR_STALE" }, 409)
  }
  const records = normalized.flatMap((result) => result.accepted ? [result.record] : [])
  const selected = selectAciResearchReferences({
    agentSlug, sourceRepoSha, records, maxReferences,
  }, now)
  if (selected.status !== "research_only") {
    return json({ ok: false, code: "ACI_RESEARCH_NOT_READY" }, 409)
  }
  return json({
    ok: true,
    status: "research_only",
    sourceControlled: true,
    sourceVerified: false,
    memoryRuntimeActive: false,
    productionApproved: false,
    references: selected.references,
  }, 200)
}

export async function GET(request: NextRequest) {
  return handleAciReferenceGet(request)
}
