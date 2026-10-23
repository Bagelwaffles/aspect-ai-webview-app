import { test } from "node:test"
import assert from "node:assert/strict"

import {
  AUDIT_IMPLEMENTATION_OFFERS,
  SUBSCRIPTION_EXPANSION,
  VERIFIED_AGENT_UPSELLS,
  auditQuoteContext,
  getAuditImplementationOffer,
  getVerifiedAgentUpsell,
} from "../lib/ams-upsell-offers"
import { SUBSCRIPTION_INCLUDED_AGENTS } from "../lib/subscription-agent-catalog"

test("audit implementation packages are optional and bounded to 1, 3, 5 fixes", () => {
  assert.deepEqual(AUDIT_IMPLEMENTATION_OFFERS.map(x => x.maximumFixes), [1, 3, 5])
  assert.deepEqual(AUDIT_IMPLEMENTATION_OFFERS.map(x => x.priceLabel.match(/\$[\d,]+/)?.[0]), ["$149", "$499", "$999"])
  assert.equal(new Set(AUDIT_IMPLEMENTATION_OFFERS.map(x => x.id)).size, 3)
  for (const offer of AUDIT_IMPLEMENTATION_OFFERS) {
    assert.equal(offer.requestOffer, "business-cleanup-plan")
    assert.match(offer.priceLabel, /quoted separately/)
    assert.match(auditQuoteContext(offer.id)!, /written proposal and approval/)
    assert.equal(getAuditImplementationOffer(offer.id)?.id, offer.id)
  }
})

test("unknown package identifiers cannot become arbitrary request text", () => {
  for (const bad of ["", "discount", "../../billing", "<script>", "audit-full-implementation&coupon=free"]) {
    assert.equal(getAuditImplementationOffer(bad), undefined)
    assert.equal(auditQuoteContext(bad), null)
  }
})

test("all seven included Live agent types have one relevant non-duplicative next offer", () => {
  assert.equal(SUBSCRIPTION_INCLUDED_AGENTS.length, 7)
  const slugs = SUBSCRIPTION_INCLUDED_AGENTS.map(a => a.slug)
  assert.deepEqual(Object.keys(VERIFIED_AGENT_UPSELLS).sort(), [...slugs].sort())
  for (const slug of slugs) {
    const offer = getVerifiedAgentUpsell(slug, "live")
    assert.ok(offer)
    assert.ok(offer!.href.startsWith("/"))
    assert.ok(!offer!.href.includes("stripe.com"))
    assert.ok(["quote", "subscription"].includes(offer!.type))
    assert.equal(getVerifiedAgentUpsell(slug, "beta"), null)
    assert.equal(getVerifiedAgentUpsell(slug, "planned"), null)
    assert.equal(getVerifiedAgentUpsell(slug, "setup-required"), null)
  }
  assert.equal(getVerifiedAgentUpsell("twitch-watcher-agent", "beta"), null)
  assert.equal(getVerifiedAgentUpsell("future-roadmap-agent", "live"), null)
})

test("subscription upsells use existing verified web billing paths", () => {
  assert.deepEqual(SUBSCRIPTION_EXPANSION.map(x => x.priceLabel), ["$79/month", "$149/month", "From $19, once"])
  for (const offer of SUBSCRIPTION_EXPANSION) {
    assert.ok(offer.href.startsWith("/"))
    assert.match(offer.criteria, /Only/)
  }
})
