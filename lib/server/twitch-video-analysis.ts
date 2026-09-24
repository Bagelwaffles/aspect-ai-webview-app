import { generateText, Output } from "ai"
import { z } from "zod"

import { isAgentRuntimeConfigured } from "@/lib/server/agent-runtime"
import {
  getLatestTwitchMediaQueue,
  saveTwitchMediaVideoAnalysis,
  twitchVideoAnalysisRecordSchema,
  type TwitchVideoAnalysisRecord,
} from "@/lib/server/twitch-media-factory"
import { presignR2Object } from "@/lib/server/r2-presign"

export const TWITCH_VIDEO_ANALYSIS_VERSION = "twitch-video-analysis-v3" as const
export const DEFAULT_TWITCH_VIDEO_ANALYSIS_MODEL = "google/gemini-2.5-flash" as const
export const TWITCH_VIDEO_RENDER_SCORE_MIN = 65

const VIDEO_EVIDENCE_REPAIR_MODEL = "google/gemini-2.5-flash-lite" as const

const videoEvidenceSchema = z.object({
  score: z.coerce.number().int().min(0).max(100),
  recommendation: z.enum(["render", "skip"]),
  reason: z.string().trim().min(1).max(600),
  observedMoments: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
  bestStartSeconds: z.coerce.number().min(0).max(120).nullable().optional().default(null),
  bestEndSeconds: z.coerce.number().min(0).max(120).nullable().optional().default(null),
  hook: z.string().trim().min(1).max(180),
  caption: z.string().trim().min(1).max(1000),
  evidenceBoundary: z.string().trim().min(1).max(500),
}).passthrough()

export type TwitchVideoEvidence = z.infer<typeof videoEvidenceSchema>

type Options = {
  env?: NodeJS.ProcessEnv
  now?: () => Date
  force?: boolean
}

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

export function getTwitchVideoAnalysisModel(env: NodeJS.ProcessEnv = process.env) {
  return clean(env.AMS_TWITCH_VIDEO_ANALYSIS_MODEL) || DEFAULT_TWITCH_VIDEO_ANALYSIS_MODEL
}

export function isTwitchVideoAnalysisRenderEligible(
  analysis: Pick<TwitchVideoAnalysisRecord, "score" | "recommendation">,
) {
  return analysis.recommendation === "render" && analysis.score >= TWITCH_VIDEO_RENDER_SCORE_MIN
}

function clampMoment(value: number | null, duration: number) {
  if (value === null || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(duration, value))
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function truncate(value: string, max: number) {
  const cleanValue = compactWhitespace(value)
  if (cleanValue.length <= max) return cleanValue
  return cleanValue.slice(0, Math.max(1, max - 1)).trimEnd() + "…"
}

function uniqueStrings(values: string[], max: number) {
  return Array.from(new Set(values.map((value) => compactWhitespace(value)).filter(Boolean))).slice(0, max)
}

function keywordTokens(...values: string[]) {
  const stop = new Set([
    "about", "after", "again", "also", "because", "before", "being", "from", "have",
    "into", "just", "more", "that", "the", "their", "then", "there", "these", "they",
    "this", "through", "very", "what", "when", "where", "which", "while", "with", "your",
  ])
  return uniqueStrings(
    values
      .flatMap((value) => value.split(/[^A-Za-z0-9'+-]+/))
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && !stop.has(word.toLowerCase())),
    20,
  )
}

function hashtag(value: string) {
  const normalized = value.replace(/[^A-Za-z0-9]/g, "")
  return normalized ? `#${normalized.slice(0, 60)}` : null
}

export function parseTwitchVideoEvidenceText(text: string): TwitchVideoEvidence {
  const trimmed = text.trim()
  const unfenced = trimmed
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
  const first = unfenced.indexOf("{")
  const last = unfenced.lastIndexOf("}")
  if (first < 0 || last <= first) throw new Error("TWITCH_VIDEO_ANALYSIS_JSON_INVALID")
  let parsed: unknown
  try {
    parsed = JSON.parse(unfenced.slice(first, last + 1))
  } catch {
    throw new Error("TWITCH_VIDEO_ANALYSIS_JSON_INVALID")
  }
  const result = videoEvidenceSchema.safeParse(parsed)
  if (!result.success) throw new Error("TWITCH_VIDEO_ANALYSIS_JSON_INVALID")
  return result.data
}

export function buildTwitchPublishMetadata(input: {
  creatorName: string
  sourceTitle: string
  evidence: TwitchVideoEvidence
}) {
  const creator = truncate(input.creatorName || "Creator", 80)
  const evidence = input.evidence
  const observedLead = evidence.observedMoments[0] || evidence.hook
  const titleBase = truncate(observedLead || evidence.hook || "Gameplay highlight", 105)
  const canonicalTitle = truncate(titleBase, 140)
  const youtubeTitle = truncate(canonicalTitle, 100)
  const description = truncate(
    `${evidence.caption}\n\nActual Twitch footage from ${creator}. ${evidence.evidenceBoundary}`,
    5000,
  )

  const tokens = keywordTokens(
    canonicalTitle,
    evidence.caption,
    evidence.observedMoments.join(" "),
    input.sourceTitle,
    creator,
  )
  const tags = uniqueStrings([
    ...tokens.slice(0, 10),
    creator,
    "gaming",
    "Twitch",
    "gaming highlights",
    "short-form video",
  ], 20).map((value) => truncate(value, 80))

  while (tags.length < 3) tags.push(["gaming", "Twitch", "shorts"][tags.length])

  const hashCandidates = uniqueStrings([
    creator,
    ...tokens.slice(0, 5),
    "Gaming",
    "Twitch",
    "Shorts",
  ], 12)
    .map(hashtag)
    .filter((value): value is string => Boolean(value))
  const hashtags = uniqueStrings(hashCandidates, 12)
  while (hashtags.length < 3) hashtags.push(["#Gaming", "#Twitch", "#Shorts"][hashtags.length])

  const keywords = uniqueStrings([
    ...tokens,
    `${creator} Twitch`,
    "gaming highlight",
    "Twitch clip",
  ], 15).map((value) => truncate(value, 80))
  while (keywords.length < 3) keywords.push(["gaming", "Twitch clip", "gameplay"][keywords.length])

  const socialSuffix = hashtags.slice(0, 5).join(" ")
  const socialCaption = truncate(`${evidence.caption} ${socialSuffix}`, 2200)

  return {
    title: canonicalTitle,
    description,
    tags,
    hashtags,
    keywords,
    categoryLabel: "Gaming",
    twitchClipTitle: truncate(canonicalTitle, 100),
    youtube: {
      title: youtubeTitle,
      description,
      tags,
      hashtags,
    },
    tiktok: {
      caption: socialCaption,
      hashtags,
    },
    instagram: {
      caption: socialCaption,
      hashtags,
    },
    x: {
      post: truncate(evidence.caption, 280),
    },
  }
}

async function repairVideoEvidenceText(text: string): Promise<TwitchVideoEvidence | null> {
  const raw = text.trim()
  if (!raw) return null
  try {
    const result = await generateText({
      model: VIDEO_EVIDENCE_REPAIR_MODEL,
      output: Output.object({ schema: videoEvidenceSchema }),
      system: [
        "You normalize an existing video analyst response into the required object.",
        "Use only information already present in the supplied response.",
        "Do not add gameplay events, outcomes, people, dialogue, or actions that are not stated.",
        "If the response is uncertain or lacks a strong highlight, recommendation must be skip.",
        "A score below 65 must use recommendation=skip.",
      ].join("\n"),
      prompt: [
        "Normalize this Twitch video-analysis response into the required schema.",
        "Preserve uncertainty and factual boundaries.",
        raw.slice(0, 8_000),
      ].join("\n\n"),
      temperature: 0,
      maxOutputTokens: 900,
    })
    return videoEvidenceSchema.parse(result.output)
  } catch {
    return null
  }
}

async function requestVideoEvidence(input: {
  model: string
  signedUrl: string
  clipId: string
  title: string
  duration: number
  retry: boolean
}) {
  const prompt = [
    "Analyze this actual Twitch gameplay video for short-form repurposing.",
    `Clip ID: ${input.clipId}`,
    `Twitch title/context: ${input.title || "(untitled)"}`,
    `Clip duration: approximately ${input.duration} seconds.`,
    "Return one VALID JSON object only. No markdown, no code fence, no commentary.",
    "Use exactly these keys:",
    '{"score":0,"recommendation":"skip","reason":"...","observedMoments":["..."],"bestStartSeconds":null,"bestEndSeconds":null,"hook":"...","caption":"...","evidenceBoundary":"..."}',
    "score must be an integer 0-100.",
    "recommendation must be render or skip. Scores below 65 must be skip.",
    "observedMoments must contain 1-6 short statements describing only visible or audible evidence.",
    "bestStartSeconds/bestEndSeconds should identify the strongest window when useful, otherwise null.",
    "hook and caption must stay factual and grounded in the footage.",
    input.retry
      ? "Previous structured parsing failed. Keep this response especially short and syntactically valid JSON."
      : "Do not add any fields beyond those shown.",
  ].join("\n")

  const result = await generateText({
    model: input.model,
    system: [
      "You are the Aspect Marketing Solutions Twitch Video Analyst.",
      "Review the supplied actual creator gameplay footage before AMS is allowed to render a Short.",
      "Base every claim only on what is visible or audible in the supplied video.",
      "Do not invent kills, wins, reactions, dialogue, game events, people, or outcomes.",
      "Prefer clear action, tension, humor, surprise, skill, payoff, or a strong reaction.",
      "Penalize loading screens, menus, dead air, repetitive traversal, unclear context, and weak visual payoff.",
      "If evidence is ambiguous, choose skip rather than guessing.",
      "Do not publish, message, moderate, spend money, or mutate external accounts.",
      "Output only valid JSON matching the requested compact shape.",
    ].join("\n"),
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "file",
          data: new URL(input.signedUrl),
          mediaType: "video/mp4",
          filename: `${input.clipId}.mp4`,
        },
      ],
    }],
    temperature: input.retry ? 0 : 0.15,
    maxOutputTokens: 900,
  })

  return result.text
}

export async function analyzeTwitchClipVideo(
  clipId: string,
  options: Options = {},
): Promise<TwitchVideoAnalysisRecord> {
  const env = options.env ?? process.env
  if (!isAgentRuntimeConfigured(env)) throw new Error("TWITCH_VIDEO_ANALYSIS_RUNTIME_UNAVAILABLE")

  const queue = await getLatestTwitchMediaQueue({ env })
  if (!queue) throw new Error("TWITCH_MEDIA_QUEUE_NOT_FOUND")
  const item = queue.items.find((candidate) => candidate.clipId === clipId)
  if (!item) throw new Error("TWITCH_MEDIA_CLIP_NOT_FOUND")
  if (!item.objectKey || !item.importedAt || item.status === "discovered") {
    throw new Error("TWITCH_MEDIA_IMPORT_REQUIRED")
  }

  if (!options.force && item.videoAnalysis?.version === TWITCH_VIDEO_ANALYSIS_VERSION) {
    return twitchVideoAnalysisRecordSchema.parse(item.videoAnalysis)
  }

  const signed = presignR2Object("GET", item.objectKey, { expiresInSeconds: 900 }, env)
  const duration = Math.max(5, Math.min(120, item.duration ?? 60))
  const model = getTwitchVideoAnalysisModel(env)

  let raw: TwitchVideoEvidence | null = null
  for (let attempt = 0; attempt < 2 && !raw; attempt += 1) {
    const text = await requestVideoEvidence({
      model,
      signedUrl: signed.url,
      clipId: item.clipId,
      title: item.title,
      duration,
      retry: attempt > 0,
    })
    try {
      raw = parseTwitchVideoEvidenceText(text)
    } catch {
      raw = await repairVideoEvidenceText(text)
    }
  }
  if (!raw) throw new Error("TWITCH_VIDEO_ANALYSIS_EVIDENCE_INVALID")

  const score = Math.max(0, Math.min(100, Math.round(raw.score)))
  const recommendation =
    raw.recommendation === "render" && score >= TWITCH_VIDEO_RENDER_SCORE_MIN
      ? "render"
      : "skip"

  let bestStartSeconds = clampMoment(raw.bestStartSeconds, duration)
  let bestEndSeconds = clampMoment(raw.bestEndSeconds, duration)
  if (
    bestStartSeconds !== null &&
    bestEndSeconds !== null &&
    bestEndSeconds <= bestStartSeconds
  ) {
    bestStartSeconds = null
    bestEndSeconds = null
  }

  const normalizedEvidence: TwitchVideoEvidence = {
    ...raw,
    score,
    recommendation,
    bestStartSeconds,
    bestEndSeconds,
  }
  const publishMetadata = buildTwitchPublishMetadata({
    creatorName: item.creatorName || queue.broadcasterLogin,
    sourceTitle: item.title,
    evidence: normalizedEvidence,
  })

  const record = twitchVideoAnalysisRecordSchema.parse({
    version: TWITCH_VIDEO_ANALYSIS_VERSION,
    clipId: item.clipId,
    analyzedAt: (options.now ?? (() => new Date()))().toISOString(),
    model,
    score,
    recommendation,
    reason: raw.reason,
    observedMoments: raw.observedMoments,
    bestStartSeconds,
    bestEndSeconds,
    hook: raw.hook,
    caption: raw.caption,
    publishMetadata,
    evidenceBoundary: raw.evidenceBoundary,
  })

  await saveTwitchMediaVideoAnalysis(item.clipId, record, { env })
  return record
}
