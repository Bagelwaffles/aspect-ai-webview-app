import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_CONTENT_AGENT_MODEL,
  getContentAgentModel,
  isContentAgentGatewayAuthAvailable,
  isContentAgentProviderConfigured,
} from "../lib/server/content-agent"

const trackedKeys = [
  "NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE",
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "AMS_CONTENT_AGENT_MODEL",
] as const

const previous = Object.fromEntries(
  trackedKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof trackedKeys)[number], string | undefined>

function clearProviderEnv() {
  for (const key of trackedKeys) delete process.env[key]
}

test.after(() => {
  for (const key of trackedKeys) {
    const value = previous[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test("Content Agent uses a low-cost AI Gateway model unless explicitly overridden", () => {
  clearProviderEnv()
  assert.equal(getContentAgentModel(), DEFAULT_CONTENT_AGENT_MODEL)

  process.env.AMS_CONTENT_AGENT_MODEL = "openai/example-model"
  assert.equal(getContentAgentModel(), "openai/example-model")
})

test("Content Agent remains disabled even when gateway auth exists until launch is explicit", () => {
  clearProviderEnv()
  process.env.AI_GATEWAY_API_KEY = "gateway-test-key"

  assert.equal(isContentAgentGatewayAuthAvailable(), true)
  assert.equal(isContentAgentProviderConfigured(), false)
})

test("Content Agent fails closed when launch is enabled without gateway authentication", () => {
  clearProviderEnv()
  process.env.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE = "true"

  assert.equal(isContentAgentGatewayAuthAvailable(), false)
  assert.equal(isContentAgentProviderConfigured(), false)
})

test("Content Agent accepts explicit AI Gateway API-key authentication", () => {
  clearProviderEnv()
  process.env.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE = "true"
  process.env.AI_GATEWAY_API_KEY = "gateway-test-key"

  assert.equal(isContentAgentProviderConfigured(), true)
})

test("Content Agent accepts Vercel runtime OIDC authentication", () => {
  clearProviderEnv()
  process.env.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE = "true"
  process.env.VERCEL_OIDC_TOKEN = "oidc-test-token"

  assert.equal(isContentAgentProviderConfigured(), true)
})
