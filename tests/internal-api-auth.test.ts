import assert from "node:assert/strict"
import test from "node:test"

import type { NextRequest } from "next/server"

import {
  isInternalApiAuthorized,
  isInternalApiConfigured,
  isUnsafeInternalApiKey,
} from "../lib/server/internal-api-auth"

function requestWithBearer(value: string): NextRequest {
  return {
    headers: new Headers({ authorization: `Bearer ${value}` }),
  } as NextRequest
}

function withInternalKey(value: string | undefined, run: () => void) {
  const previous = process.env.AMS_INTERNAL_API_KEY
  try {
    if (value === undefined) delete process.env.AMS_INTERNAL_API_KEY
    else process.env.AMS_INTERNAL_API_KEY = value
    run()
  } finally {
    if (previous === undefined) delete process.env.AMS_INTERNAL_API_KEY
    else process.env.AMS_INTERNAL_API_KEY = previous
  }
}

test("rejects Stripe credentials as AMS internal API keys", () => {
  for (const value of [
    "sk_live_example",
    "rk_live_example",
    "sk_test_example",
    "pk_live_example",
    "whsec_example",
  ]) {
    withInternalKey(value, () => {
      assert.equal(isUnsafeInternalApiKey(value), true)
      assert.equal(isInternalApiConfigured(), false)
      assert.equal(isInternalApiAuthorized(requestWithBearer(value)), false)
    })
  }
})

test("accepts a dedicated non-Stripe AMS internal secret", () => {
  const value = "ams_internal_7wE5D5Rz1tvQxjHqV4MJxnkb3f6N8u2C"
  withInternalKey(value, () => {
    assert.equal(isUnsafeInternalApiKey(value), false)
    assert.equal(isInternalApiConfigured(), true)
    assert.equal(isInternalApiAuthorized(requestWithBearer(value)), true)
  })
})

test("fails closed for missing and placeholder internal secrets", () => {
  for (const value of [undefined, "replace-me", "changeme", "placeholder", "your_key_here"]) {
    withInternalKey(value, () => {
      assert.equal(isInternalApiConfigured(), false)
    })
  }
})
