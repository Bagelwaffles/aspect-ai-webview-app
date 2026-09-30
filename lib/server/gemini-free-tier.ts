import type { z } from "zod"

export const DEFAULT_GEMINI_FREE_TIER_MODEL = "gemini-3.5-flash-lite" as const

type GeminiPart = { text?: string }
type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
  }>
}

export function isGeminiFreeTierConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim())
}

function configuredModel(env: NodeJS.ProcessEnv) {
  const model = env.AMS_BROWSER_OPERATOR_GEMINI_MODEL?.trim() || DEFAULT_GEMINI_FREE_TIER_MODEL
  if (!/^[A-Za-z0-9._-]+$/u.test(model)) throw new Error("BROWSER_OPERATOR_GEMINI_MODEL_INVALID")
  return model
}

export async function runGeminiFreeTierStructured<TSchema extends z.ZodTypeAny>(
  input: {
    system: string
    prompt: string
    responseSchema: Record<string, unknown>
    outputSchema: TSchema
    temperature?: number
    maxOutputTokens?: number
  },
  options: {
    env?: NodeJS.ProcessEnv
    fetcher?: typeof fetch
  } = {},
): Promise<z.infer<TSchema>> {
  const env = options.env ?? process.env
  const apiKey = env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error("BROWSER_OPERATOR_GEMINI_NOT_CONFIGURED")

  const model = configuredModel(env)
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: input.system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input.prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: input.responseSchema,
          temperature: input.temperature ?? 0.1,
          maxOutputTokens: input.maxOutputTokens ?? 900,
        },
      }),
      cache: "no-store",
    },
  )

  if (!response.ok) {
    if (response.status === 429) throw new Error("BROWSER_OPERATOR_GEMINI_RATE_LIMITED")
    throw new Error(`BROWSER_OPERATOR_GEMINI_HTTP_${response.status}`)
  }

  const payload = (await response.json()) as GeminiGenerateContentResponse
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim()

  if (!text) throw new Error("BROWSER_OPERATOR_GEMINI_EMPTY_RESPONSE")

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("BROWSER_OPERATOR_GEMINI_INVALID_JSON")
  }

  return input.outputSchema.parse(parsed)
}
