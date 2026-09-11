import assert from "node:assert/strict"
import test from "node:test"

import { createOvermindPlan, overmindControlState } from "../lib/server/overmind-control-plane"

test("Overmind v1 is planning-only and cannot silently enable execution", () => {
  const state = overmindControlState({
    ...process.env,
    AMS_OVERMIND_KILL_SWITCH: "false",
  })
  assert.equal(state.planningEnabled, true)
  assert.equal(state.executionEnabled, false)
})

test("explicit live text agent can be included in a plan without claiming execution", () => {
  const plan = createOvermindPlan(
    {
      objective: "Create customer-ready marketing copy for the current offer.",
      requestedAgentSlugs: ["content-agent"],
    },
    {
      id: () => "plan-test-1",
      now: () => new Date("2026-09-11T19:30:00.000Z"),
    },
  )

  assert.equal(plan.id, "plan-test-1")
  assert.equal(plan.mode, "planning-only")
  assert.equal(plan.executionPerformed, false)
  assert.equal(plan.steps.length, 1)
  assert.equal(plan.steps[0]?.agentSlug, "content-agent")
  assert.equal(plan.steps[0]?.readiness, "ready-for-planning")
  assert.equal(plan.blockers.length, 0)
})

test("non-live action agents remain blockers rather than being treated as executable", () => {
  const plan = createOvermindPlan({
    objective: "Publish an approved social update through the connected social publisher.",
    requestedAgentSlugs: ["social-publisher-agent"],
  })

  assert.equal(plan.executionPerformed, false)
  assert.equal(plan.steps[0]?.readiness, "blocked")
  assert.ok(plan.blockers.some((blocker) => blocker.includes("Social Publisher Agent")))
})

test("unknown requested agents produce an explicit blocker", () => {
  const plan = createOvermindPlan({
    objective: "Use a registered AMS agent to do this controlled task.",
    requestedAgentSlugs: ["not-a-real-agent"],
  })

  assert.equal(plan.steps.length, 0)
  assert.ok(plan.blockers.some((blocker) => blocker.includes("not registered")))
})
