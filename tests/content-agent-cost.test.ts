import assert from "node:assert/strict"
import test from "node:test"

import {
  ContentAgentCostGuardError,
  DEFAULT_CONTENT_AGENT_MAX_REQUEST_COST_USD,
  getContentAgentMaxRequestCostUsd,
  parseGatewayCostUsd,
  recordContentAgentGatewayCost,
  type ContentAgentCostReceipt,
  type ContentAgentCostStore,
} from "../lib/server/content-agent-cost"

class MemoryCostStore implements ContentAgentCostStore {
  receipts: ContentAgentCostReceipt[] = []
  fail = false

  async record(receipt: ContentAgentCostReceipt) {
    if (this.fail) throw new Error("simulated ledger outage")
    this.receipts.push(structuredClone(receipt))
  }
}

test("Content Agent cost ceiling defaults conservatively and accepts a bounded override", () => {
  assert.equal(getContentAgentMaxRequestCostUsd({ NODE_ENV: "test" }), DEFAULT_CONTENT_AGENT_MAX_REQUEST_COST_USD)
  assert.equal(
    getContentAgentMaxRequestCostUsd({
      NODE_ENV: "test",
      AMS_CONTENT_AGENT_MAX_REQUEST_COST_USD: "0.015",
    }),
    0.015,
  )
})

test("invalid Content Agent cost ceilings fail closed", () => {
  for (const value of ["0", "-1", "not-a-number", "1.01"]) {
    assert.throws(
      () =>
        getContentAgentMaxRequestCostUsd({
          NODE_ENV: "test",
          AMS_CONTENT_AGENT_MAX_REQUEST_COST_USD: value,
        }),
      (error: unknown) =>
        error instanceof ContentAgentCostGuardError &&
        error.code === "CONTENT_AGENT_COST_LIMIT_INVALID",
    )
  }
})

test("AI Gateway cost metadata accepts numeric strings and rejects missing values", () => {
  assert.equal(parseGatewayCostUsd("0.004321"), 0.004321)
  assert.equal(parseGatewayCostUsd(0.0012), 0.0012)
  for (const value of [undefined, null, "", "not-a-number", -0.01]) {
    assert.throws(
      () => parseGatewayCostUsd(value),
      (error: unknown) =>
        error instanceof ContentAgentCostGuardError &&
        error.code === "CONTENT_AGENT_COST_METADATA_MISSING",
    )
  }
})

test("normal Gateway cost is persisted with bounded token telemetry", async () => {
  const store = new MemoryCostStore()
  const receipt = await recordContentAgentGatewayCost({
    model: "openai/gpt-5.4-mini",
    gatewayCost: "0.0045",
    usage: { inputTokens: 800, outputTokens: 600 },
    maxCostUsd: 0.02,
    store,
    now: () => new Date("2026-08-23T12:00:00.000Z"),
    createId: () => "fixture",
  })

  assert.equal(store.receipts.length, 1)
  assert.equal(receipt.id, "content-cost-fixture")
  assert.equal(receipt.costUsd, 0.0045)
  assert.equal(receipt.maxCostUsd, 0.02)
  assert.equal(receipt.overLimit, false)
  assert.equal(receipt.inputTokens, 800)
  assert.equal(receipt.outputTokens, 600)
  assert.equal(receipt.createdAt, "2026-08-23T12:00:00.000Z")
})

test("over-ceiling Gateway cost is recorded and then rejected", async () => {
  const store = new MemoryCostStore()

  await assert.rejects(
    recordContentAgentGatewayCost({
      model: "openai/gpt-5.4-mini",
      gatewayCost: 0.025,
      usage: { inputTokens: 900, outputTokens: 1200 },
      maxCostUsd: 0.02,
      store,
      createId: () => "over-limit",
    }),
    (error: unknown) =>
      error instanceof ContentAgentCostGuardError &&
      error.code === "CONTENT_AGENT_COST_LIMIT_EXCEEDED",
  )

  assert.equal(store.receipts.length, 1)
  assert.equal(store.receipts[0]?.overLimit, true)
  assert.equal(store.receipts[0]?.costUsd, 0.025)
})

test("cost ledger failure prevents cost verification", async () => {
  const store = new MemoryCostStore()
  store.fail = true

  await assert.rejects(
    recordContentAgentGatewayCost({
      model: "openai/gpt-5.4-mini",
      gatewayCost: 0.004,
      maxCostUsd: 0.02,
      store,
    }),
    /simulated ledger outage/u,
  )
})
