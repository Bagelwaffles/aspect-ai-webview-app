import assert from "node:assert/strict"
import test from "node:test"

import { agents } from "../app/agents/agentCatalog"
import {
  SUBSCRIPTION_INCLUDED_AGENT_COUNT,
  SUBSCRIPTION_INCLUDED_AGENTS,
} from "../lib/subscription-agent-catalog"

test("subscription catalog contains the seven verified shared-credit Live agents", () => {
  assert.equal(SUBSCRIPTION_INCLUDED_AGENT_COUNT, 7)
  assert.deepEqual(
    SUBSCRIPTION_INCLUDED_AGENTS.map((agent) => agent.slug),
    [
      "content-agent",
      "lead-magnet-agent",
      "email-campaign-agent",
      "nurture-agent",
      "outreach-agent",
      "seo-agent",
      "product-creator-agent",
    ],
  )
})

test("every subscription-included agent remains Live and customer-launchable", () => {
  for (const included of SUBSCRIPTION_INCLUDED_AGENTS) {
    const contract = agents.find((agent) => agent.slug === included.slug)
    assert.ok(contract, `${included.slug} must exist in the public agent catalog`)
    assert.equal(contract.status, "live", `${included.slug} must remain Live while advertised in subscriptions`)
    assert.equal(contract.launchHref, included.href, `${included.slug} launch route must stay aligned`)
    assert.equal(contract.internal, undefined, `${included.slug} must remain customer-facing`)
  }
})
