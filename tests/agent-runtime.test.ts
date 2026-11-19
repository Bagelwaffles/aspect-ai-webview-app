import assert from "node:assert/strict"
import test from "node:test"

import {
  isContentAgentLaunchEnabled,
  isSubscriptionCheckoutEnabled,
} from "../lib/content-agent-launch"
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

test("new subscription checkout fails closed unless its dedicated flag is explicitly enabled", () => {
  assert.equal(isSubscriptionCheckoutEnabled(env({ NODE_ENV: "production" })), false)
  assert.equal(
    isSubscriptionCheckoutEnabled(
      env({ NEXT_PUBLIC_AMS_SUBSCRIPTION_CHECKOUT_ENABLED: "false" }),
    ),
    false,
  )
  assert.equal(
    isSubscriptionCheckoutEnabled(
      env({ NEXT_PUBLIC_AMS_SUBSCRIPTION_CHECKOUT_ENABLED: "true" }),
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
