import assert from "node:assert/strict"
import test from "node:test"

import { isN8nExecutionEnabled } from "../lib/server/n8n-runtime"

test("production n8n orchestrator is retired unless explicitly re-enabled", () => {
  assert.equal(
    isN8nExecutionEnabled({ NODE_ENV: "production" }),
    false,
  )
  assert.equal(
    isN8nExecutionEnabled({ NODE_ENV: "production", AMS_N8N_ENABLED: "true" }),
    true,
  )
  assert.equal(
    isN8nExecutionEnabled({ NODE_ENV: "test" }),
    true,
  )
})
