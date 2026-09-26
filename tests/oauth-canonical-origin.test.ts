import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  AMS_CANONICAL_ORIGIN,
  canonicalProductionUrl,
  requestHostForCanonicalization,
} from "../lib/canonical-origin"

function headers(values: Record<string, string>) {
  return new Headers(values)
}

test("canonical origin helper prefers forwarded production host", () => {
  assert.equal(
    requestHostForCanonicalization(
      headers({
        host: "www.aspectmarketingsolutions.app",
        "x-forwarded-host": "aspectmarketingsolutions.app",
      }),
    ),
    "aspectmarketingsolutions.app",
  )
})

test("apex login requests redirect to the canonical www origin", () => {
  const target = canonicalProductionUrl(
    "https://aspectmarketingsolutions.app/login?next=%2Fdashboard",
    headers({ host: "aspectmarketingsolutions.app" }),
  )
  assert.equal(
    target?.href,
    `${AMS_CANONICAL_ORIGIN}/login?next=%2Fdashboard`,
  )
})

test("Google OAuth callback keeps code and state while canonicalizing host", () => {
  const target = canonicalProductionUrl(
    "https://aspectmarketingsolutions.app/api/auth/callback/google?code=abc123&state=state456",
    headers({ "x-forwarded-host": "aspectmarketingsolutions.app" }),
  )
  assert.equal(
    target?.href,
    `${AMS_CANONICAL_ORIGIN}/api/auth/callback/google?code=abc123&state=state456`,
  )
})

test("canonical www and preview hosts are not redirected", () => {
  assert.equal(
    canonicalProductionUrl(
      "https://www.aspectmarketingsolutions.app/api/auth/signin/google",
      headers({ host: "www.aspectmarketingsolutions.app" }),
    ),
    null,
  )
  assert.equal(
    canonicalProductionUrl(
      "https://aspect-ai-overlord-preview.vercel.app/api/auth/signin/google",
      headers({ host: "aspect-ai-overlord-preview.vercel.app" }),
    ),
    null,
  )
})

test("ports are ignored when matching the apex host", () => {
  const target = canonicalProductionUrl(
    "https://aspectmarketingsolutions.app:443/pricing",
    headers({ host: "aspectmarketingsolutions.app:443" }),
  )
  assert.equal(target?.href, `${AMS_CANONICAL_ORIGIN}/pricing`)
})


test("middleware canonicalization is limited to authentication entry surfaces", () => {
  const middleware = readFileSync("middleware.ts", "utf8")
  assert.match(middleware, /"\/login"/u)
  assert.match(middleware, /"\/api\/auth\/:path\*"/u)
  assert.match(middleware, /"\/dashboard\/:path\*"/u)
  assert.doesNotMatch(middleware, /api\/webhooks/u)
  assert.doesNotMatch(middleware, /\(\?!_next\/static/u)
})
