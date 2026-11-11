import { createHash } from "node:crypto"

import { agents } from "@/app/agents/agentCatalog"
import {
  getMaintenanceRedis,
  type MaintenanceOptions,
  type MaintenanceRedis,
} from "@/lib/server/maintenance-lifecycle"

const PREFIX = "ams:maintenance:v1:aci-knowledge:v1"
const MAX_FACTS_PER_SCOPE = 100
const RETENTION_SECONDS = 90 * 24 * 60 * 60
const FACT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const CLOCK_SKEW_MS = 5 * 60 * 1000

const AGENT_SLUGS = new Set(agents.map((agent) => agent.slug))
const SHA40 = /^[a-f0-9]{40}$/
const SOURCE_FIELDS = ["url", "title", "publisher", "retrievedAt"] as const
const ATTESTATION_FIELDS = [
  "sourceContentReviewed",
  "sourcesIndependent",
  "publicOnly",
  "noCustomerDataOrSecrets",
  "factOnlyNoInstructions",
] as const

export type AciKnowledgeSourceInput = {
  url: string
  title: string
  publisher: string
  retrievedAt: string
}

export type AciKnowledgeAttestations = {
  sourceContentReviewed: true
  sourcesIndependent: true
  publicOnly: true
  noCustomerDataOrSecrets: true
  factOnlyNoInstructions: true
}

export type AciVerifiedKnowledgeInput = {
  agentSlug: string
  agentVersion: string
  reviewedAgainstRepoSha: string
  researchFindingId: string
  fact: string
  sources: AciKnowledgeSourceInput[]
  attestations: AciKnowledgeAttestations
}

export type AciVerifiedKnowledge = {
  id: string
  agentSlug: string
  agentVersion: string
  reviewedAgainstRepoSha: string
  researchFindingId: string
  knowledgeType: "semantic_fact"
  fact: string
  classification: "public"
  status: "active" | "revoked"
  sources: AciKnowledgeSourceInput[]
  verification: {
    level: "owner_attested_two_source_review"
    reviewedBy: "owner"
    reviewedAt: string
    sourceContentReviewedByOwner: true
    sourceIndependenceAttestedByOwner: true
    sourceAuthenticityMachineVerified: false
    trustedInstructions: false
    mayExecute: false
  }
  createdAt: string
  updatedAt: string
  expiresAt: string
  revokedAt: string | null
  revocationReason: string | null
}

export type AciKnowledgeOptions = MaintenanceOptions

function clean(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max)
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 40)
}

function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === fields.length && keys.every((key) => fields.includes(key))
}

function canonicalPublicUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 800) return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !/^[a-z0-9.-]+$/.test(host) ||
      !host.includes(".") ||
      host.startsWith(".") ||
      host.endsWith(".") ||
      host.includes("..") ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|onion|lan)$/.test(host)
    ) return null

    for (const key of url.searchParams.keys()) {
      if (/^(?:token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|secret|password|passwd|session|cookie|auth|authorization|signature|sig|otp|x-amz-.+|x-goog-.+)$/i.test(key)) {
        return null
      }
    }
    url.hash = ""
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["fbclid", "gclid"].includes(key.toLowerCase())) {
        url.searchParams.delete(key)
      }
    }
    url.searchParams.sort()
    return url.toString()
  } catch {
    return null
  }
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function normalizeSource(value: unknown, now: Date): AciKnowledgeSourceInput {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !exactFields(value as Record<string, unknown>, SOURCE_FIELDS)) {
    throw new Error("ACI_KNOWLEDGE_SOURCE_FIELDS_INVALID")
  }
  const source = value as AciKnowledgeSourceInput
  const url = canonicalPublicUrl(source.url)
  const title = typeof source.title === "string" ? clean(source.title, 200) : ""
  const publisher = typeof source.publisher === "string" ? clean(source.publisher, 120) : ""
  const retrieved = parseTimestamp(source.retrievedAt)
  if (!url) throw new Error("ACI_KNOWLEDGE_SOURCE_URL_INVALID")
  if (title.length < 4 || publisher.length < 2) throw new Error("ACI_KNOWLEDGE_SOURCE_METADATA_INVALID")
  if (retrieved === null || retrieved > now.getTime() + CLOCK_SKEW_MS ||
      retrieved < now.getTime() - FACT_LIFETIME_MS) {
    throw new Error("ACI_KNOWLEDGE_SOURCE_STALE_OR_FUTURE")
  }
  return {
    url,
    title,
    publisher,
    retrievedAt: new Date(retrieved).toISOString(),
  }
}

export function normalizeAciVerifiedKnowledge(
  input: unknown,
  reviewedAt: Date = new Date(),
): Omit<AciVerifiedKnowledge, "id" | "status" | "revokedAt" | "revocationReason"> {
  if (!(reviewedAt instanceof Date) || !Number.isFinite(reviewedAt.getTime())) {
    throw new Error("ACI_KNOWLEDGE_REVIEW_CLOCK_INVALID")
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ACI_KNOWLEDGE_INPUT_INVALID")
  }
  const value = input as Record<string, unknown>
  if (!exactFields(value, ["agentSlug", "agentVersion", "reviewedAgainstRepoSha", "researchFindingId", "fact", "sources", "attestations"])) {
    throw new Error("ACI_KNOWLEDGE_INPUT_FIELDS_INVALID")
  }
  if (typeof value.agentSlug !== "string" || !AGENT_SLUGS.has(value.agentSlug)) {
    throw new Error("ACI_KNOWLEDGE_AGENT_UNKNOWN")
  }
  if (typeof value.agentVersion !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/.test(value.agentVersion)) {
    throw new Error("ACI_KNOWLEDGE_AGENT_VERSION_INVALID")
  }
  if (typeof value.reviewedAgainstRepoSha !== "string" || !SHA40.test(value.reviewedAgainstRepoSha)) {
    throw new Error("ACI_KNOWLEDGE_REPO_SHA_INVALID")
  }
  if (typeof value.researchFindingId !== "string" || !SHA40.test(value.researchFindingId)) {
    throw new Error("ACI_KNOWLEDGE_RESEARCH_FINDING_INVALID")
  }
  const fact = typeof value.fact === "string" ? clean(value.fact, 500) : ""
  if (fact.length < 24) throw new Error("ACI_KNOWLEDGE_FACT_INVALID")
  if (
    /^(?:ignore|override|follow|run|execute|install|publish|delete|send|merge|deploy|change|set|enable|disable|create|modify|call|you must|always|never)\b/i.test(fact) ||
    /(?:ignore previous instructions|override (?:the )?(?:system|developer|safety) prompt|execute this|run this command|publish without approval|reveal (?:the )?(?:secret|credential|token))/i.test(fact)
  ) {
    throw new Error("ACI_KNOWLEDGE_FACT_MUST_BE_DECLARATIVE")
  }
  if (!Array.isArray(value.sources) || value.sources.length < 2 || value.sources.length > 4) {
    throw new Error("ACI_KNOWLEDGE_NEEDS_TWO_TO_FOUR_SOURCES")
  }
  const sources = value.sources.map((source) => normalizeSource(source, reviewedAt))
  const hostnames = sources.map((source) => new URL(source.url).hostname.toLowerCase())
  const publishers = sources.map((source) => source.publisher.toLowerCase())
  if (new Set(hostnames).size !== hostnames.length || new Set(publishers).size !== publishers.length) {
    throw new Error("ACI_KNOWLEDGE_SOURCES_NOT_DISTINCT")
  }
  if (!value.attestations || typeof value.attestations !== "object" || Array.isArray(value.attestations) ||
      !exactFields(value.attestations as Record<string, unknown>, ATTESTATION_FIELDS) ||
      ATTESTATION_FIELDS.some((field) => (value.attestations as Record<string, unknown>)[field] !== true)) {
    throw new Error("ACI_KNOWLEDGE_OWNER_ATTESTATIONS_REQUIRED")
  }

  const reviewed = reviewedAt.toISOString()
  const earliestSource = Math.min(...sources.map((source) => Date.parse(source.retrievedAt)))
  const expiresAt = new Date(Math.min(reviewedAt.getTime() + FACT_LIFETIME_MS, earliestSource + FACT_LIFETIME_MS)).toISOString()
  return {
    agentSlug: value.agentSlug,
    agentVersion: value.agentVersion,
    reviewedAgainstRepoSha: value.reviewedAgainstRepoSha,
    researchFindingId: value.researchFindingId,
    knowledgeType: "semantic_fact",
    fact,
    classification: "public",
    sources,
    verification: {
      level: "owner_attested_two_source_review",
      reviewedBy: "owner",
      reviewedAt: reviewed,
      sourceContentReviewedByOwner: true,
      sourceIndependenceAttestedByOwner: true,
      sourceAuthenticityMachineVerified: false,
      trustedInstructions: false,
      mayExecute: false,
    },
    createdAt: reviewed,
    updatedAt: reviewed,
    expiresAt,
  }
}

function factKey(id: string) {
  return PREFIX + ":fact:" + id
}

function indexKey(agentSlug: string, agentVersion: string) {
  return PREFIX + ":index:" + agentSlug + ":" + agentVersion
}

function parseFact(raw: unknown): AciVerifiedKnowledge | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const fact = value as AciVerifiedKnowledge
    const validTime = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value))
    if (
      !/^[a-f0-9]{40}$/.test(fact.id) ||
      !AGENT_SLUGS.has(fact.agentSlug) ||
      typeof fact.agentVersion !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/.test(fact.agentVersion) ||
      typeof fact.reviewedAgainstRepoSha !== "string" || !SHA40.test(fact.reviewedAgainstRepoSha) ||
      typeof fact.researchFindingId !== "string" || !SHA40.test(fact.researchFindingId) ||
      fact.knowledgeType !== "semantic_fact" ||
      fact.classification !== "public" ||
      !["active", "revoked"].includes(fact.status) ||
      typeof fact.fact !== "string" ||
      fact.fact.length < 24 || fact.fact.length > 500 ||
      !Array.isArray(fact.sources) || fact.sources.length < 2 || fact.sources.length > 4 ||
      !validTime(fact.createdAt) || !validTime(fact.updatedAt) || !validTime(fact.expiresAt) ||
      (fact.status === "revoked" && (!validTime(fact.revokedAt) || typeof fact.revocationReason !== "string")) ||
      fact.verification?.level !== "owner_attested_two_source_review" ||
      fact.verification?.reviewedBy !== "owner" ||
      !validTime(fact.verification?.reviewedAt) ||
      fact.verification?.sourceContentReviewedByOwner !== true ||
      fact.verification?.sourceIndependenceAttestedByOwner !== true ||
      fact.verification?.sourceAuthenticityMachineVerified !== false ||
      fact.verification?.trustedInstructions !== false ||
      fact.verification?.mayExecute !== false
    ) return null
    const sources = fact.sources.map((source) => {
      if (!source || typeof source !== "object" || !exactFields(source as unknown as Record<string, unknown>, SOURCE_FIELDS)) {
        return null
      }
      const url = canonicalPublicUrl(source.url)
      if (url !== source.url || typeof source.title !== "string" ||
          typeof source.publisher !== "string" || !validTime(source.retrievedAt)) return null
      return source
    })
    if (sources.some((source) => source === null)) return null
    if (new Set(fact.sources.map((source) => new URL(source.url).hostname)).size !== fact.sources.length ||
        new Set(fact.sources.map((source) => source.publisher.toLowerCase())).size !== fact.sources.length) return null
    const sortedUrls = [...fact.sources].map((source) => source.url).sort()
    const expectedId = hash(JSON.stringify([
      fact.agentSlug,
      fact.agentVersion,
      fact.reviewedAgainstRepoSha,
      fact.researchFindingId,
      fact.fact.toLowerCase(),
      sortedUrls,
    ]))
    if (expectedId !== fact.id) return null
    const reviewedAt = Date.parse(fact.verification.reviewedAt)
    const earliestSource = Math.min(...fact.sources.map((source) => Date.parse(source.retrievedAt)))
    const expiry = Date.parse(fact.expiresAt)
    if (expiry > reviewedAt + FACT_LIFETIME_MS || expiry > earliestSource + FACT_LIFETIME_MS) return null
    return fact
  } catch {
    return null
  }
}

export async function promoteAciVerifiedKnowledge(
  input: unknown,
  options: AciKnowledgeOptions = {},
): Promise<{ fact: AciVerifiedKnowledge; new: boolean }> {
  const now = options.now ?? new Date()
  const normalized = normalizeAciVerifiedKnowledge(input, now)
  const sources = [...normalized.sources].sort((a, b) => a.url.localeCompare(b.url))
  const id = hash(JSON.stringify([
    normalized.agentSlug,
    normalized.agentVersion,
    normalized.fact.toLowerCase(),
    sources.map((source) => source.url),
  ]))
  const fact: AciVerifiedKnowledge = {
    ...normalized,
    id,
    status: "active",
    revokedAt: null,
    revocationReason: null,
  }
  const redis = getMaintenanceRedis(options)
  const key = factKey(id)
  const created = await redis.set(key, JSON.stringify(fact), { nx: true, ex: RETENTION_SECONDS })
  if (created) {
    const index = indexKey(fact.agentSlug, fact.agentVersion)
    await redis.lpush(index, id)
    await redis.ltrim(index, 0, MAX_FACTS_PER_SCOPE - 1)
    return { fact, new: true }
  }

  const existing = parseFact(await redis.get<unknown>(key))
  if (!existing ||
      existing.agentSlug !== fact.agentSlug ||
      existing.agentVersion !== fact.agentVersion ||
      existing.fact !== fact.fact ||
      existing.status !== "active") {
    throw new Error("ACI_KNOWLEDGE_FACT_CONFLICT")
  }
  const index = indexKey(fact.agentSlug, fact.agentVersion)
  const ids = await redis.lrange<string>(index, 0, MAX_FACTS_PER_SCOPE - 1)
  if (!ids.includes(existing.id)) {
    await redis.lpush(index, existing.id)
    await redis.ltrim(index, 0, MAX_FACTS_PER_SCOPE - 1)
  }
  return { fact: existing, new: false }
}

export async function listAciVerifiedKnowledge(
  agentSlug: string,
  agentVersion: string,
  limit = 20,
  options: AciKnowledgeOptions = {},
): Promise<AciVerifiedKnowledge[]> {
  if (!AGENT_SLUGS.has(agentSlug) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/.test(agentVersion)) {
    throw new Error("ACI_KNOWLEDGE_SCOPE_INVALID")
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("ACI_KNOWLEDGE_LIMIT_INVALID")
  }
  const now = (options.now ?? new Date()).getTime()
  if (!Number.isFinite(now)) throw new Error("ACI_KNOWLEDGE_REVIEW_CLOCK_INVALID")
  const redis = getMaintenanceRedis(options)
  const ids = await redis.lrange<string>(indexKey(agentSlug, agentVersion), 0, limit - 1)
  const facts: AciVerifiedKnowledge[] = []
  for (const id of new Set(ids)) {
    const fact = parseFact(await redis.get<unknown>(factKey(String(id))))
    if (
      fact &&
      fact.agentSlug === agentSlug &&
      fact.agentVersion === agentVersion &&
      fact.status === "active" &&
      Date.parse(fact.expiresAt) > now
    ) facts.push(fact)
  }
  return facts
}

export async function revokeAciVerifiedKnowledge(
  input: { id: string; agentSlug: string; agentVersion: string; reason: string },
  options: AciKnowledgeOptions = {},
): Promise<AciVerifiedKnowledge> {
  if (!/^[a-f0-9]{40}$/.test(input.id) || !AGENT_SLUGS.has(input.agentSlug) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/.test(input.agentVersion)) {
    throw new Error("ACI_KNOWLEDGE_SCOPE_INVALID")
  }
  const reason = clean(input.reason, 300)
  if (reason.length < 12) throw new Error("ACI_KNOWLEDGE_REVOCATION_REASON_REQUIRED")
  const redis = getMaintenanceRedis(options)
  const existing = parseFact(await redis.get<unknown>(factKey(input.id)))
  if (!existing || existing.agentSlug !== input.agentSlug || existing.agentVersion !== input.agentVersion) {
    throw new Error("ACI_KNOWLEDGE_FACT_NOT_FOUND")
  }
  if (existing.status === "revoked") return existing
  const now = (options.now ?? new Date()).toISOString()
  const revoked: AciVerifiedKnowledge = {
    ...existing,
    status: "revoked",
    updatedAt: now,
    revokedAt: now,
    revocationReason: reason,
  }
  await redis.set(factKey(input.id), JSON.stringify(revoked), { ex: RETENTION_SECONDS })
  return revoked
}
