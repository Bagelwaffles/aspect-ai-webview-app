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

export const TWITCH_VIDEO_ANALYSIS_VERSION = "twitch-video-analysis-v2" as const
export const DEFAULT_TWITCH_VIDEO_ANALYSIS_MODEL = "google/gemini-2.5-flash" as const
export const TWITCH_VIDEO_RENDER_SCORE_MIN = 65

const modelOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  recommendation: z.enum(["render", "skip"]),
  reason: z.string().trim().min(1).max(600),
  observedMoments: z.array(z.string().trim().min(1).max(240)).max(6),
  bestStartSeconds: z.number().min(0).max(120).nullable(),
  bestEndSeconds: z.number().min(0).max(120).nullable(),
  hook: z.string().trim().min(1).max(180),
  caption: z.string().trim().min(1).max(1000),
  publishMetadata: z.object({
    title: z.string().trim().min(1).max(140),
    description: z.string().trim().min(1).max(5000),
    tags: z.array(z.string().trim().min(1).max(80)).min(3).max(20),
    hashtags: z.array(z.string().trim().min(1).max(80)).min(3).max(12),
    keywords: z.array(z.string().trim().min(1).max(80)).min(3).max(15),
    categoryLabel: z.string().trim().min(1).max(120),
    twitchClipTitle: z.string().trim().min(1).max(100),
    youtube: z.object({
      title: z.string().trim().min(1).max(100),
      description: z.string().trim().min(1).max(5000),
      tags: z.array(z.string().trim().min(1).max(80)).min(3).max(20),
      hashtags: z.array(z.string().trim().min(1).max(80)).min(3).max(12),
    }).strict(),
    tiktok: z.object({
      caption: z.string().trim().min(1).max(2200),
      hashtags: z.array(z.string().trim().min(1).max(80)).min(3).max(12),
    }).strict(),
    instagram: z.object({
      caption: z.string().trim().min(1).max(2200),
      hashtags: z.array(z.string().trim().min(1).max(80)).min(3).max(12),
    }).strict(),
    x: z.object({
      post: z.string().trim().min(1).max(280),
    }).strict(),
  }).strict(),
  evidenceBoundary: z.string().trim().min(1).max(500),
}).strict()

type TwitchVideoModelOutput = z.infer<typeof modelOutputSchema>

function jsonCandidates(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return []

  const withoutFence = trimmed
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/i, "")
    .trim()

  const firstBrace = withoutFence.indexOf("{")
  const lastBrace = withoutFence.lastIndexOf("}")
  const extracted = firstBrace >= 0 && lastBrace > firstBrace
    ? withoutFence.slice(firstBrace, lastBrace + 1)
    : ""

  return Array.from(new Set([trimmed, withoutFence, extracted].filter(Boolean)))
}

export function recoverTwitchVideoAnalysisOutput(text: string): TwitchVideoModelOutput | null {
  for (const candidate of jsonCandidates(text)) {
    try {
      const parsedJson = JSON.parse(candidate)
      const parsed = modelOutputSchema.safeParse(parsedJson)
      if (parsed.success) return parsed.data
    } catch {
      // Try the next bounded candidate.
    }
  }
  return null
}

function structuredOutputErrorText(error: unknown) {
  if (!error || typeof error !== "object" || !("text" in error)) return null
  const text = (error as { text?: unknown }).text
  return typeof text === "string" ? text : null
}

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

  let raw: TwitchVideoModelOutput
  try {
    const result = await generateText({
      model,
      output: Output.object({ schema: modelOutputSchema }),
    system: [
      "You are the Aspect Marketing Solutions Twitch Video Analyst.",
      "You are reviewing actual creator gameplay footage before AMS is allowed to render a Short.",
      "Base every claim only on what is visible or audible in the supplied video.",
      "Do not invent kills, wins, reactions, dialogue, game events, people, or outcomes.",
      "Prefer moments with clear action, tension, humor, surprise, skill, payoff, or a strong reaction.",
      "Create a complete publish-ready metadata package from the actual footage: title, description, tags, hashtags, keywords, category label, Twitch clip title, YouTube metadata, TikTok caption, Instagram caption, and X copy.",
      "Titles and descriptions must describe only what is actually visible or audible. Do not use fake hype, unsupported outcomes, or invented game events.",
      "Penalize loading screens, menus, dead air, repetitive traversal, unclear context, and weak visual payoff.",
      "A score below 65 must be recommendation=skip.",
      "If evidence is ambiguous, skip rather than guessing.",
      "Do not publish, message, moderate, spend money, or mutate external accounts.",
      "Return only the structured analysis object.",
    ].join("\n"),
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: [
            `Analyze this Twitch gameplay clip for Short-form repurposing.`,
            `Clip ID: ${item.clipId}`,
            `Twitch title: ${item.title || "(untitled)"}`,
            `Clip duration: approximately ${duration} seconds.`,
            `Score 0-100 for whether this actual footage deserves a private 9:16 Short.`,
            `Identify only observed moments. Give the strongest approximate start/end window within the clip when possible.`,
            `Write the hook, caption, and complete publish metadata from the actual footage, not metadata-only assumptions.`,
            `Make the main title strong enough to be the canonical AMS Short title. Produce platform-specific variants where useful.`,
          ].join("\n"),
        },
        {
          type: "file",
          data: new URL(signed.url),
          mediaType: "video/mp4",
          filename: `${item.clipId}.mp4`,
        },
      ],
    }],
      temperature: 0.2,
      maxOutputTokens: 1_000,
    })
    raw = modelOutputSchema.parse(result.output)
  } catch (error) {
    const recovered = recoverTwitchVideoAnalysisOutput(structuredOutputErrorText(error) ?? "")
    if (!recovered) throw error
    raw = recovered
  }

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
    publishMetadata: raw.publishMetadata,
    evidenceBoundary: raw.evidenceBoundary,
  })

  await saveTwitchMediaVideoAnalysis(item.clipId, record, { env })
  return record
}
