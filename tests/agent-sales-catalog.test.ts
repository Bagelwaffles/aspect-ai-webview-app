import assert from "node:assert/strict"
import test from "node:test"

import { agents } from "../app/agents/agentCatalog"
import {
  AMS_AGENT_SALES_VIDEO_EMBED_URL,
  getAgentSalesOffer,
} from "../app/agents/agentSales"
import { SUBSCRIPTION_INCLUDED_AGENTS } from "../lib/subscription-agent-catalog"

test("every public agent page has a sales offer and embedded sales video", () => {
  assert.match(AMS_AGENT_SALES_VIDEO_EMBED_URL, /^https:\/\/app\.heygen\.com\/embeds\/[a-zA-Z0-9]+$/)

  for (const agent of agents) {
    const offer = getAgentSalesOffer(agent)
    assert.ok(offer.primaryHref, `${agent.slug} needs a primary sales route`)
    assert.ok(offer.primaryLabel, `${agent.slug} needs a primary sales label`)
    assert.equal(offer.videoEmbedUrl, AMS_AGENT_SALES_VIDEO_EMBED_URL)
    assert.ok(offer.videoTitle, `${agent.slug} needs accessible video title text`)
  }
})

test("the seven verified shared-credit agents sell only through existing subscription plans", () => {
  for (const included of SUBSCRIPTION_INCLUDED_AGENTS) {
    const agent = agents.find((candidate) => candidate.slug === included.slug)
    assert.ok(agent, `${included.slug} must remain in the agent catalog`)

    const offer = getAgentSalesOffer(agent)
    assert.equal(offer.mode, "subscription")
    assert.equal(offer.price, "From $29/month")
    assert.equal(offer.primaryHref, "/pricing#plans")
    assert.equal(offer.secondaryHref, included.href)
  }
})

test("the seven verified Live agents use matching accessible WebP artwork", () => {
  for (const included of SUBSCRIPTION_INCLUDED_AGENTS) {
    const agent = agents.find((candidate) => candidate.slug === included.slug)
    assert.ok(agent, `${included.slug} must remain in the agent catalog`)
    assert.equal(agent.status, "live")
    assert.equal(agent.image?.src, `/agent-assets/${included.slug}.webp`)
    assert.match(agent.image?.alt ?? "", new RegExp(agent.name.replace(" Agent", ""), "i"))
  }
})

test("Marketing Audit preserves the existing $49 one-time purchase route", () => {
  const audit = agents.find((agent) => agent.slug === "marketing-audit-agent")
  assert.ok(audit)

  const offer = getAgentSalesOffer(audit)
  assert.equal(offer.mode, "one-time")
  assert.equal(offer.price, "$49 one-time")
  assert.equal(offer.primaryHref, "/quick-marketing-audit")
})

test("unfinished agents never receive a fabricated standalone checkout", () => {
  for (const agent of agents) {
    if (SUBSCRIPTION_INCLUDED_AGENTS.some((included) => included.slug === agent.slug)) continue
    if (agent.slug === "marketing-audit-agent") continue

    const offer = getAgentSalesOffer(agent)
    assert.notEqual(offer.mode, "subscription")
    assert.notEqual(offer.mode, "one-time")
    assert.notEqual(offer.primaryHref, "/api/billing/checkout")
    assert.equal(offer.price.includes("$"), false, `${agent.slug} must not invent a sale price`)
  }
})
