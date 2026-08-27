import { generateText, Output } from "ai"
import { z } from "zod"

export const AMS_AGENT_RUNTIME_DISABLED_ENV = "AMS_AGENT_RUNTIME_DISABLED" as const

export function isAgentRuntimeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AMS_AGENT_RUNTIME_DISABLED?.trim().toLowerCase() !== "true"
}

export function isVercelAiGatewayAuthAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.AI_GATEWAY_API_KEY?.trim() ||
      env.VERCEL_OIDC_TOKEN?.trim() ||
      (env.VERCEL === "1" && env.VERCEL_ENV?.trim()),
  )
}

export function isAgentRuntimeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isAgentRuntimeEnabled(env) && isVercelAiGatewayAuthAvailable(env)
}

export type StructuredAgentDefinition<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
> = {
  id: string
  version: string
  model: string
  fallbackModels?: string[]
  inputSchema: TInputSchema
  outputSchema: TOutputSchema
  system: string
  buildPrompt: (input: z.infer<TInputSchema>) => string
  temperature?: number
  maxOutputTokens?: number
}

export async function runStructuredAgent<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
>(
  definition: StructuredAgentDefinition<TInputSchema, TOutputSchema>,
  input: unknown,
): Promise<z.infer<TOutputSchema>> {
  if (!isAgentRuntimeConfigured()) {
    throw new Error("AMS_AGENT_RUNTIME_UNAVAILABLE")
  }

  const parsedInput = definition.inputSchema.parse(input)
  const fallbackModels = Array.from(
    new Set(
      (definition.fallbackModels ?? [])
        .map((model) => model.trim())
        .filter((model) => model && model !== definition.model),
    ),
  ).slice(0, 4)

  const result = await generateText({
    model: definition.model,
    output: Output.object({ schema: definition.outputSchema }),
    system: definition.system,
    prompt: definition.buildPrompt(parsedInput),
    temperature: definition.temperature ?? 0.4,
    maxOutputTokens: definition.maxOutputTokens ?? 1_200,
    ...(fallbackModels.length > 0
      ? {
          providerOptions: {
            gateway: {
              models: fallbackModels,
            },
          },
        }
      : {}),
  })

  return definition.outputSchema.parse(result.output)
}
