import assert from "node:assert/strict"
import test from "node:test"

import {
  authCallbackUrlFromRequest,
  isSafeAuthCallbackUrl,
  recordInvalidAuthAttempt,
} from "../lib/server/auth-request-guard"

const REQUEST_URL = "https://www.aspectmarketingsolutions.app/api/auth/signout"

test("auth callback guard allows relative and same-origin callbacks", () => {
  assert.equal(isSafeAuthCallbackUrl("/dashboard", REQUEST_URL), true)
  assert.equal(
    isSafeAuthCallbackUrl("https://www.aspectmarketingsolutions.app/dashboard", REQUEST_URL),
    true,
  )
})

test("auth callback guard rejects external, malformed, and injection-style callbacks", () => {
  const invalid = [
    "https://attacker.example/",
    "//attacker.example/",
    "\\\\attacker.example",
    "/%252f%252fattacker.example",
    "' OR 1=1--",
    "/safe%0d%0aLocation%3A%20https%3A%2F%2Fattacker.example",
  ]

  for (const value of invalid) {
    assert.equal(isSafeAuthCallbackUrl(value, REQUEST_URL), false, value)
  }
})

test("auth callback guard reads form-encoded POST callbackUrl without consuming request", async () => {
  const request = new Request(REQUEST_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ callbackUrl: "' OR 1=1--", csrfToken: "example" }),
  })

  assert.equal(await authCallbackUrlFromRequest(request), "' OR 1=1--")
  assert.equal(await request.text(), "callbackUrl=%27+OR+1%3D1--&csrfToken=example")
})

test("repeated invalid attempts are rate limited", () => {
  const request = new Request(REQUEST_URL, {
    headers: { "x-vercel-forwarded-for": "192.0.2.44" },
  })

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    assert.equal(recordInvalidAuthAttempt(request, 1_000).blocked, false)
  }

  assert.equal(recordInvalidAuthAttempt(request, 1_000).blocked, true)
})
