import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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

test("marketing audit reflects the open production checkout without overstating paid proof", () => {
  const agent = getAgent("marketing-audit-agent")
  assert.ok(agent)
  assert.equal(agent.status, "beta")
  assert.equal(agent.launchHref, "/quick-marketing-audit")
  assert.match(agent.statusReason, /\$49 public checkout/i)
  assert.match(agent.statusReason, /native AMS fulfillment/i)
  assert.match(agent.statusReason, /fresh real paid production fulfillment has not yet been re-verified/i)
  assert.match(agent.nextMilestone, /first fresh real paid production audit/i)
  assert.doesNotMatch(agent.statusReason, /checkout remains intentionally paused/i)
})

test("agent status page uses lifecycle-aware launch language", () => {
  const source = readFileSync(new URL("../app/agents/[slug]/page.tsx", import.meta.url), "utf8")
  assert.match(source, /status === "live"[^]*return "Open agent"/)
  assert.match(source, /status === "beta"[^]*return "Open beta"/)
  assert.doesNotMatch(source, /launchHref[^\n]*>Open beta/)
})
