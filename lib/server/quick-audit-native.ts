import { createHash } from "node:crypto"

import { Redis } from "@upstash/redis"

import type {
  QuickAuditAuditGateway,
  QuickAuditEvidence,
} from "./quick-audit-fulfillment"

const RESULT_RETENTION_SECONDS = 60 * 60 * 24 * 90

export type NativeQuickAuditFinding = {
  title: string
  observation: string
  fix: string
}

export type NativeQuickAuditPlanDay = {
  day: number
  action: string
}

export type NativeQuickAuditResult = {
  version: "native-v1"
  auditId: string
  requestId: string
  businessName: string
  websiteUrl: string
  industry: string
  goal: string
  generatedAt: string
  strengths: string[]
  findings: NativeQuickAuditFinding[]
  improvedHeadline: string
  improvedOffer: string
  promotionalPost: string
  sevenDayPlan: NativeQuickAuditPlanDay[]
  evidence: QuickAuditEvidence
}

export interface QuickAuditResultStore {
  getByRequestId(requestId: string): Promise<NativeQuickAuditResult | null>
  save(result: NativeQuickAuditResult): Promise<void>
}

type RedisLike = {
  get(key: string): Promise<unknown>
  set(key: string, value: string, options: { ex: number }): Promise<unknown>
}

function redisClient(): RedisLike | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  return url && token ? new Redis({ url, token }) : null
}

function resultKey(requestId: string) {
  return `ams:quick-audit:result:${requestId}`
}

function isNativeQuickAuditResult(value: unknown): value is NativeQuickAuditResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const candidate = value as Partial<NativeQuickAuditResult>
  return (
    candidate.version === "native-v1" &&
    typeof candidate.auditId === "string" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.businessName === "string" &&
    typeof candidate.websiteUrl === "string" &&
    typeof candidate.generatedAt === "string" &&
    Array.isArray(candidate.findings) &&
    candidate.findings.length === 5 &&
    Array.isArray(candidate.sevenDayPlan) &&
    candidate.sevenDayPlan.length === 7
  )
}

function decodeResult(raw: unknown): NativeQuickAuditResult | null {
  if (raw === null || raw === undefined) return null
  let value = raw
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  return isNativeQuickAuditResult(value) ? value : null
}

export class RedisQuickAuditResultStore implements QuickAuditResultStore {
  constructor(private readonly redis: RedisLike | null = redisClient()) {}

  async getByRequestId(requestId: string) {
    if (!this.redis) throw new Error("QUICK_AUDIT_RESULT_STORE_UNAVAILABLE")
    return decodeResult(await this.redis.get(resultKey(requestId)))
  }

  async save(result: NativeQuickAuditResult) {
    if (!this.redis) throw new Error("QUICK_AUDIT_RESULT_STORE_UNAVAILABLE")
    await this.redis.set(resultKey(result.requestId), JSON.stringify(result), {
      ex: RESULT_RETENTION_SECONDS,
    })
  }
}

function cleanSentence(value: string, max = 120) {
  const compact = value.replace(/\s+/g, " ").trim().replace(/[.?!]+$/g, "")
  return compact.slice(0, max)
}

function lowerLead(value: string) {
  if (!value) return value
  return value.charAt(0).toLowerCase() + value.slice(1)
}

function evidenceObservation(
  value: boolean | null | undefined,
  missing: string,
  unknown: string,
) {
  return value === false ? missing : unknown
}

function evidenceCandidates(evidence: QuickAuditEvidence): Array<NativeQuickAuditFinding & { key: string; priority: number }> {
  const candidates: Array<NativeQuickAuditFinding & { key: string; priority: number }> = []
  const add = (
    key: string,
    title: string,
    missing: string,
    unknown: string,
    fix: string,
    priority: number,
  ) => {
    const value = evidence[key]
    if (value === true) return
    candidates.push({
      key,
      title,
      observation: evidenceObservation(value, missing, unknown),
      fix,
      priority: value === false ? priority : priority + 20,
    })
  }

  add(
    "hasClearValueProposition",
    "The main value proposition needs to be unmistakable",
    "The automated page review did not detect a clear, descriptive primary headline.",
    "The automated review could not confirm that the primary headline explains the customer outcome clearly.",
    "Rewrite the first visible headline around one customer problem, one outcome, and the specific audience you serve.",
    1,
  )
  add(
    "hasPrimaryCta",
    "The next step needs one obvious primary call to action",
    "The automated page review did not detect a strong primary action such as book, buy, contact, request, or get started.",
    "The automated review could not confirm one dominant next step for an interested visitor.",
    "Choose one primary conversion action and repeat it near the headline, after proof, and at the bottom of the page.",
    2,
  )
  add(
    "hasLeadCapture",
    "Interested visitors need a low-friction way to become leads",
    "The automated page review did not detect an email lead-capture form.",
    "The automated review could not confirm a lead-capture path for visitors who are not ready to buy immediately.",
    "Add a short lead form or inquiry path that asks only for the information needed to start the next conversation.",
    3,
  )
  add(
    "hasTestimonials",
    "Trust proof should appear close to the buying decision",
    "The automated page review did not detect testimonial or customer-review language.",
    "The automated review could not confirm visible customer proof near the offer.",
    "Place one to three specific customer outcomes, reviews, examples, or before/after proof beside the offer and CTA.",
    4,
  )
  add(
    "hasTitleAndMeta",
    "Search-result messaging needs a complete title and description",
    "The automated page review did not confirm both a page title and meta description.",
    "The automated review could not confirm that search-result messaging is complete and intentional.",
    "Write a unique title and meta description that mirror the primary customer problem, location or niche when relevant, and the main offer.",
    5,
  )
  add(
    "hasContactInfo",
    "Contact information should be easy to find",
    "The automated page review did not detect clear contact language, a telephone link, or an email link.",
    "The automated review could not confirm that a visitor can quickly find a direct contact path.",
    "Put the preferred contact method in a predictable location and make it usable on mobile without hunting through the site.",
    6,
  )
  add(
    "hasPrivacyPolicy",
    "Lead capture should be supported by visible privacy information",
    "The automated page review did not detect a privacy-policy link.",
    "The automated review could not confirm a visible privacy-policy path.",
    "Add a clear privacy-policy link near forms and in the footer before scaling paid traffic or collecting more customer data.",
    7,
  )
  add(
    "hasLocalBusinessSchema",
    "Local discovery signals can be strengthened",
    "The automated page review did not detect LocalBusiness structured data.",
    "The automated review could not confirm LocalBusiness structured data.",
    "If the business serves a geographic market, add accurate LocalBusiness schema and keep name, address, phone, hours, and service area consistent across listings.",
    8,
  )

  return candidates.sort((a, b) => a.priority - b.priority)
}

function strategicFallbacks(input: {
  businessName: string
  industry: string
  goals: string
}): Array<NativeQuickAuditFinding & { key: string }> {
  const goal = cleanSentence(input.goals, 140)
  return [
    {
      key: "goal-conversion",
      title: "The stated goal needs one measurable conversion event",
      observation: `The intake prioritizes “${goal},” but that goal becomes actionable only when one visitor action is treated as the primary conversion.`,
      fix: "Pick one weekly conversion metric—qualified inquiry, booked call, quote request, purchase, or another real business event—and make the page work toward it.",
    },
    {
      key: "offer-specificity",
      title: "The offer needs a concrete reason to act now",
      observation: `In ${input.industry}, broad claims are easy to ignore unless the first step has a clear scope, outcome, and expectation.`,
      fix: "Package the first step so a buyer can understand what happens, what they receive, how long it takes, and what they should do next.",
    },
    {
      key: "follow-up",
      title: "Lead follow-up needs a defined owner and timing",
      observation: "Traffic only becomes revenue when new inquiries move into a consistent follow-up process.",
      fix: "Define who answers new leads, the response-time target, the first follow-up message, and the next two touches if the prospect does not respond.",
    },
    {
      key: "proof",
      title: "Marketing claims need proof tied to the buyer’s decision",
      observation: "General credibility is weaker than proof that answers the exact risk or objection a prospect has before acting.",
      fix: "Collect proof by objection: outcome examples, process screenshots, reviews, credentials, guarantees you can actually honor, or short case summaries.",
    },
    {
      key: "measurement",
      title: "The marketing system needs a simple weekly scorecard",
      observation: "Without a small set of consistent numbers, it is difficult to know whether a change improved attention, conversion, or sales activity.",
      fix: "Track weekly visits or reach, primary CTA actions, qualified leads, sales conversations, and closed revenue. Change one major variable at a time.",
    },
  ]
}

function strengthsFromEvidence(evidence: QuickAuditEvidence) {
  const labels: Record<string, string> = {
    hasClearValueProposition: "A clear primary value proposition was detected.",
    hasPrimaryCta: "A primary call to action was detected.",
    hasContactInfo: "A visible contact path was detected.",
    hasLocalBusinessSchema: "LocalBusiness structured data was detected.",
    hasTitleAndMeta: "A page title and meta description were detected.",
    hasTestimonials: "Testimonial or customer-review language was detected.",
    hasPrivacyPolicy: "A privacy-policy path was detected.",
    hasLeadCapture: "An email lead-capture form was detected.",
  }
  return Object.entries(evidence)
    .filter(([, value]) => value === true)
    .map(([key]) => labels[key])
    .filter((value): value is string => Boolean(value))
    .slice(0, 4)
}

export function buildNativeQuickAuditResult(input: {
  businessName: string
  websiteUrl: string
  industry: string
  goals: string
  notes: string
  requestId: string
  evidence: QuickAuditEvidence
  now?: () => Date
}): NativeQuickAuditResult {
  const businessName = cleanSentence(input.businessName, 100)
  const industry = cleanSentence(input.industry, 80)
  const goal = cleanSentence(input.goals, 140)
  const auditId = `audit_${createHash("sha256").update(input.requestId).digest("hex").slice(0, 24)}`

  const selected = evidenceCandidates(input.evidence).map(({ key: _key, priority: _priority, ...finding }) => finding)
  const usedTitles = new Set(selected.map((finding) => finding.title))
  for (const { key: _key, ...fallback } of strategicFallbacks({ businessName, industry, goals: input.goals })) {
    if (selected.length >= 5) break
    if (!usedTitles.has(fallback.title)) {
      selected.push(fallback)
      usedTitles.add(fallback.title)
    }
  }

  const improvedHeadline = `${businessName}: ${goal.charAt(0).toUpperCase()}${goal.slice(1)} — with a clearer path from interest to action.`
  const improvedOffer = `Make the first step easy to understand: a clearly scoped ${lowerLead(industry)} solution from ${businessName}, one expected outcome, one primary next step, and a stated response or delivery expectation.`
  const promotionalPost = `Trying to ${lowerLead(goal)}? ${businessName} is making the next step simpler. See what we offer, decide whether it fits your situation, and take one clear next action here: ${input.websiteUrl}`

  return {
    version: "native-v1",
    auditId,
    requestId: input.requestId,
    businessName,
    websiteUrl: input.websiteUrl,
    industry,
    goal,
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    strengths: strengthsFromEvidence(input.evidence),
    findings: selected.slice(0, 5),
    improvedHeadline,
    improvedOffer,
    promotionalPost,
    sevenDayPlan: [
      { day: 1, action: "Choose the single conversion event that matters most this week and write down the current baseline." },
      { day: 2, action: "Rewrite the primary headline and first-screen message around one audience problem and one outcome." },
      { day: 3, action: "Make one primary CTA dominant on desktop and mobile, then remove or demote competing actions." },
      { day: 4, action: "Add or strengthen proof beside the offer: a review, example, result, credential, or process proof that answers a buyer objection." },
      { day: 5, action: "Test the lead or inquiry path yourself from a phone and define the response-time and follow-up sequence." },
      { day: 6, action: "Publish the promotional post, send traffic to the improved page, and record where the visits or inquiries came from." },
      { day: 7, action: "Review the scorecard, keep what improved the primary conversion, and choose only one major change for the next test." },
    ],
    evidence: input.evidence,
  }
}

export function createNativeQuickAuditAuditGateway(config: {
  store?: QuickAuditResultStore
  now?: () => Date
} = {}): QuickAuditAuditGateway {
  const store = config.store ?? new RedisQuickAuditResultStore()
  return {
    async run(input) {
      const existing = await store.getByRequestId(input.requestId)
      if (existing) return { auditId: existing.auditId }
      const result = buildNativeQuickAuditResult({ ...input, now: config.now })
      await store.save(result)
      return { auditId: result.auditId }
    },
  }
}
