import { z } from "zod"

export const liveResearchInputSchema = z
  .object({
    query: z.string().trim().min(3).max(500),
    topic: z.enum(["general", "news"]).default("general"),
    maxResults: z.number().int().min(1).max(8).default(5),
  })
  .strict()

export type LiveResearchInput = z.infer<typeof liveResearchInputSchema>

const tavilyResultSchema = z.object({
  title: z.string().default("Untitled source"),
  url: z.string().url(),
  content: z.string().default(""),
  score: z.number().optional(),
  published_date: z.string().nullable().optional(),
})

const tavilyResponseSchema = z.object({
  results: z.array(tavilyResultSchema).default([]),
  request_id: z.string().optional(),
})

export type LiveResearchSource = {
  title: string
  url: string
  snippet: string
  score: number | null
  publishedDate: string | null
}

export type LiveResearchResult = {
  query: string
  topic: "general" | "news"
  researchedAt: string
  sources: LiveResearchSource[]
  providerRequestId: string | null
}

function apiKey(env: NodeJS.ProcessEnv = process.env) {
  return env.TAVILY_API_KEY?.trim() || null
}

export function isLiveResearchConfigured(env: NodeJS.ProcessEnv = process.env) {
  return apiKey(env) !== null
}

function cleanSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 1_200)
}

export async function runLiveResearch(
  input: LiveResearchInput,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<LiveResearchResult> {
  const key = apiKey(env)
  if (!key) throw new Error("LIVE_RESEARCH_NOT_CONFIGURED")

  const validated = liveResearchInputSchema.parse(input)
  const response = await fetcher("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: validated.query,
      search_depth: "basic",
      max_results: validated.maxResults,
      topic: validated.topic,
      include_published_date: true,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      include_favicon: false,
      safe_search: true,
    }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  })

  if (!response.ok) {
    if (response.status === 429 || response.status === 432 || response.status === 433) {
      throw new Error("LIVE_RESEARCH_USAGE_LIMIT")
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("LIVE_RESEARCH_AUTH_FAILED")
    }
    throw new Error("LIVE_RESEARCH_PROVIDER_FAILED")
  }

  const parsed = tavilyResponseSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error("LIVE_RESEARCH_INVALID_RESPONSE")

  return {
    query: validated.query,
    topic: validated.topic,
    researchedAt: new Date().toISOString(),
    providerRequestId: parsed.data.request_id ?? null,
    sources: parsed.data.results.map((result) => ({
      title: result.title.trim().slice(0, 240) || "Untitled source",
      url: result.url,
      snippet: cleanSnippet(result.content),
      score: typeof result.score === "number" ? result.score : null,
      publishedDate: result.published_date ?? null,
    })),
  }
}
