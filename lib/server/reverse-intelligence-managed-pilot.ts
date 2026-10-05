import { z } from "zod"

import type { LiveResearchResult } from "./live-research"

export const AMS_MANAGED_INTELLIGENCE_PILOT_ENV =
  "AMS_MANAGED_INTELLIGENCE_PILOT_ENABLED" as const

const DEFAULT_MODEL = "gpt-6.1-sol"
const AGENTS_API_BASE = "https://api.openai.com/v1/agents/sessions"
const DEFAULT_POLL_ATTEMPTS = 60
const DEFAULT_POLL_INTERVAL_MS = 500

const sessionSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
})

const tokenUsageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative(),
    input_tokens_details: z
      .object({ cached_tokens: z.number().int().nonnegative().default(0) })
      .default({ cached_tokens: 0 }),
    output_tokens: z.number().int().nonnegative(),
    output_tokens_details: z
      .object({ reasoning_tokens: z.number().int().nonnegative().default(0) })
      .default({ reasoning_tokens: 0 }),
    total_tokens: z.number().int().nonnegative(),
  })
  .nullable()
  .optional()

const turnSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  error: z.unknown().nullable().optional(),
  usage: tokenUsageSchema,
})

const turnListSchema = z.object({
  data: z.array(turnSchema).default([]),
})

const messageContentSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
})

const sessionItemSchema = z
  .object({
    type: z.string(),
    role: z.string().optional(),
    status: z.string().optional(),
    content: z.array(messageContentSchema).optional(),
  })
  .passthrough()

const sessionItemListSchema = z.object({
  data: z.array(sessionItemSchema).default([]),
})

export type ManagedIntelligencePilotResult = {
  sessionId: string
  turnId: string
  model: string
  outputText: string
  latencyMs: number
  usage:
    | {
        inputTokens: number
        cachedInputTokens: number
        outputTokens: number
        reasoningTokens: number
        totalTokens: number
      }
    | null
}

export function isManagedIntelligencePilotConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env[AMS_MANAGED_INTELLIGENCE_PILOT_ENV]?.trim().toLowerCase() === "true" &&
    Boolean(env.OPENAI_API_KEY?.trim())
  )
}

function configuredModel(env: NodeJS.ProcessEnv) {
  return env.AMS_MANAGED_INTELLIGENCE_PILOT_MODEL?.trim() || DEFAULT_MODEL
}

function configuredMultiAgent(env: NodeJS.ProcessEnv) {
  return env.AMS_MANAGED_INTELLIGENCE_MULTI_AGENT?.trim().toLowerCase() === "true"
}

function configuredPollAttempts(env: NodeJS.ProcessEnv) {
  const parsed = Number(env.AMS_MANAGED_INTELLIGENCE_POLL_ATTEMPTS)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 120) return DEFAULT_POLL_ATTEMPTS
  return parsed
}

function sourcePacket(research: LiveResearchResult) {
  return research.sources
    .map(
      (source, index) =>
        [
          `SOURCE ${index + 1}`,
          `Title: ${source.title}`,
          `URL: ${source.url}`,
          `Published: ${source.publishedDate ?? "unknown"}`,
          `Evidence: ${source.snippet}`,
        ].join("\n"),
    )
    .join("\n\n")
}

function buildPrompt(research: LiveResearchResult) {
  return [
    `Research question: ${research.query}`,
    `Research timestamp: ${research.researchedAt}`,
    "",
    "Use ONLY the source packets below as factual evidence.",
    "Do not add facts from memory or unsupported assumptions.",
    "If a conclusion is not supported by the packets, say so explicitly.",
    "Produce a concise AMS intelligence brief with these sections:",
    "1. What changed",
    "2. Why it matters to Aspect Marketing Solutions",
    "3. Recommended action: adopt, test, monitor, or ignore",
    "4. Risks / unknowns",
    "5. Sources, preserving the supplied URLs",
    "",
    sourcePacket(research),
  ].join("\n")
}

function instructions() {
  return [
    "You are the internal Reverse-Engineering Intelligence Agent for Aspect Marketing Solutions.",
    "Your job is to convert supplied public-source evidence into an operator-ready change brief.",
    "Never claim a release, price, capability, benchmark, integration, or competitive implication that is not supported by the supplied evidence.",
    "Never execute external actions. This pilot is synthesis-only.",
    "Prefer practical adoption implications, expected leverage, migration risk, and whether existing working AMS systems should remain untouched.",
  ].join(" ")
}

function apiErrorCode(status: number) {
  if (status === 401 || status === 403) return "MANAGED_INTELLIGENCE_AUTH_FAILED"
  if (status === 429) return "MANAGED_INTELLIGENCE_RATE_LIMITED"
  return "MANAGED_INTELLIGENCE_PROVIDER_FAILED"
}

async function apiJson(
  path: string,
  init: RequestInit,
  apiKey: string,
  fetcher: typeof fetch,
) {
  const response = await fetcher(`${AGENTS_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "agents=v1",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(apiErrorCode(response.status))
  }

  return response.json()
}

function assistantOutputText(items: z.infer<typeof sessionItemSchema>[]) {
  const chunks: string[] = []

  for (const item of items) {
    if (item.type !== "message" || item.role !== "assistant") continue

    for (const part of item.content ?? []) {
      if (part.type !== "output_text" || !part.text?.trim()) continue
      chunks.push(part.text.trim())
    }
  }

  return chunks.join("\n\n").trim()
}

function normalizedUsage(turn: z.infer<typeof turnSchema>) {
  const usage = turn.usage
  if (!usage) return null

  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details.cached_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details.reasoning_tokens,
    totalTokens: usage.total_tokens,
  }
}

async function retrieveCompletedTurnWithUsage(
  sessionId: string,
  turnId: string,
  apiKey: string,
  fetcher: typeof fetch,
  sleep: (ms: number) => Promise<void>,
) {
  let completedTurn: z.infer<typeof turnSchema> | null = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    completedTurn = turnSchema.parse(
      await apiJson(
        `/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`,
        { method: "GET" },
        apiKey,
        fetcher,
      ),
    )

    if (completedTurn.status !== "completed") {
      throw new Error("MANAGED_INTELLIGENCE_TURN_STATE_CHANGED")
    }

    if (completedTurn.usage || attempt === 7) return completedTurn
    await sleep(500)
  }

  return completedTurn!
}

export async function runManagedIntelligencePilot(
  research: LiveResearchResult,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<ManagedIntelligencePilotResult> {
  if (!isManagedIntelligencePilotConfigured(env)) {
    throw new Error("MANAGED_INTELLIGENCE_NOT_CONFIGURED")
  }

  if (research.sources.length === 0) {
    throw new Error("MANAGED_INTELLIGENCE_REQUIRES_SOURCES")
  }

  const apiKey = env.OPENAI_API_KEY!.trim()
  const model = configuredModel(env)
  const multiAgent = configuredMultiAgent(env)
  const startedAt = Date.now()

  const createBody = {
    agent: {
      model,
      instructions: instructions(),
      ...(multiAgent
        ? { multi_agent: { enabled: true, max_concurrent_subagents: 2 } }
        : {}),
    },
    environment: { type: "none" },
    input: buildPrompt(research),
    metadata: {
      ams_agent: "reverse-engineering-intelligence",
      ams_pilot: "managed-agents-v1",
    },
    stream: false,
  }

  const created = sessionSchema.parse(
    await apiJson(
      "",
      {
        method: "POST",
        body: JSON.stringify(createBody),
      },
      apiKey,
      fetcher,
    ),
  )

  const attempts = configuredPollAttempts(env)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const turns = turnListSchema.parse(
      await apiJson(
        `/${encodeURIComponent(created.id)}/turns?order=desc&limit=1`,
        { method: "GET" },
        apiKey,
        fetcher,
      ),
    )

    const turn = turns.data[0]
    if (!turn) {
      await sleep(DEFAULT_POLL_INTERVAL_MS)
      continue
    }

    if (turn.status === "failed") {
      throw new Error("MANAGED_INTELLIGENCE_TURN_FAILED")
    }

    if (turn.status === "cancelled") {
      throw new Error("MANAGED_INTELLIGENCE_TURN_CANCELLED")
    }

    if (turn.status !== "completed") {
      await sleep(DEFAULT_POLL_INTERVAL_MS)
      continue
    }

    const completedTurn = await retrieveCompletedTurnWithUsage(
      created.id,
      turn.id,
      apiKey,
      fetcher,
      sleep,
    )

    const items = sessionItemListSchema.parse(
      await apiJson(
        `/${encodeURIComponent(created.id)}/turns/${encodeURIComponent(completedTurn.id)}/items?order=asc&limit=100`,
        { method: "GET" },
        apiKey,
        fetcher,
      ),
    )

    const outputText = assistantOutputText(items.data)
    if (!outputText) {
      throw new Error("MANAGED_INTELLIGENCE_EMPTY_OUTPUT")
    }

    return {
      sessionId: created.id,
      turnId: completedTurn.id,
      model,
      outputText,
      latencyMs: Date.now() - startedAt,
      usage: normalizedUsage(completedTurn),
    }
  }

  throw new Error("MANAGED_INTELLIGENCE_TIMEOUT")
}
