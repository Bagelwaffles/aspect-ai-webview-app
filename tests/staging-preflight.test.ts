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
    XAI_API_KEY: "xai-staging-only",
    XAI_MODEL: "grok-staging",
    AMS_AI_REQUESTS_PER_MINUTE: "10",
    AMS_STAGING_WEB_PORT: "3000",
  }
}

test("staging preflight accepts one HTTPS origin and test-only configuration", () => {
  assert.deepEqual(validateStagingConfig(validEnvironment()), [])
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
