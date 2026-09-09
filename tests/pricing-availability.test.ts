import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("standalone rates do not advertise an available single-run checkout", () => {
  const page = readFileSync(new URL("../app/pricing/page.tsx", import.meta.url), "utf8")
  assert.ok(page.includes("Standalone rates — checkout not yet available."))
  assert.ok(page.includes("Standalone checkout unavailable. Included with subscriber shared credits."))
  assert.ok(!page.includes("Pay for one completed run, or subscribe for better value."))
  assert.ok(!page.includes("Use a Live AMS marketing agent from $12 per completed standalone run"))
})
