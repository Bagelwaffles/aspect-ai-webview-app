import { createHash } from "node:crypto"

export type AciSourceKind =
  | "official_docs"
  | "official_video"
  | "independent_video"
  | "source_code"
  | "research_article"

export type AciResearchCandidateInput = {
  dataClassification: "public" | "internal" | "customer"
  affectedAgentId: string
  baselineRepoSha: string
  claim: string
  source: {
    kind: AciSourceKind
    url: string
    title: string
    publisher: string
    retrievedAt: string
    publishedAt?: string
  }
  corroborationUrls: string[]
}

export type AciResearchRecord = {
  fingerprint: string
  status: "research_only"
  verified: false
  trustedInstructions: false
  mayExecute: false
  dataClassification: "public"
  affectedAgentId: string
  baselineRepoSha: string
  claim: string
  source: AciResearchCandidateInput["source"]
  corroborationUrls: string[]
}

export type AciResearchAssessment =
  | { accepted: true; record: AciResearchRecord; reasons: [] }
  | { accepted: false; record: null; reasons: string[] }

const SOURCE_KINDS = new Set<AciSourceKind>([
  "official_docs",
  "official_video",
  "independent_video",
  "source_code",
  "research_article",
])

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

// This is input validation only, NOT an SSRF-safe network fetcher.
export function canonicalPublicSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1500) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null
    const host = url.hostname.toLowerCase()
    if (
      !/^[a-z0-9.-]+$/.test(host) ||
      !host.includes(".") ||
      host.startsWith(".") ||
      host.endsWith(".") ||
      host.includes("..") ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|onion|lan)$/.test(host)
    ) return null

    url.hash = ""
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["fbclid", "gclid", "si"].includes(key.toLowerCase())) {
        url.searchParams.delete(key)
      }
    }
    url.searchParams.sort()
    return url.toString()
  } catch {
    return null
  }
}

function parseDate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null
  const millis = Date.parse(value)
  return Number.isFinite(millis) ? millis : null
}

export function assessPublicResearchCandidate(
  input: unknown,
  now: Date = new Date(),
): AciResearchAssessment {
  const reasons: string[] = []
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { accepted: false, record: null, reasons: ["INVALID_INPUT"] }
  }
  const candidate = input as Partial<AciResearchCandidateInput>
  if (candidate.dataClassification !== "public") reasons.push("NONPUBLIC_DATA")
  if (
    typeof candidate.affectedAgentId !== "string" ||
    !/^[a-z0-9][a-z0-9-]{1,79}$/.test(candidate.affectedAgentId)
  ) reasons.push("INVALID_AGENT")
  if (
    typeof candidate.baselineRepoSha !== "string" ||
    !/^[a-f0-9]{40}$/.test(candidate.baselineRepoSha)
  ) reasons.push("INVALID_REPO_SHA")
  const claim = typeof candidate.claim === "string" ? candidate.claim.trim().replace(/\s+/g, " ") : ""
  if (claim.length < 16 || claim.length > 500) reasons.push("INVALID_CLAIM")

  const source = candidate.source
  const sourceUrl = canonicalPublicSourceUrl(source?.url)
  if (!sourceUrl) reasons.push("INVALID_SOURCE_URL")
  if (!source || !SOURCE_KINDS.has(source.kind as AciSourceKind)) reasons.push("INVALID_SOURCE_KIND")
  if (typeof source?.title !== "string" || source.title.trim().length < 4 || source.title.length > 200) {
    reasons.push("INVALID_TITLE")
  }
  if (typeof source?.publisher !== "string" || source.publisher.trim().length < 2 || source.publisher.length > 120) {
    reasons.push("INVALID_PUBLISHER")
  }

  const time = now.getTime()
  const retrievedAt = parseDate(source?.retrievedAt)
  if (
    retrievedAt === null ||
    retrievedAt > time + FUTURE_TOLERANCE_MS ||
    retrievedAt < time - MAX_AGE_MS
  ) reasons.push("STALE_OR_INVALID_RETRIEVAL")
  const publishedAt = source?.publishedAt === undefined ? null : parseDate(source.publishedAt)
  if (source?.publishedAt !== undefined && (publishedAt === null || publishedAt > time + FUTURE_TOLERANCE_MS)) {
    reasons.push("INVALID_PUBLICATION_DATE")
  }

  const rawCorroboration = candidate.corroborationUrls
  const corroborationUrls = Array.isArray(rawCorroboration)
    ? rawCorroboration.map(canonicalPublicSourceUrl)
    : []
  if (
    corroborationUrls.length < 1 ||
    corroborationUrls.length > 5 ||
    corroborationUrls.some((url) => !url || url === sourceUrl) ||
    new Set(corroborationUrls).size !== corroborationUrls.length
  ) reasons.push("INVALID_CORROBORATION")

  if (reasons.length > 0) return { accepted: false, record: null, reasons }
  // A valid candidate has NOT been independently verified and cannot be promoted to an instruction.
  const record: AciResearchRecord = {
    fingerprint: createHash("sha256").update(JSON.stringify([
      candidate.affectedAgentId,
      sourceUrl,
      claim.toLowerCase(),
    ])).digest("hex"),
    status: "research_only",
    verified: false,
    trustedInstructions: false,
    mayExecute: false,
    dataClassification: "public",
    affectedAgentId: candidate.affectedAgentId!,
    baselineRepoSha: candidate.baselineRepoSha!,
    claim,
    source: {
      kind: source!.kind,
      url: sourceUrl!,
      title: source!.title.trim(),
      publisher: source!.publisher.trim(),
      retrievedAt: source!.retrievedAt,
      ...(source!.publishedAt ? { publishedAt: source!.publishedAt } : {}),
    },
    corroborationUrls: corroborationUrls as string[],
  }
  return { accepted: true, record, reasons: [] }
}
