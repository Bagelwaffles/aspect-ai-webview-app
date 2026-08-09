import assert from "node:assert/strict"
import test from "node:test"

import { safeRelativeCallbackPath } from "../app/lib/safe-relative-callback"

test("owner session bridge preserves protected dashboard callback paths", () => {
  assert.equal(
    safeRelativeCallbackPath("/dashboard/android-beta", "/dashboard"),
    "/dashboard/android-beta",
  )
})

test("owner session bridge preserves safe query strings", () => {
  assert.equal(
    safeRelativeCallbackPath("/dashboard/android-beta?view=testers", "/dashboard"),
    "/dashboard/android-beta?view=testers",
  )
})

test("owner session bridge rejects external and encoded-separator callbacks", () => {
  assert.equal(
    safeRelativeCallbackPath("https://evil.example/dashboard", "/dashboard"),
    "/dashboard",
  )
  assert.equal(
    safeRelativeCallbackPath("/%2f%2fevil.example", "/dashboard"),
    "/dashboard",
  )
})
