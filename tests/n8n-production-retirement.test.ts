import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { POST } from "../app/api/internal/n8n/orchestrator/route"

test("production n8n orchestrator is retired unless explicitly re-enabled", async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousEnabled = process.env.AMS_N8N_ENABLED

  process.env.NODE_ENV = "production"
  delete process.env.AMS_N8N_ENABLED

  try {
    const response = await POST(
      new NextRequest("https://aspectmarketingsolutions.app/api/internal/n8n/orchestrator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status.ping", payload: {} }),
      }),
    )

    assert.equal(response.status, 410)
    const body = (await response.json()) as { error?: { code?: string } }
    assert.equal(body.error?.code, "N8N_EXECUTION_RETIRED")
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv

    if (previousEnabled === undefined) delete process.env.AMS_N8N_ENABLED
    else process.env.AMS_N8N_ENABLED = previousEnabled
  }
})
