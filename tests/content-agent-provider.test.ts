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
  "VERCEL",
  "VERCEL_ENV",
  "AMS_CONTENT_AGENT_MODEL",
] as const

const mutableEnv = process.env as Record<string, string | undefined>
const previous = Object.fromEntries(
  trackedKeys.map((key) => [key, mutableEnv[key]]),
) as Record<(typeof trackedKeys)[number], string | undefined>

function clearProviderEnv() {
  for (const key of trackedKeys) delete mutableEnv[key]
}

test.after(() => {
  for (const key of trackedKeys) {
    const value = previous[key]
    if (value === undefined) delete mutableEnv[key]
    else mutableEnv[key] = value
  }
})

test("Content Agent uses a low-cost live AI Gateway model unless explicitly overridden", () => {
  clearProviderEnv()
  assert.equal(DEFAULT_CONTENT_AGENT_MODEL, "openai/gpt-5.4-mini")
  assert.equal(getContentAgentModel(), DEFAULT_CONTENT_AGENT_MODEL)

  mutableEnv.AMS_CONTENT_AGENT_MODEL = "openai/example-model"
  assert.equal(getContentAgentModel(), "openai/example-model")
})

test("Content Agent remains disabled even when gateway auth exists until launch is explicit", () => {
  clearProviderEnv()
  mutableEnv.AI_GATEWAY_API_KEY = "gateway-test-key"

  assert.equal(isContentAgentGatewayAuthAvailable(), true)
  assert.equal(isContentAgentProviderConfigured(), false)
})

test("Content Agent fails closed off Vercel when launch is enabled without gateway authentication", () => {
  clearProviderEnv()
  mutableEnv.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE = "true"

  assert.equal(isContentAgentGatewayAuthAvailable(), false)
  assert.equal(isContentAgentProviderConfigured(), false)
})

test("Content Agent accepts explicit AI Gateway API-key authentication", () => {
  clearProviderEnv()
  mutableEnv.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE = "true"
  mutableEnv.AI_GATEWAY_API_KEY = "gateway-test-key"

  assert.equal(isContentAgentProviderConfigured(), true)
})

test("Content Agent accepts an explicitly supplied Vercel OIDC token", () => {
  clearProviderEnv()
  mutableEnv.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE = "true"
  mutableEnv.VERCEL_OIDC_TOKEN = "oidc-test-token"

  assert.equal(isContentAgentProviderConfigured(), true)
})

test("Content Agent accepts Vercel-native Gateway OIDC on a real Vercel deployment", () => {
  clearProviderEnv()
  mutableEnv.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE = "true"
  mutableEnv.VERCEL = "1"
  mutableEnv.VERCEL_ENV = "production"

  assert.equal(isContentAgentGatewayAuthAvailable(), true)
  assert.equal(isContentAgentProviderConfigured(), true)
})

test("Content Agent does not infer native OIDC from incomplete Vercel markers", () => {
  clearProviderEnv()
  mutableEnv.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE = "true"
  mutableEnv.VERCEL = "1"

  assert.equal(isContentAgentProviderConfigured(), false)

  delete mutableEnv.VERCEL
  mutableEnv.VERCEL_ENV = "production"
  assert.equal(isContentAgentProviderConfigured(), false)
})
