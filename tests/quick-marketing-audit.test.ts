import assert from "node:assert/strict"
import test from "node:test"

import { ETHICAL_OFFERS } from "../lib/ethical-agent-farm"
import { QUICK_MARKETING_AUDIT } from "../lib/quick-marketing-audit"

test("quick marketing audit is a $49 one-time live Stripe offer", () => {
  assert.equal(QUICK_MARKETING_AUDIT.priceCents, 4900)
  assert.equal(QUICK_MARKETING_AUDIT.priceLabel, "$49 one-time")
  assert.equal(QUICK_MARKETING_AUDIT.deliveryWindow, "within 48 hours")
  assert.match(QUICK_MARKETING_AUDIT.checkoutUrl, /^https:\/\/(book|buy)\.stripe\.com\//)
  assert.equal(QUICK_MARKETING_AUDIT.deliverables.length, 6)
})

test("ethical agent farm routes the live audit to the paid landing page", () => {
  const audit = ETHICAL_OFFERS.find((offer) => offer.id === "quick-marketing-audit")
  assert.ok(audit)
  assert.equal(audit.price, "$49")
  assert.equal(audit.billingLabel, "One-time purchase")
  assert.equal(audit.ctaHref, "/quick-marketing-audit")
  assert.equal(audit.featured, true)
})

test("other one-time service concepts remain request-only", () => {
  const requestOnly = ETHICAL_OFFERS.filter(
    (offer) => offer.id !== "quick-marketing-audit" && offer.id !== "monthly-marketing-support",
  )
  assert.ok(requestOnly.length > 0)
  for (const offer of requestOnly) {
    assert.equal(offer.billingLabel, "Request only")
    assert.match(offer.ctaHref, /^\/ethical-agent-farm\/request/)
  }
})
