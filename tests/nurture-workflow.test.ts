import assert from "node:assert/strict"
import test from "node:test"
import { buildNurtureContentBrief, type NurtureType } from "../lib/nurture-workflow"

test("all nurture stages retain operating boundaries within the runtime input limit", () => {
  for (const stage of ["welcome", "onboarding", "follow-up", "retention", "re-engagement"] as NurtureType[]) {
    const brief = buildNurtureContentBrief({
      businessName: "AMS", audience: "Opted-in customers", campaignType: stage,
      sequenceLength: "7", objective: "x".repeat(1000), keyMessage: "y".repeat(1000),
      constraints: "z".repeat(1000), tone: "friendly",
    })
    assert.ok(brief.goal.length <= 500)
    assert.ok(brief.goal.includes(stage))
    assert.ok(brief.goal.includes("No sending, scheduling, enrollment"))
    assert.ok(brief.goal.includes("Stop on opt-out or reply"))
    assert.equal(brief.channel, "email")
  }
})

test("invalid nurture stages are rejected", () => {
  assert.throws(() => buildNurtureContentBrief({
    businessName: "AMS", audience: "Customers", campaignType: "invalid" as NurtureType,
    sequenceLength: "3", objective: "Welcome", keyMessage: "Hello", tone: "friendly",
  }), /Unsupported/)
})
