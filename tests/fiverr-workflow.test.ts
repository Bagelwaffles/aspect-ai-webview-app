import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const workflowPath = "automation/n8n/AMS_Fiverr_Bridge_v1.json"

async function loadWorkflow() {
  return JSON.parse(await readFile(workflowPath, "utf8")) as {
    name: string
    active: boolean
    nodes: Array<{
      name: string
      type: string
      parameters?: Record<string, unknown>
      credentials?: unknown
    }>
    connections: Record<string, unknown>
    meta?: Record<string, unknown>
  }
}

test("Fiverr workflow is importable-shaped and inactive by default", async () => {
  const workflow = await loadWorkflow()
  assert.equal(workflow.name, "AMS Fiverr Bridge v1")
  assert.equal(workflow.active, false)
  assert.ok(Array.isArray(workflow.nodes))
  assert.ok(workflow.nodes.length >= 6)
  assert.ok(workflow.connections && typeof workflow.connections === "object")
})

test("Fiverr workflow has no embedded credentials or buyer-facing Fiverr action", async () => {
  const workflow = await loadWorkflow()
  assert.equal(workflow.nodes.some((node) => node.credentials !== undefined), false)

  const serialized = JSON.stringify(workflow).toLowerCase()
  assert.equal(serialized.includes("fiverr.com/api"), false)
  assert.equal(serialized.includes("webdriver"), false)
  assert.equal(serialized.includes("playwright"), false)
  assert.equal(serialized.includes("puppeteer"), false)
  assert.equal(serialized.includes("selenium"), false)
  assert.equal(serialized.includes("deliver on fiverr automatically"), false)
})

test("Fiverr workflow reuses AMS Internal Gateway route and keeps operator approval", async () => {
  const workflow = await loadWorkflow()
  const intake = workflow.nodes.find((node) => node.name === "Send to AMS Fiverr Intake")
  const approval = workflow.nodes.find((node) => node.name === "Email Owner Approval Packet")
  const trigger = workflow.nodes.find((node) => node.name === "Fiverr Gmail Trigger")

  assert.ok(intake)
  assert.equal(
    intake?.parameters?.url,
    "https://www.aspectmarketingsolutions.app/api/internal/fiverr/intake",
  )
  assert.equal(intake?.parameters?.genericAuthType, "httpHeaderAuth")
  assert.ok(approval)
  assert.equal(approval?.type, "n8n-nodes-base.gmail")
  assert.equal(approval?.parameters?.sendTo, "owner@example.invalid")
  assert.ok(trigger)
  assert.equal(trigger?.type, "n8n-nodes-base.gmailTrigger")
})

test("workflow notes require human setup and prohibit off-platform automation", async () => {
  const workflow = await loadWorkflow()
  const notes = String(workflow.meta?.amsNotes ?? "")
  assert.match(notes, /AMS Internal Gateway/)
  assert.match(notes, /Keep inactive/i)
  assert.match(notes, /no buyer auto-messaging/i)
  assert.match(notes, /no auto-delivery/i)
  assert.match(notes, /no off-platform payment routing/i)
})
