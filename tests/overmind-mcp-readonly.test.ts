import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { GET, POST } from "../app/api/mcp/route"

function mcpRequest(body: Record<string, unknown>) {
  return new NextRequest("https://www.aspectmarketingsolutions.app/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "MCP-Protocol-Version": "2026-07-28",
    },
    body: JSON.stringify(body),
  })
}

test("MCP bridge advertises only read-only Overmind tools", async () => {
  const response = await POST(
    mcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
      },
    }),
  )

  assert.equal(response.status, 200)
  const body = await response.json()
  const tools = body.result.tools as Array<{
    name: string
    annotations: {
      readOnlyHint: boolean
      destructiveHint: boolean
      idempotentHint: boolean
      openWorldHint: boolean
    }
  }>

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["ams_platform_status", "ams_list_agents", "ams_get_agent", "ams_plan_objective"],
  )
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true)
    assert.equal(tool.annotations.destructiveHint, false)
    assert.equal(tool.annotations.idempotentHint, true)
    assert.equal(tool.annotations.openWorldHint, false)
    assert.doesNotMatch(tool.name, /publish|send|delete|bill|execute|deploy|write/i)
  }
})

test("MCP status tool reports that execution did not occur", async () => {
  const response = await POST(
    mcpRequest({
      jsonrpc: "2.0",
      id: "status-1",
      method: "tools/call",
      params: { name: "ams_platform_status", arguments: {} },
    }),
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.result.isError, false)
  assert.equal(body.result.structuredContent.executionPerformed, false)
  assert.equal(body.result.structuredContent.bridgeMode, "read-only")
  assert.equal(body.result.structuredContent.control.executionEnabled, false)
})

test("MCP planning tool cannot represent a plan as execution", async () => {
  const response = await POST(
    mcpRequest({
      jsonrpc: "2.0",
      id: "plan-1",
      method: "tools/call",
      params: {
        name: "ams_plan_objective",
        arguments: { objective: "Create a safe marketing campaign plan for AMS." },
      },
    }),
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.result.structuredContent.executionPerformed, false)
  assert.equal(body.result.structuredContent.plan.executionPerformed, false)
  assert.equal(body.result.structuredContent.plan.mode, "planning-only")
})

test("MCP bridge supports modern discovery and legacy initialize", async () => {
  const discover = await POST(
    mcpRequest({ jsonrpc: "2.0", id: 2, method: "server/discover", params: {} }),
  )
  const discoverBody = await discover.json()
  assert.deepEqual(discoverBody.result.supportedVersions, ["2026-07-28", "2025-11-25"])
  assert.equal(discoverBody.result.capabilities.tools.listChanged, false)

  const initialize = await POST(
    mcpRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy-test", version: "1" } },
    }),
  )
  const initializeBody = await initialize.json()
  assert.equal(initializeBody.result.protocolVersion, "2025-11-25")
  assert.equal(initializeBody.result.serverInfo.name, "ams-overmind")
})

test("MCP GET advertises a read-only validation endpoint", async () => {
  const response = await GET()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.mode, "read-only")
  assert.equal(body.endpoint, "/api/mcp")
})
