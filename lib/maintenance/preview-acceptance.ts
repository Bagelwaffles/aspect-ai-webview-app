export const ACI_PREVIEW_ACCEPTANCE = {
  endpoint: "/api/internal/maintenance",
  environment: "preview",
  branch: "feat/ams-maintenance-agent-pipeline-20261015",
  findingFingerprint: "aci-preview-acceptance-20261111-trace-grading-v1",
  area: "aci-research",
  summary: "ACI Preview acceptance: public trace-grading research reference; review only.",
  evidenceUrl: "https://developers.openai.com/api/docs/guides/trace-grading",
  businessImpact: "Public technical reference for evaluation practice. No customer data, spending, or execution authorized.",
  prNumber: 328,
  prHeadSha: "e4791b0546c35d4024defdbb79be9d30410f70cc",
  prUrl: "https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/328",
} as const

export type AciPreviewAcceptanceStep =
  | "origin_preflight"
  | "record"
  | "readback"
  | "replay"
  | "dedupe_readback"
  | "attach_pr"
  | "verify_checks"
  | "final_readback"

export type AciPreviewAcceptanceResult = {
  findingId: string
  firstInsertNew: boolean
  replayDuplicateConfirmed: true
  finalState: "checks_passed"
  prUrl: typeof ACI_PREVIEW_ACCEPTANCE.prUrl
  prHeadSha: typeof ACI_PREVIEW_ACCEPTANCE.prHeadSha
  ciVerifiedAt: string
  productionReleaseAuthorized: false
}

type JsonObject = Record<string, unknown>
type Fetcher = typeof fetch

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

async function readJson(response: Response): Promise<JsonObject> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error("MAINTENANCE_RESPONSE_INVALID_JSON")
  }
  if (!isObject(body)) throw new Error("MAINTENANCE_RESPONSE_INVALID_SHAPE")
  if (!response.ok || body.ok !== true) {
    const code = typeof body.code === "string" ? body.code : "MAINTENANCE_REQUEST_FAILED"
    throw new Error(code)
  }
  return body
}

async function getFindings(fetcher: Fetcher): Promise<JsonObject[]> {
  const response = await fetcher(ACI_PREVIEW_ACCEPTANCE.endpoint, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  const body = await readJson(response)
  if (!Array.isArray(body.findings) || !body.findings.every(isObject)) {
    throw new Error("MAINTENANCE_FINDINGS_INVALID")
  }
  return body.findings
}

async function postAction(fetcher: Fetcher, payload: JsonObject): Promise<JsonObject> {
  const response = await fetcher(ACI_PREVIEW_ACCEPTANCE.endpoint, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  return readJson(response)
}

function requireSingleFinding(findings: JsonObject[], findingId: string): JsonObject {
  const matches = findings.filter((finding) => finding.id === findingId)
  if (matches.length !== 1) throw new Error("MAINTENANCE_FINDING_READBACK_FAILED")
  return matches[0]
}

export type AciOriginDiagnostics = {
  requestOrigin?: string
  originHeaderOrigin?: string | null
  refererOrigin?: string | null
  configuredSource?: string
  configuredOrigin?: string | null
  originHeaderMatchesConfigured?: boolean
  requestOriginMatchesConfigured?: boolean
  refererOriginMatchesConfigured?: boolean
  secFetchSite?: string | null
  hostHeader?: string | null
  forwardedHost?: string | null
  vercelEnv?: string | null
  vercelGitCommitRef?: string | null
  vercelUrlOrigin?: string | null
  vercelBranchUrlOrigin?: string | null
}

export async function diagnoseAciPreviewOrigin(fetcher: Fetcher = fetch): Promise<{
  trustedOrigin: boolean
  diagnostics: AciOriginDiagnostics
}> {
  const body = await postAction(fetcher, { action: "diagnose_origin" })
  if (typeof body.trustedOrigin !== "boolean" || !isObject(body.originDiagnostics)) {
    throw new Error("ACI_ORIGIN_DIAGNOSTICS_INVALID")
  }
  return {
    trustedOrigin: body.trustedOrigin,
    diagnostics: body.originDiagnostics as AciOriginDiagnostics,
  }
}

/**
 * Executes the approved, one-finding Preview acceptance sequence from the
 * owner's signed-in browser. It uses only the existing owner API and exact
 * open Draft PR #328. It never calls a model, toggles cron, or releases code.
 */
export async function runAciPreviewAcceptance(options: {
  fetcher?: Fetcher
  now?: () => Date
  onStep?: (step: AciPreviewAcceptanceStep) => void
} = {}): Promise<AciPreviewAcceptanceResult> {
  const fetcher = options.fetcher ?? fetch
  const now = (options.now ?? (() => new Date()))()
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("ACI_ACCEPTANCE_CLOCK_INVALID")
  }
  const sourceObservedAt = now.toISOString()
  const findingPayload = {
    action: "record_research",
    area: ACI_PREVIEW_ACCEPTANCE.area,
    summary: ACI_PREVIEW_ACCEPTANCE.summary,
    sourceFingerprint: ACI_PREVIEW_ACCEPTANCE.findingFingerprint,
    sourceObservedAt,
    evidenceUrl: ACI_PREVIEW_ACCEPTANCE.evidenceUrl,
    businessImpact: ACI_PREVIEW_ACCEPTANCE.businessImpact,
  }

  options.onStep?.("origin_preflight")
  const origin = await diagnoseAciPreviewOrigin(fetcher)
  if (!origin.trustedOrigin) {
    throw new Error("UNTRUSTED_ORIGIN:" + JSON.stringify(origin.diagnostics))
  }

  options.onStep?.("record")
  const inserted = await postAction(fetcher, findingPayload)
  if (!isObject(inserted.finding) || typeof inserted.finding.id !== "string" ||
      !/^[a-f0-9]{40}$/.test(inserted.finding.id) || typeof inserted.new !== "boolean") {
    throw new Error("MAINTENANCE_RECORD_RESPONSE_INVALID")
  }
  const findingId = inserted.finding.id
  const firstInsertNew = inserted.new

  options.onStep?.("readback")
  const firstReadback = requireSingleFinding(await getFindings(fetcher), findingId)
  if (firstReadback.sourceFingerprint !== ACI_PREVIEW_ACCEPTANCE.findingFingerprint ||
      firstReadback.origin !== "owner_research" ||
      !["observed", "draft_pr", "checks_passed"].includes(String(firstReadback.state))) {
    throw new Error("MAINTENANCE_RECORD_READBACK_MISMATCH")
  }
  if (firstReadback.pr !== null && firstReadback.pr !== undefined &&
      (!isObject(firstReadback.pr) ||
       firstReadback.pr.url !== ACI_PREVIEW_ACCEPTANCE.prUrl ||
       firstReadback.pr.headSha !== ACI_PREVIEW_ACCEPTANCE.prHeadSha)) {
    throw new Error("MAINTENANCE_EXISTING_PR_CONFLICT")
  }

  options.onStep?.("replay")
  const replay = await postAction(fetcher, findingPayload)
  if (replay.new !== false || !isObject(replay.finding) || replay.finding.id !== findingId) {
    throw new Error("MAINTENANCE_DEDUPE_REPLAY_FAILED")
  }

  options.onStep?.("dedupe_readback")
  const afterReplay = requireSingleFinding(await getFindings(fetcher), findingId)
  if (afterReplay.sourceFingerprint !== ACI_PREVIEW_ACCEPTANCE.findingFingerprint) {
    throw new Error("MAINTENANCE_DEDUPE_READBACK_FAILED")
  }

  options.onStep?.("attach_pr")
  if (afterReplay.state !== "checks_passed") {
    const attached = await postAction(fetcher, {
      action: "attach_draft_pr",
      findingId,
      prNumber: ACI_PREVIEW_ACCEPTANCE.prNumber,
      headSha: ACI_PREVIEW_ACCEPTANCE.prHeadSha,
    })
    if (!isObject(attached.finding) || !isObject(attached.finding.pr) ||
        attached.finding.pr.url !== ACI_PREVIEW_ACCEPTANCE.prUrl ||
        attached.finding.pr.headSha !== ACI_PREVIEW_ACCEPTANCE.prHeadSha) {
      throw new Error("MAINTENANCE_DRAFT_PR_ATTACHMENT_FAILED")
    }
  } else if (!isObject(afterReplay.pr) ||
      afterReplay.pr.url !== ACI_PREVIEW_ACCEPTANCE.prUrl ||
      afterReplay.pr.headSha !== ACI_PREVIEW_ACCEPTANCE.prHeadSha) {
    throw new Error("MAINTENANCE_EXISTING_PR_CONFLICT")
  }

  options.onStep?.("verify_checks")
  const verified = await postAction(fetcher, {
    action: "verify_pr_checks",
    findingId,
  })
  if (!isObject(verified.finding) || verified.finding.state !== "checks_passed" ||
      !isObject(verified.finding.pr) ||
      verified.finding.pr.headSha !== ACI_PREVIEW_ACCEPTANCE.prHeadSha ||
      typeof verified.finding.pr.ciVerifiedAt !== "string" ||
      verified.productionReleaseAuthorized !== false) {
    throw new Error("MAINTENANCE_EXACT_HEAD_CHECKS_FAILED")
  }

  options.onStep?.("final_readback")
  const finalFinding = requireSingleFinding(await getFindings(fetcher), findingId)
  if (finalFinding.state !== "checks_passed" || !isObject(finalFinding.pr) ||
      finalFinding.pr.url !== ACI_PREVIEW_ACCEPTANCE.prUrl ||
      finalFinding.pr.headSha !== ACI_PREVIEW_ACCEPTANCE.prHeadSha ||
      typeof finalFinding.pr.ciVerifiedAt !== "string") {
    throw new Error("MAINTENANCE_FINAL_READBACK_FAILED")
  }

  return {
    findingId,
    firstInsertNew,
    replayDuplicateConfirmed: true,
    finalState: "checks_passed",
    prUrl: ACI_PREVIEW_ACCEPTANCE.prUrl,
    prHeadSha: ACI_PREVIEW_ACCEPTANCE.prHeadSha,
    ciVerifiedAt: finalFinding.pr.ciVerifiedAt,
    productionReleaseAuthorized: false,
  }
}
