import assert from "node:assert/strict"
import test from "node:test"

import { monthlyCreditsForPlan } from "../lib/server/entitlements"

test("Content Agent subscription credits stay within the approved launch allocation", () => {
  assert.equal(monthlyCreditsForPlan("starter"), 100)
  assert.equal(monthlyCreditsForPlan("growth"), 500)
  assert.equal(monthlyCreditsForPlan("pro"), 1500)
})

test("Content Agent plan capacity increases monotonically with price tier", () => {
  const starter = monthlyCreditsForPlan("starter")
  const growth = monthlyCreditsForPlan("growth")
  const pro = monthlyCreditsForPlan("pro")

  assert.ok(starter > 0)
  assert.ok(growth > starter)
  assert.ok(pro > growth)
})
