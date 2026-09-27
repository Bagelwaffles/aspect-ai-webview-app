import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  authOriginState,
  configuredNextAuthOrigin,
  isGoogleNextAuthExchangePath,
  requestOriginForAuth,
  shouldBlockGoogleNextAuthExchange,
} from "../lib/auth-origin"

const productionEnv = {
  NODE_ENV: "test",
  NEXTAUTH_URL: "https://www.aspectmarketingsolutions.app",
} as NodeJS.ProcessEnv

test("production NextAuth origin is normalized to canonical www", () => {
  assert.equal(
    configuredNextAuthOrigin(productionEnv),
    "https://www.aspectmarketingsolutions.app",
  )
})

test("production www request matches the configured NextAuth origin", () => {
  const headers = new Headers({
    host: "www.aspectmarketingsolutions.app",
    "x-forwarded-host": "www.aspectmarketingsolutions.app",
    "x-forwarded-proto": "https",
  })
  assert.equal(
    requestOriginForAuth(
      "https://www.aspectmarketingsolutions.app/api/auth/signin/google",
      headers,
    ),
    "https://www.aspectmarketingsolutions.app",
  )
  assert.deepEqual(
    authOriginState(
      "https://www.aspectmarketingsolutions.app/api/auth/signin/google",
      headers,
      productionEnv,
    ),
    {
      configuredOrigin: "https://www.aspectmarketingsolutions.app",
      requestOrigin: "https://www.aspectmarketingsolutions.app",
      matches: true,
    },
  )
})

test("Vercel preview request does not match production NextAuth origin", () => {
  const preview = "aspect-ai-overlord-azyaejz1v-kimberleyaversbiz-4131s-projects.vercel.app"
  const headers = new Headers({
    host: preview,
    "x-forwarded-host": preview,
    "x-forwarded-proto": "https",
  })
  const state = authOriginState(
    `https://${preview}/api/auth/signin/google`,
    headers,
    productionEnv,
  )
  assert.equal(state.requestOrigin, `https://${preview}`)
  assert.equal(state.configuredOrigin, "https://www.aspectmarketingsolutions.app")
  assert.equal(state.matches, false)
})

test("Google signin and callback fail closed on a preview that targets production", () => {
  const preview = "aspect-ai-overlord-preview.vercel.app"
  const headers = new Headers({
    "x-forwarded-host": preview,
    "x-forwarded-proto": "https",
  })
  for (const pathname of [
    "/api/auth/signin/google",
    "/api/auth/callback/google",
    "/api/auth/signin/google/",
    "/api/auth/callback/google/",
  ]) {
    assert.equal(
      shouldBlockGoogleNextAuthExchange(
        pathname,
        `https://${preview}${pathname}`,
        headers,
        productionEnv,
      ),
      true,
    )
  }
})

test("Google signin and callback remain available on production www", () => {
  const headers = new Headers({
    "x-forwarded-host": "www.aspectmarketingsolutions.app",
    "x-forwarded-proto": "https",
  })
  for (const pathname of [
    "/api/auth/signin/google",
    "/api/auth/callback/google",
  ]) {
    assert.equal(
      shouldBlockGoogleNextAuthExchange(
        pathname,
        `https://www.aspectmarketingsolutions.app${pathname}`,
        headers,
        productionEnv,
      ),
      false,
    )
  }
})

test("non-Google NextAuth endpoints are not blocked by the exchange guard", () => {
  assert.equal(isGoogleNextAuthExchangePath("/api/auth/providers"), false)
  assert.equal(isGoogleNextAuthExchangePath("/api/auth/session"), false)
  assert.equal(
    shouldBlockGoogleNextAuthExchange(
      "/api/auth/providers",
      "https://preview.vercel.app/api/auth/providers",
      new Headers({
        "x-forwarded-host": "preview.vercel.app",
        "x-forwarded-proto": "https",
      }),
      productionEnv,
    ),
    false,
  )
})

test("login UI disables preview Google sign-in and directs users to production", () => {
  const source = readFileSync("app/login/page.tsx", "utf8")
  assert.match(source, /originMismatch/u)
  assert.match(source, /Google sign-in is disabled on this preview deployment/u)
  assert.match(source, /Continue on the production sign-in page/u)
})

test("NextAuth route returns a dedicated fail-closed origin mismatch error", () => {
  const source = readFileSync("app/api/auth/[...nextauth]/route.ts", "utf8")
  assert.match(source, /shouldBlockGoogleNextAuthExchange/u)
  assert.match(source, /AUTH_ORIGIN_MISMATCH/u)
  assert.match(source, /status:\s*409/u)
})
