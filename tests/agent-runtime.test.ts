import assert from "node:assert/strict"
import test from "node:test"

import { isContentAgentLaunchEnabled } from "../lib/content-agent-launch"
import { isSubscriptionCheckoutAvailable } from "../lib/server/subscription-checkout-availability"
import {
  isAgentRuntimeConfigured,
  isAgentRuntimeEnabled,
  isVercelAiGatewayAuthAvailable,
} from "../lib/server/agent-runtime"

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv
}

test("Content Agent is enabled by a production release", () => {
  assert.equal(isContentAgentLaunchEnabled(env({ NODE_ENV: "production" })), true)
  assert.equal(
    isContentAgentLaunchEnabled(
      env({ NODE_ENV: "production", NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE: "false" }),
    ),
    true,
  )
})

test("non-production Content Agent still requires the explicit preview flag", () => {
  assert.equal(isContentAgentLaunchEnabled(env({ NODE_ENV: "test" })), false)
  assert.equal(
    isContentAgentLaunchEnabled(
      env({ NODE_ENV: "test", NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE: "true" }),
    ),
    true,
  )
})

test("shared agent runtime fails closed when the server kill switch is active", () => {
  assert.equal(isAgentRuntimeEnabled(env({ AMS_AGENT_RUNTIME_DISABLED: "true" })), false)
  assert.equal(
    isAgentRuntimeConfigured(
      env({
        AMS_AGENT_RUNTIME_DISABLED: "true",
        VERCEL: "1",
        VERCEL_ENV: "production",
      }),
    ),
    false,
  )
})

test("Vercel native deployment context satisfies AI Gateway authentication", () => {
  const productionVercel = env({ VERCEL: "1", VERCEL_ENV: "production" })
  assert.equal(isVercelAiGatewayAuthAvailable(productionVercel), true)
  assert.equal(isAgentRuntimeConfigured(productionVercel), true)
})

test("explicit AI Gateway and OIDC credentials are also recognized", () => {
  assert.equal(isVercelAiGatewayAuthAvailable(env({ AI_GATEWAY_API_KEY: "test-key" })), true)
  assert.equal(isVercelAiGatewayAuthAvailable(env({ VERCEL_OIDC_TOKEN: "test-token" })), true)
  assert.equal(isVercelAiGatewayAuthAvailable(env({})), false)
})

test("subscription checkout stays closed when the production runtime kill switch is on", () => {
  const stopped = env({
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    AMS_AGENT_RUNTIME_DISABLED: "true",
  })
  assert.equal(isContentAgentLaunchEnabled(stopped), true)
  assert.equal(isSubscriptionCheckoutAvailable(stopped), false)
})

test("subscription checkout requires AI runtime configuration and preview opt-in", () => {
  assert.equal(isSubscriptionCheckoutAvailable(env({ NODE_ENV: "production" })), false)
  assert.equal(
    isSubscriptionCheckoutAvailable(
      env({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" }),
    ),
    true,
  )
  assert.equal(
    isSubscriptionCheckoutAvailable(
      env({
        NODE_ENV: "test",
        VERCEL: "1",
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE: "false",
      }),
    ),
    false,
  )
})
