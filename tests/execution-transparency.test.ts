import assert from "node:assert/strict"
import test from "node:test"

import { listAgentContracts } from "../lib/agent-contract-registry"
import {
  buildExecutionProvenance,
  DEFAULT_EXECUTION_TRANSPARENCY_POLICY,
} from "../lib/execution-transparency"

test("every registered agent inherits the AMS execution transparency policy", () => {
  const contracts = listAgentContracts()
  assert.ok(contracts.length > 0)

  for (const contract of contracts) {
    assert.equal(contract.failClosed, true)
    assert.equal(contract.recordsAuditState, true)
    assert.deepEqual(
      contract.executionTransparency,
      DEFAULT_EXECUTION_TRANSPARENCY_POLICY,
      `${contract.slug} must inherit the platform transparency policy`,
    )
  }
})

test("external provider execution fails validation without explicit customer consent", () => {
  assert.throws(
    () =>
      buildExecutionProvenance({
        aiGenerated: true,
        automaticallyVerified: true,
        humanReviewed: false,
        externalProviders: ["Example Provider"],
        externalProviderConsent: "not-granted",
      }),
    /External provider processing requires explicit customer consent/,
  )
})

test("human review fails validation without explicit customer consent", () => {
  assert.throws(
    () =>
      buildExecutionProvenance({
        aiGenerated: true,
        automaticallyVerified: true,
        humanReviewed: true,
        humanReviewConsent: "not-granted",
      }),
    /Human review requires explicit customer consent/,
  )
})

test("approved external processing records transparent execution labels", () => {
  const provenance = buildExecutionProvenance({
    aiGenerated: true,
    automaticallyVerified: true,
    humanReviewed: false,
    externalProviders: ["OpenAI via Vercel AI Gateway"],
    humanReviewConsent: "not-required",
    externalProviderConsent: "granted",
    consentRecordedAt: "2026-09-24T22:30:00.000Z",
  })

  assert.deepEqual(provenance.labels, [
    "AI_GENERATED",
    "AUTOMATICALLY_VERIFIED",
    "EXTERNAL_PROVIDER",
    "CUSTOMER_APPROVED",
  ])
  assert.equal(provenance.customerConsent.externalProvider, "granted")
  assert.equal(provenance.customerConsent.recordedAt, "2026-09-24T22:30:00.000Z")
})
