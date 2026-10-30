import assert from "node:assert/strict"
import test from "node:test"

import {
  bearerReportToken,
  createBuyerReportAccessToken,
  isBuyerReportAccessConfigured,
  verifyBuyerReportAccessToken,
} from "../lib/server/quick-audit-report-access"

const SECRET = "a-unique-test-only-key-with-at-least-32-characters"
const OTHER_SECRET = "different-test-only-key-with-at-least-32-characters"
const NOW = Date.UTC(2026, 9, 29, 12)
const ORDER = {
  checkoutSessionId: "cs_test_mockbuyer123",
  requestId: "quick-audit-order-alpha",
  buyerEmail: "Buyer@Example.com ",
}

test("report link is tied to purchaser email and exact paid order", () => {
  const token = createBuyerReportAccessToken(ORDER, SECRET, NOW)
  assert.equal(verifyBuyerReportAccessToken(token, ORDER, SECRET, NOW), true)
  assert.equal(verifyBuyerReportAccessToken(token, { ...ORDER, buyerEmail: "buyer@example.com" }, SECRET, NOW), true)
  assert.equal(verifyBuyerReportAccessToken(token, { ...ORDER, buyerEmail: "other@example.com" }, SECRET, NOW), false)
  assert.equal(verifyBuyerReportAccessToken(token, { ...ORDER, checkoutSessionId: "cs_test_other123" }, SECRET, NOW), false)
  assert.equal(verifyBuyerReportAccessToken(token, { ...ORDER, requestId: "quick-audit-other" }, SECRET, NOW), false)
  assert.equal(verifyBuyerReportAccessToken(token, ORDER, OTHER_SECRET, NOW), false)
  assert.equal(token.includes("Buyer@Example.com"), false)
  assert.equal(token.includes("buyer@example.com"), false)
})

test("report link rejects expired, malformed and modified token inputs", () => {
  const token = createBuyerReportAccessToken(ORDER, SECRET, NOW)
  assert.equal(verifyBuyerReportAccessToken(token, ORDER, SECRET, NOW + 14 * 24 * 60 * 60 * 1000), false)
  assert.equal(verifyBuyerReportAccessToken(token + "a", ORDER, SECRET, NOW), false)
  assert.equal(verifyBuyerReportAccessToken(token.slice(0, 10), ORDER, SECRET, NOW), false)
  assert.equal(verifyBuyerReportAccessToken("x.".repeat(1100), ORDER, SECRET, NOW), false)
  assert.equal(verifyBuyerReportAccessToken(undefined, ORDER, SECRET, NOW), false)
})

test("report link requires a purpose-specific sufficiently long signing secret", () => {
  assert.equal(isBuyerReportAccessConfigured("short"), false)
  assert.equal(isBuyerReportAccessConfigured(undefined), false)
  assert.equal(isBuyerReportAccessConfigured(SECRET), true)
  assert.throws(() => createBuyerReportAccessToken(ORDER, "short", NOW), /REPORT_ACCESS_SECRET_INVALID/)
})

test("report access accepts only a bearer header, never query-like input", () => {
  const token = createBuyerReportAccessToken(ORDER, SECRET, NOW)
  assert.equal(bearerReportToken("Bearer " + token), token)
  assert.equal(bearerReportToken("Basic " + token), undefined)
  assert.equal(bearerReportToken(null), undefined)
})
