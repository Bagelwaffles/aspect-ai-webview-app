import assert from "node:assert/strict"
import test from "node:test"

import { agents } from "../app/agents/agentCatalog"
import { listAgentContracts } from "../lib/agent-contract-registry"

test("every catalog agent has exactly one valid v1 operating contract", () => {
  const contracts = listAgentContracts()
  assert.equal(contracts.length, agents.length)
  assert.equal(new Set(contracts.map((contract) => contract.slug)).size, contracts.length)
  assert.deepEqual(
    contracts.map((contract) => contract.slug).sort(),
    agents.map((agent) => agent.slug).sort(),
  )

  for (const contract of contracts) {
    assert.equal(contract.templateVersion, 1)
    assert.equal(contract.tenantIsolation, "stable-customer-subject")
    assert.equal(contract.failClosed, true)
    assert.equal(contract.treatsExternalContextAsUntrusted, true)
    assert.equal(contract.recordsAuditState, true)
    assert.equal(contract.controlLimits.requiresIdempotencyKeyForMutations, true)
  }
})

test("live agents carry production proof while non-live agents are not represented as verified", () => {
  for (const contract of listAgentContracts()) {
    assert.equal(contract.liveProof.verified, contract.status === "live")
    if (contract.status === "live") {
      assert.ok(contract.liveProof.evidence.trim().length > 0)
    }
  }
})

test("action-native and mutating permissions cannot bypass approval", () => {
  for (const contract of listAgentContracts()) {
    if (contract.deliverableClass === "action") {
      assert.notEqual(contract.approval, "review-before-use")
    }

    for (const permission of contract.permissions) {
      if (["write", "publish", "billing"].includes(permission.mode)) {
        assert.notEqual(permission.approval, "none")
      }
      if (permission.mode === "billing") {
        assert.equal(permission.approval, "owner")
      }
    }
  }
})

test("the Overmind contract is internal, owner-gated, and not falsely marked Live", () => {
  const overmind = listAgentContracts().find((contract) => contract.slug === "aspect-overmind")
  assert.ok(overmind)
  assert.equal(overmind.runtime, "internal-control-plane")
  assert.equal(overmind.billing, "internal")
  assert.equal(overmind.approval, "owner-only")
  assert.notEqual(overmind.status, "live")
})
