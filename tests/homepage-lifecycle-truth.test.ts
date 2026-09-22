import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("homepage lifecycle language matches the canonical five-state agent model", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
  assert.ok(page.includes("Five clear statuses"))
  assert.ok(page.includes("Live, Beta, Setup Required, Blocked, and Planned"))
  assert.ok(!page.includes("Four statuses."))
  assert.ok(!page.includes("In Development, and Coming Soon"))
})

test("homepage featured verified agents are not labeled as queued", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
  assert.ok(!page.includes('status: "Queued next"'))
  assert.ok(page.includes('name: "Content Agent"'))
  assert.ok(page.includes('name: "Lead Magnet Agent"'))
  assert.ok(page.includes('name: "Nurture Agent"'))
})
