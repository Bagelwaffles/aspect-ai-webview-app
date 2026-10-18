import assert from "node:assert/strict"
import test from "node:test"

import {
  AMS_ACTION_LIFECYCLE,
  actionIntentFingerprint,
  approvalSatisfiesGovernance,
  createGovernedActionProposal,
  governanceDecisionForAction,
} from "../lib/server/action-governance"

test("AMS governance lifecycle stays event -> proposed action -> approval -> execution -> audit log", () => {
  assert.deepEqual(AMS_ACTION_LIFECYCLE, [
    "event",
    "proposed_action",
    "approval",
    "execution",
    "audit_log",
  ])
})

test("read-only monitoring and recommendations may proceed without approval", () => {
  for (const kind of ["read", "monitor", "draft", "recommend", "private_artifact"]) {
    const decision = governanceDecisionForAction(kind)
    assert.equal(decision.risk, "green")
    assert.equal(decision.approval, "none")
    assert.equal(decision.automaticExecutionAllowed, true)
    assert.equal(decision.failClosed, false)
  }
})

test("publishing, messaging, and reversible mutations require explicit human approval", () => {
  for (const kind of ["publish", "message", "reversible_mutation"]) {
    const decision = governanceDecisionForAction(kind)
    assert.equal(decision.risk, "yellow")
    assert.equal(decision.approval, "human")
    assert.equal(decision.automaticExecutionAllowed, false)
  }
})

test("spending, credentials, permissions, production config, and deletion require owner approval", () => {
  for (const kind of [
    "spend",
    "billing_change",
    "credential_change",
    "permission_change",
    "production_config",
    "delete",
    "destructive_mutation",
  ]) {
    const decision = governanceDecisionForAction(kind)
    assert.equal(decision.risk, "red")
    assert.equal(decision.approval, "owner")
    assert.equal(decision.automaticExecutionAllowed, false)
  }
})

test("unknown action kinds fail closed", () => {
  const decision = governanceDecisionForAction("future-unregistered-action")
  assert.equal(decision.risk, "red")
  assert.equal(decision.approval, "owner")
  assert.equal(decision.automaticExecutionAllowed, false)
  assert.equal(decision.failClosed, true)
})

test("proposal fingerprint binds approval to the exact action intent", () => {
  const intent = {
    eventId: "event-1",
    actionKind: "publish",
    provider: "linkedin",
    target: "urn:li:organization:145213077",
    resourceScope: "organization-page",
    summary: "Publish the approved AMS launch update.",
    idempotencyKey: "linkedin-launch-1",
  }
  const proposal = createGovernedActionProposal(intent, {
    id: () => "proposal-1",
    now: () => new Date("2026-09-29T20:00:00.000Z"),
  })

  assert.equal(proposal.id, "proposal-1")
  assert.equal(proposal.approvalRequired, "human")
  assert.equal(proposal.actionFingerprint, actionIntentFingerprint(intent))
  assert.notEqual(
    proposal.actionFingerprint,
    actionIntentFingerprint({ ...intent, target: "different-target" }),
  )
})

test("approval role must satisfy the proposal requirement", () => {
  const publish = createGovernedActionProposal({
    eventId: "event-2",
    actionKind: "publish",
    provider: "youtube",
    target: "approved-channel",
    resourceScope: "channel",
    summary: "Publish approved content.",
  })
  const credential = createGovernedActionProposal({
    eventId: "event-3",
    actionKind: "credential_change",
    provider: "linkedin",
    target: "organization-connection",
    resourceScope: "oauth-connection",
    summary: "Replace an organization OAuth connection.",
  })

  assert.equal(approvalSatisfiesGovernance(publish), false)
  assert.equal(approvalSatisfiesGovernance(publish, "operator"), true)
  assert.equal(approvalSatisfiesGovernance(credential, "operator"), false)
  assert.equal(approvalSatisfiesGovernance(credential, "owner"), true)
})
