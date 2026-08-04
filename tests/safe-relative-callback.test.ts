import assert from "node:assert/strict"
import test from "node:test"

import { safeRelativeCallbackPath } from "../app/lib/safe-relative-callback"

const FALLBACK = "/billing"

test("safe callback parser preserves same-origin application paths", () => {
  assert.equal(safeRelativeCallbackPath("/billing", FALLBACK), "/billing")
  assert.equal(
    safeRelativeCallbackPath("/billing/success?session_id=example#status", FALLBACK),
    "/billing/success?session_id=example#status",
  )
})

test("safe callback parser rejects absolute and protocol-relative redirects", () => {
  assert.equal(safeRelativeCallbackPath("https://attacker.example", FALLBACK), FALLBACK)
  assert.equal(safeRelativeCallbackPath("//attacker.example/path", FALLBACK), FALLBACK)
  assert.equal(safeRelativeCallbackPath("\\\\attacker.example", FALLBACK), FALLBACK)
  assert.equal(safeRelativeCallbackPath("/\\attacker.example", FALLBACK), FALLBACK)
})

test("safe callback parser rejects encoded separator and control-character bypasses", () => {
  const unsafeValues = [
    "/%2f%2fattacker.example",
    "/%252f%252fattacker.example",
    "/%2525252f%2525252fattacker.example",
    "/%5c%5cattacker.example",
    "/%255c%255cattacker.example",
    "/safe%0d%0aLocation%3A%20https%3A%2F%2Fattacker.example",
  ]

  for (const value of unsafeValues) {
    assert.equal(safeRelativeCallbackPath(value, FALLBACK), FALLBACK, value)
  }
})

test("safe callback parser uses fallback for absent or malformed values", () => {
  assert.equal(safeRelativeCallbackPath(null, FALLBACK), FALLBACK)
  assert.equal(safeRelativeCallbackPath("billing", FALLBACK), FALLBACK)
  assert.equal(safeRelativeCallbackPath("/%", FALLBACK), FALLBACK)
})
