import assert from "node:assert/strict"
import test from "node:test"

import {
  agentToolPermissionRegistry,
  customerConnectionPermissionMap,
} from "../lib/agent-tool-permissions"

test("read permissions default to no approval while writes/publishes require approval", () => {
  for (const permission of Object.values(agentToolPermissionRegistry)) {
    if (permission.risk === "read") {
      assert.equal(permission.approvalRequiredByDefault, false)
    } else {
      assert.equal(permission.approvalRequiredByDefault, true)
    }
  }
})

test("every connection provider separates readable and consequential permissions", () => {
  for (const permissions of Object.values(customerConnectionPermissionMap)) {
    assert.ok(permissions.some((id) => agentToolPermissionRegistry[id].risk === "read"))
    assert.ok(permissions.some((id) => agentToolPermissionRegistry[id].risk !== "read"))
  }
})
