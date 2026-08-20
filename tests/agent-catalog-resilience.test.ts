import assert from "node:assert/strict"
import test from "node:test"

import { agentStatusCounts, agents, getAgent } from "../app/agents/agentCatalog"

test("agent catalog keeps the approved 33-role inventory", () => {
  assert.equal(agents.length, 33)
  assert.equal(Object.values(agentStatusCounts).reduce((sum, count) => sum + count, 0), 33)
})

test("n8n automation is blocked while the former cloud worker is unavailable", () => {
  const agent = getAgent("n8n-automation-agent")
  assert.ok(agent)
  assert.equal(agent.status, "blocked")
  assert.match(agent.statusReason, /cloud trial|cloud worker/i)
  assert.match(agent.nextMilestone, /self-hosted Community Edition|migrate/i)
  assert.doesNotMatch(agent.statusReason, /instance and orchestrator are online/i)
})

test("marketing audit reflects deployed native fulfillment without claiming live readiness", () => {
  const agent = getAgent("marketing-audit-agent")
  assert.ok(agent)
  assert.equal(agent.status, "setup-required")
  assert.equal(agent.launchHref, "/quick-marketing-audit")
  assert.match(agent.statusReason, /native AMS fulfillment/i)
  assert.match(agent.statusReason, /checkout remains intentionally paused/i)
  assert.match(agent.nextMilestone, /Stripe test-mode checkout/i)
})
