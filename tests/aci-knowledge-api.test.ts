import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server"

import {
  handleAciKnowledgeGet,
  handleAciKnowledgePost,
} from "../lib/server/aci-knowledge-api"
import type { AciVerifiedKnowledge } from "../lib/server/aci-knowledge-store"
import type { OwnerAuthorizationResult } from "../lib/server/owner-api-auth"

const branch = "feat/ams-maintenance-agent-pipeline-20261015"
const sha = "a".repeat(40)
const previewEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: branch,
  VERCEL_GIT_COMMIT_SHA: sha,
} as unknown as NodeJS.ProcessEnv
const productionEnv = {
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_GIT_COMMIT_SHA: sha,
} as unknown as NodeJS.ProcessEnv
const now = new Date("2026-11-11T23:00:00.000Z")

const ownerResult: OwnerAuthorizationResult = {
  ok: true,
  principal: {
    kind: "customer",
    subject: "test-owner-subject",
    billingEmail: "owner@example.invalid",
    email: "owner@example.invalid",
  },
}
const ownerAuth = async () => ownerResult
const deniedAuth = async () => ({
  ok: false as const,
  status: 403 as const,
  code: "UNTRUSTED_ORIGIN" as const,
})

function getRequest(query = "agentSlug=content-agent&agentVersion=content-v1") {
  return new NextRequest("https://preview.example.org/api/internal/aci/knowledge?" + query)
}
function postRequest(body: unknown) {
  return new NextRequest("https://preview.example.org/api/internal/aci/knowledge", {
    method: "POST",
    headers: {
      origin: "https://preview.example.org",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
}
function promotion() {
  return {
    action: "promote_verified_fact",
    agentSlug: "content-agent",
    agentVersion: "content-v1",
    reviewedAgainstRepoSha: sha,
    researchFindingId: "c".repeat(40),
    fact: "OpenAI trace grading evaluates complete agent traces with structured scores and labels.",
    sources: [
      { url: "https://developers.openai.com/api/docs/guides/trace-grading", title: "Trace grading", publisher: "OpenAI", retrievedAt: "2026-11-11T22:00:00.000Z" },
      { url: "https://langchain-ai.github.io/langgraph/concepts/memory/", title: "Memory overview", publisher: "LangChain", retrievedAt: "2026-11-11T22:00:00.000Z" },
    ],
    attestations: {
      sourceContentReviewed: true,
      sourcesIndependent: true,
      publicOnly: true,
      noCustomerDataOrSecrets: true,
      factOnlyNoInstructions: true,
    },
  }
}
function fact(): AciVerifiedKnowledge {
  return {
    id: "b".repeat(40),
    agentSlug: "content-agent",
    agentVersion: "content-v1",
    reviewedAgainstRepoSha: sha,
    researchFindingId: "c".repeat(40),
    knowledgeType: "semantic_fact",
    fact: "OpenAI trace grading evaluates complete agent traces with structured scores and labels.",
    classification: "public",
    status: "active",
    sources: [
      { url: "https://developers.openai.com/api/docs/guides/trace-grading", title: "Trace grading", publisher: "OpenAI", retrievedAt: "2026-11-11T22:00:00.000Z" },
      { url: "https://langchain-ai.github.io/langgraph/concepts/memory/", title: "Memory overview", publisher: "LangChain", retrievedAt: "2026-11-11T22:00:00.000Z" },
    ],
    verification: {
      level: "owner_attested_two_source_review",
      reviewedBy: "owner",
      reviewedAt: now.toISOString(),
      sourceContentReviewedByOwner: true,
      sourceIndependenceAttestedByOwner: true,
      sourceAuthenticityMachineVerified: false,
      trustedInstructions: false,
      mayExecute: false,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: "2026-12-11T23:00:00.000Z",
    revokedAt: null,
    revocationReason: null,
  }
}

test("Production and unrelated Preview branches return 404 before owner auth", async () => {
  let called = false
  const authorize = async () => { called = true; return ownerResult }
  const production = await handleAciKnowledgeGet(getRequest(), { env: productionEnv, authorize })
  assert.equal(production.status, 404)
  assert.equal(called, false)

  const otherBranch = await handleAciKnowledgeGet(getRequest(), {
    env: { ...previewEnv, VERCEL_GIT_COMMIT_REF: "feat/other" } as unknown as NodeJS.ProcessEnv,
    authorize,
  })
  assert.equal(otherBranch.status, 404)
  assert.equal(called, false)
})

test("GET requires owner auth and returns only exact agent/version facts", async () => {
  const denied = await handleAciKnowledgeGet(getRequest(), { env: previewEnv, authorize: async () => ({ ok: false as const, status: 401 as const, code: "OWNER_SESSION_REQUIRED" as const }) })
  assert.equal(denied.status, 401)

  let scope: string[] = []
  const list = async (agent: string, version: string) => {
    scope = [agent, version]
    return [fact()]
  }
  const response = await handleAciKnowledgeGet(getRequest(), {
    env: previewEnv, authorize: ownerAuth, list: list as never, now,
  })
  assert.equal(response.status, 200)
  assert.deepEqual(scope, ["content-agent", "content-v1"])
  const body = await response.json()
  assert.equal(body.status, "owner_attested")
  assert.equal(body.facts.length, 1)
  assert.equal(body.sourceAuthenticityMachineVerified, false)
  assert.equal(body.trustedInstructions, false)
  assert.equal(body.mayExecute, false)
  assert.equal(body.productionApproved, false)
})

test("GET rejects unknown, duplicated, and unexpected query parameters", async () => {
  for (const query of [
    "agentSlug=unknown-agent&agentVersion=content-v1",
    "agentSlug=content-agent&agentVersion=content-v1&agentSlug=content-agent",
    "agentSlug=content-agent&agentVersion=content-v1&token=secret",
    "agentSlug=content-agent&agentVersion=content-v1&limit=101",
  ]) {
    const response = await handleAciKnowledgeGet(getRequest(query), { env: previewEnv, authorize: ownerAuth, now })
    assert.equal(response.status, 400, query)
  }
})

test("POST rejects an untrusted origin before calling the persistence adapter", async () => {
  let called = false
  const response = await handleAciKnowledgePost(postRequest(promotion()), {
    env: previewEnv,
    authorize: deniedAuth,
    promote: (async () => { called = true; throw new Error("should not run") }) as never,
    now,
  })
  assert.equal(response.status, 403)
  assert.equal((await response.json()).code, "UNTRUSTED_ORIGIN")
  assert.equal(called, false)
})

test("POST promotes an owner-attested fact only for a recent checks-passed research finding and exact Preview SHA", async () => {
  let stored: unknown = null
  const promote = async (payload: unknown) => {
    stored = payload
    return { fact: fact(), new: true }
  }
  const getFinding = async () => ({
    id: "c".repeat(40), origin: "owner_research", category: "update",
    area: "aci-research", summary: "Public trace-grading research reference.",
    evidenceUrl: "https://developers.openai.com/api/docs/guides/trace-grading",
    sourceFingerprint: "aci-research-fingerprint", sourceObservedAt: now.toISOString(),
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
    severity: "opportunity", confidence: "unverified",
    businessImpact: "Research only.", estimatedCostUsd: null, policy: "escalate",
    state: "checks_passed", pr: { url: "https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/328", headSha: "d".repeat(40), verifiedAt: now.toISOString(), ciVerifiedAt: now.toISOString() },
    history: [],
  })
  const response = await handleAciKnowledgePost(postRequest(promotion()), {
    env: previewEnv, authorize: ownerAuth, promote: promote as never, getFinding: getFinding as never, now,
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.executionPerformed, false)
  assert.equal(body.productionReleaseAuthorized, false)
  assert.equal((stored as Record<string, unknown>).reviewedAgainstRepoSha, sha)
  assert.equal(Object.hasOwn(stored as Record<string, unknown>, "action"), false)
})

test("POST rejects a stale code version, unknown agent, incomplete attestation and extra fields", async () => {
  const cases = [
    { ...promotion(), reviewedAgainstRepoSha: "c".repeat(40) },
    { ...promotion(), agentSlug: "unknown-agent" },
    { ...promotion(), attestations: { ...promotion().attestations, sourceContentReviewed: false } },
    { ...promotion(), customerEmail: "customer@example.com" },
  ]
  for (const payload of cases) {
    const response = await handleAciKnowledgePost(postRequest(payload), {
      env: previewEnv, authorize: ownerAuth, promote: (async () => { throw new Error("must not run") }) as never, now,
    })
    assert.ok(response.status === 400 || response.status === 409)
  }
})

test("POST refuses to promote a fact from an unverified or missing research finding", async () => {
  let promoted = false
  const response = await handleAciKnowledgePost(postRequest(promotion()), {
    env: previewEnv,
    authorize: ownerAuth,
    getFinding: (async () => ({
      id: "c".repeat(40), origin: "owner_research", category: "update",
      area: "aci-research", summary: "Unverified source record.",
      evidenceUrl: null, sourceFingerprint: "source", sourceObservedAt: now.toISOString(),
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
      severity: "opportunity", confidence: "unverified",
      businessImpact: "Research only.", estimatedCostUsd: null, policy: "escalate",
      state: "observed", pr: null, history: [],
    })) as never,
    promote: (async () => { promoted = true; return { fact: fact(), new: true } }) as never,
    now,
  })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, "ACI_KNOWLEDGE_RESEARCH_FINDING_NOT_VERIFIED")
  assert.equal(promoted, false)
})

test("POST can revoke an existing fact without deleting its audit record", async () => {
  let revokedId = ""
  const response = await handleAciKnowledgePost(postRequest({
    action: "revoke_verified_fact",
    id: "b".repeat(40),
    agentSlug: "content-agent",
    agentVersion: "content-v1",
    reason: "The cited guidance has been superseded by a newer official source.",
  }), {
    env: previewEnv,
    authorize: ownerAuth,
    revoke: (async (input: { id: string; agentSlug: string; agentVersion: string; reason: string }) => { revokedId = input.id; return { ...fact(), status: "revoked" as const, revokedAt: now.toISOString(), revocationReason: input.reason } }) as never,
    now,
  })
  assert.equal(response.status, 200)
  assert.equal(revokedId, "b".repeat(40))
  assert.equal((await response.json()).executionPerformed, false)
})
