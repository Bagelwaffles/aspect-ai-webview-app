import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { agents } from "../app/agents/agentCatalog"
import {
  AMS_AGENT_SALES_VIDEO_EMBED_URL,
  getAgentSalesOffer,
} from "../app/agents/agentSales"
import { SUBSCRIPTION_INCLUDED_AGENTS } from "../lib/subscription-agent-catalog"

test("unverified shared video is hidden while every agent keeps its verified sales route", () => {
  assert.equal(AMS_AGENT_SALES_VIDEO_EMBED_URL, null)

  for (const agent of agents) {
    const offer = getAgentSalesOffer(agent)
    assert.ok(offer.primaryHref, `${agent.slug} needs a primary sales route`)
    assert.ok(offer.primaryLabel, `${agent.slug} needs a primary sales label`)
    assert.equal(offer.videoEmbedUrl, AMS_AGENT_SALES_VIDEO_EMBED_URL)
    assert.ok(offer.videoTitle, `${agent.slug} needs accessible video title text`)
    assert.equal(offer.videoEmbedUrl, null, `${agent.slug} must not show the broken shared embed`)
  }
})

test("missing video shows an accessible fallback instead of an unverified iframe", () => {
  const salesPageSource = readFileSync(join(process.cwd(), "app/agents/[slug]/page.tsx"), "utf8")
  assert.match(salesPageSource, /offer\.videoEmbedUrl\s*\?/)
  assert.match(salesPageSource, /Video preview currently unavailable/)
  assert.match(salesPageSource, /role="status"/)
  assert.doesNotMatch(salesPageSource, /watch the sales video/)
})

test("agent catalog defers to server checkout availability rather than a stale public launch flag", () => {
  const catalog = readFileSync(join(process.cwd(), "app/agents/page.tsx"), "utf8")
  const salesPage = readFileSync(join(process.cwd(), "app/agents/[slug]/page.tsx"), "utf8")
  assert.doesNotMatch(catalog, /subscriptionCheckoutLive|NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE/)
  assert.match(catalog, /check the Pricing page for current subscription checkout availability/i)
  assert.match(salesPage, /isSubscriptionCheckoutAvailable/)
  assert.match(salesPage, /Subscription checkout paused/)
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

test("the Agent Store prominently presents the seven-agent Live showcase", () => {
  const showcasePath = join(process.cwd(), "public/agent-assets/live-agent-showcase.webp")
  const agentStoreSource = readFileSync(join(process.cwd(), "app/agents/page.tsx"), "utf8")

  assert.equal(existsSync(showcasePath), true)
  assert.match(agentStoreSource, /live-agent-showcase\.webp/)
  assert.match(agentStoreSource, /Meet the Live AMS team\./)
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
