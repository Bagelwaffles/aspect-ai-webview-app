import assert from "node:assert/strict"
import test from "node:test"

import { parseEnvText, validateStagingConfig } from "../scripts/staging-preflight"

function validEnvironment() {
  return {
    NEXT_PUBLIC_APP_URL: "https://staging.ams-test.net",
    PUBLIC_APP_URL: "https://staging.ams-test.net",
    NEXTAUTH_URL: "https://staging.ams-test.net",
    NEXTAUTH_SECRET: "n".repeat(32),
    GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "google-staging-secret",
    AMS_INTERNAL_API_KEY: "i".repeat(32),
    INTERNAL_ADMIN_EMAIL: "internal-admin@aspectmarketingsolutions.app",
    INTERNAL_ADMIN_PASSWORD_HASH: `scrypt-v1$${"s".repeat(22)}$${"d".repeat(43)}`,
    INTERNAL_ADMIN_SECRET: "a".repeat(32),
    AMS_STAGING_REDIS_REST_TOKEN: "r".repeat(32),
    STRIPE_SECRET_KEY: "sk_test_staging_only",
    STRIPE_WEBHOOK_SECRET: "whsec_staging_only",
    AMS_STRIPE_WEBHOOK_MODE: "test",
    AMS_STRIPE_STARTER_PRICE_ID: "price_starter",
    AMS_STRIPE_GROWTH_PRICE_ID: "price_growth",
    AMS_STRIPE_PRO_PRICE_ID: "price_pro",
    NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE: "false",
    AMS_CONTENT_AGENT_MODEL: "openai/gpt-5.4-mini",
    AI_GATEWAY_API_KEY: "",
    AMS_AI_REQUESTS_PER_MINUTE: "10",
    AMS_STAGING_WEB_PORT: "3000",
  }
}

test("staging preflight accepts one HTTPS origin and provider-disabled test configuration", () => {
  assert.deepEqual(validateStagingConfig(validEnvironment()), [])
})

test("staging preflight requires AI Gateway auth only when Content Agent execution is enabled", () => {
  const env = validEnvironment()
  env.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE = "true"

  let errors = validateStagingConfig(env).join("\n")
  assert.match(errors, /AI_GATEWAY_AUTH/u)

  env.AI_GATEWAY_API_KEY = "gateway-staging-only"
  errors = validateStagingConfig(env).join("\n")
  assert.doesNotMatch(errors, /AI_GATEWAY_AUTH/u)
})

test("staging preflight validates the Content Agent launch switch and model format", () => {
  const env = validEnvironment()
  env.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE = "maybe"
  env.AMS_CONTENT_AGENT_MODEL = "invalid-model-name"

  const errors = validateStagingConfig(env).join("\n")
  assert.match(errors, /NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE: must equal true or false/u)
  assert.match(errors, /AMS_CONTENT_AGENT_MODEL: must use provider\/model format/u)
})

test("staging preflight rejects loopback URLs and live Stripe mode", () => {
  const env = validEnvironment()
  env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000"
  env.PUBLIC_APP_URL = "http://127.0.0.1:3000"
  env.NEXTAUTH_URL = "http://127.0.0.1:3000"
  env.STRIPE_SECRET_KEY = "sk_live_forbidden"
  env.AMS_STRIPE_WEBHOOK_MODE = "live"

  const errors = validateStagingConfig(env).join("\n")
  assert.match(errors, /NEXT_PUBLIC_APP_URL: must use HTTPS/u)
  assert.match(errors, /STRIPE_SECRET_KEY: live keys are forbidden/u)
  assert.match(errors, /AMS_STRIPE_WEBHOOK_MODE: must equal test/u)
})

test("staging preflight reports names rather than credential values", () => {
  const env = validEnvironment()
  env.GOOGLE_CLIENT_SECRET = "replace-with-secret"
  env.AMS_STRIPE_GROWTH_PRICE_ID = env.AMS_STRIPE_STARTER_PRICE_ID

  const errors = validateStagingConfig(env).join("\n")
  assert.match(errors, /GOOGLE_CLIENT_SECRET: still contains a placeholder/u)
  assert.match(errors, /STRIPE_PRICE_IDS/u)
  assert.doesNotMatch(errors, /replace-with-secret/u)
})

test("env parsing rejects duplicate keys", () => {
  assert.throws(() => parseEnvText("NEXTAUTH_SECRET=one\nNEXTAUTH_SECRET=two\n"), /Duplicate/u)
})
