import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const page = readFileSync(new URL("../app/pricing/page.tsx", import.meta.url), "utf8")

test("pricing leads with the two real customer choices", () => {
  assert.ok(page.includes("Choose the simplest way to start."))
  assert.ok(page.includes(`${SUBSCRIPTION_MARKER}`))
  assert.ok(page.includes("Quick Marketing Audit — $49"))
  assert.ok(page.includes("Compare plans"))
  assert.ok(page.includes("Get the $49 Audit"))
})

test("standalone reference rates remain non-purchasable", () => {
  assert.ok(page.includes("Reference: standalone agent rates and credit top-ups"))
  assert.ok(page.includes("standalone checkout is not currently available"))
  assert.ok(page.includes("Subscription access uses shared credits"))
  assert.ok(!page.includes("Pay for one completed run, or subscribe for better value."))
  assert.ok(!page.includes("Use a Live AMS marketing agent from $12 per completed standalone run"))
})

const SUBSCRIPTION_MARKER = "Live agents from $29/month"
