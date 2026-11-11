import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { agents } from "@/app/agents/agentCatalog"
import { authorizeOwnerApiRequest, type OwnerAuthorizationResult } from "@/lib/server/owner-api-auth"
import { getMaintenanceFinding } from "@/lib/server/maintenance-lifecycle"
import {
  listAciVerifiedKnowledge,
  promoteAciVerifiedKnowledge,
  revokeAciVerifiedKnowledge,
  type AciKnowledgeOptions,
} from "@/lib/server/aci-knowledge-store"

const PREVIEW_BRANCH = "feat/ams-maintenance-agent-pipeline-20261015"
const SHA40 = /^[a-f0-9]{40}$/
const agentSlugs = new Set(agents.map((agent) => agent.slug))

const sourceSchema = z.object({
  url: z.string().url().max(800),
  title: z.string().min(4).max(200),
  publisher: z.string().min(2).max(120),
  retrievedAt: z.string().datetime(),
}).strict()

const attestationsSchema = z.object({
  sourceContentReviewed: z.literal(true),
  sourcesIndependent: z.literal(true),
  publicOnly: z.literal(true),
  noCustomerDataOrSecrets: z.literal(true),
  factOnlyNoInstructions: z.literal(true),
}).strict()

const promoteSchema = z.object({
  action: z.literal("promote_verified_fact"),
  agentSlug: z.string().min(2).max(80),
  agentVersion: z.string().min(2).max(80),
  reviewedAgainstRepoSha: z.string().regex(SHA40),
  researchFindingId: z.string().regex(SHA40),
  fact: z.string().min(24).max(500),
  sources: z.array(sourceSchema).min(2).max(4),
  attestations: attestationsSchema,
}).strict()

const revokeSchema = z.object({
  action: z.literal("revoke_verified_fact"),
  id: z.string().regex(SHA40),
  agentSlug: z.string().min(2).max(80),
  agentVersion: z.string().min(2).max(80),
  reason: z.string().min(12).max(300),
}).strict()

type Authorize = typeof authorizeOwnerApiRequest
type ListKnowledge = typeof listAciVerifiedKnowledge
type PromoteKnowledge = typeof promoteAciVerifiedKnowledge
type RevokeKnowledge = typeof revokeAciVerifiedKnowledge
type GetFinding = typeof getMaintenanceFinding

export type AciKnowledgeApiDependencies = {
  env?: NodeJS.ProcessEnv
  now?: Date
  authorize?: Authorize
  list?: ListKnowledge
  promote?: PromoteKnowledge
  revoke?: RevokeKnowledge
  getFinding?: GetFinding
  options?: AciKnowledgeOptions
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function previewEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === PREVIEW_BRANCH
}

function currentRepoSha(env: NodeJS.ProcessEnv): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase()
  return sha && SHA40.test(sha) ? sha : null
}

function safeError(error: unknown, fallback: string): { code: string; status: number } {
  const raw = error instanceof Error ? error.message : fallback
  if (raw === "MAINTENANCE_STORE_UNAVAILABLE" ||
      /UNAVAILABLE|TIMEOUT|CONNECTION/u.test(raw)) {
    return { code: "ACI_KNOWLEDGE_STORE_UNAVAILABLE", status: 503 }
  }
  if (/^ACI_KNOWLEDGE_[A-Z0-9_]+$/.test(raw)) return { code: raw, status: 400 }
  // Never echo provider/database errors, URLs, tokens, or arbitrary exception text.
  return { code: fallback, status: 503 }
}

async function authorize(
  request: NextRequest,
  dependencies: AciKnowledgeApiDependencies,
  requireTrustedOrigin: boolean,
): Promise<OwnerAuthorizationResult> {
  const env = dependencies.env ?? process.env
  const check = dependencies.authorize ?? authorizeOwnerApiRequest
  return check(request, { requireTrustedOrigin, env })
}

export async function handleAciKnowledgeGet(
  request: NextRequest,
  dependencies: AciKnowledgeApiDependencies = {},
) {
  const env = dependencies.env ?? process.env
  if (!previewEnabled(env)) return json({ ok: false, code: "ACI_KNOWLEDGE_PREVIEW_ONLY" }, 404)
  const auth = await authorize(request, dependencies, false)
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)

  const url = request.nextUrl
  const keys = [...url.searchParams.keys()]
  if (
    keys.some((key) => !["agentSlug", "agentVersion", "limit"].includes(key)) ||
    new Set(keys).size !== keys.length
  ) return json({ ok: false, code: "ACI_KNOWLEDGE_QUERY_INVALID" }, 400)

  const agentSlug = url.searchParams.get("agentSlug") ?? ""
  const agentVersion = url.searchParams.get("agentVersion") ?? ""
  const limitText = url.searchParams.get("limit")
  const limit = limitText === null ? 20 : Number(limitText)
  if (!agentSlugs.has(agentSlug) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/.test(agentVersion) ||
      (limitText !== null && !/^(?:[1-9]|[1-9]\d|100)$/.test(limitText))) {
    return json({ ok: false, code: "ACI_KNOWLEDGE_QUERY_INVALID" }, 400)
  }

  try {
    const list = dependencies.list ?? listAciVerifiedKnowledge
    const facts = await list(agentSlug, agentVersion, limit, {
      ...(dependencies.options ?? {}),
      ...(dependencies.now ? { now: dependencies.now } : {}),
      ...(dependencies.env ? { env: dependencies.env } : {}),
    })
    return json({
      ok: true,
      status: "owner_attested",
      agentSlug,
      agentVersion,
      facts,
      sourceAuthenticityMachineVerified: false,
      trustedInstructions: false,
      mayExecute: false,
      productionApproved: false,
    })
  } catch (error) {
    const failure = safeError(error, "ACI_KNOWLEDGE_READ_FAILED")
    return json({ ok: false, code: failure.code }, failure.status)
  }
}

export async function handleAciKnowledgePost(
  request: NextRequest,
  dependencies: AciKnowledgeApiDependencies = {},
) {
  const env = dependencies.env ?? process.env
  if (!previewEnabled(env)) return json({ ok: false, code: "ACI_KNOWLEDGE_PREVIEW_ONLY" }, 404)
  const auth = await authorize(request, dependencies, true)
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)

  let payload: unknown
  try {
    const text = await request.text()
    if (text.length > 12_000) return json({ ok: false, code: "ACI_KNOWLEDGE_PAYLOAD_TOO_LARGE" }, 413)
    payload = JSON.parse(text)
  } catch {
    return json({ ok: false, code: "ACI_KNOWLEDGE_INVALID_JSON" }, 400)
  }

  const promote = promoteSchema.safeParse(payload)
  if (promote.success) {
    const expectedSha = currentRepoSha(env)
    if (!expectedSha || promote.data.reviewedAgainstRepoSha !== expectedSha) {
      return json({ ok: false, code: "ACI_KNOWLEDGE_REPO_VERSION_MISMATCH" }, 409)
    }
    if (!agentSlugs.has(promote.data.agentSlug)) {
      return json({ ok: false, code: "ACI_KNOWLEDGE_AGENT_UNKNOWN" }, 400)
    }
    try {
      const find = dependencies.getFinding ?? getMaintenanceFinding
      const researchFinding = await find(promote.data.researchFindingId, {
        ...(dependencies.options ?? {}),
        ...(dependencies.now ? { now: dependencies.now } : {}),
        ...(dependencies.env ? { env: dependencies.env } : {}),
      })
      const observedAt = researchFinding ? Date.parse(researchFinding.sourceObservedAt) : Number.NaN
      const nowMs = (dependencies.now ?? new Date()).getTime()
      if (!researchFinding || researchFinding.origin !== "owner_research" ||
          researchFinding.area !== "aci-research" || researchFinding.state !== "checks_passed" ||
          !Number.isFinite(observedAt) ||
          observedAt > nowMs + 5 * 60 * 1000 ||
          nowMs - observedAt > 48 * 60 * 60 * 1000) {
        return json({ ok: false, code: "ACI_KNOWLEDGE_RESEARCH_FINDING_NOT_VERIFIED" }, 409)
      }
      const save = dependencies.promote ?? promoteAciVerifiedKnowledge
      const { action: _action, ...knowledgeInput } = promote.data
      const result = await save(knowledgeInput, {
        ...(dependencies.options ?? {}),
        ...(dependencies.now ? { now: dependencies.now } : {}),
        ...(dependencies.env ? { env: dependencies.env } : {}),
      })
      return json({
        ok: true,
        ...result,
        executionPerformed: false,
        productionReleaseAuthorized: false,
      })
    } catch (error) {
      const failure = safeError(error, "ACI_KNOWLEDGE_PROMOTION_FAILED")
      return json({ ok: false, code: failure.code }, failure.status)
    }
  }

  const revoke = revokeSchema.safeParse(payload)
  if (revoke.success) {
    if (!agentSlugs.has(revoke.data.agentSlug)) {
      return json({ ok: false, code: "ACI_KNOWLEDGE_AGENT_UNKNOWN" }, 400)
    }
    try {
      const save = dependencies.revoke ?? revokeAciVerifiedKnowledge
      const fact = await save(revoke.data, {
        ...(dependencies.options ?? {}),
        ...(dependencies.now ? { now: dependencies.now } : {}),
        ...(dependencies.env ? { env: dependencies.env } : {}),
      })
      return json({
        ok: true,
        fact,
        executionPerformed: false,
        productionReleaseAuthorized: false,
      })
    } catch (error) {
      const failure = safeError(error, "ACI_KNOWLEDGE_REVOCATION_FAILED")
      return json({ ok: false, code: failure.code }, failure.status)
    }
  }

  return json({ ok: false, code: "ACI_KNOWLEDGE_ACTION_FORBIDDEN" }, 400)
}
