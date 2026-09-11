import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

test("Lead Magnet exposes a downloadable and printable customer artifact", () => {
  const page = source("../app/lead-magnet-agent/page.tsx")
  assert.match(page, /Download lead magnet/)
  assert.match(page, /Print \/ Save PDF/)
  assert.match(page, /buildBrandedHtmlArtifact/)
  assert.match(page, /does not publish, email, enroll, or contact anyone for you/i)
})

test("Product Creator separates real customer product and seller launch kit", () => {
  const page = source("../app/product-creator-agent/page.tsx")
  assert.match(page, /Download product file/)
  assert.match(page, /Download production brief/)
  assert.match(page, /Download seller launch kit/)
  assert.match(page, /splitProductArtifactBody/)
  assert.match(page, /does not claim to manufacture physical goods/)
})

test("paid Quick Audit exposes a durable downloadable report without changing checkout", () => {
  const page = source("../app/quick-marketing-audit/thanks/QuickAuditResultClient.tsx")
  assert.match(page, /Download report/)
  assert.match(page, /Print \/ Save PDF/)
  assert.match(page, /buildAuditArtifact/)
  assert.match(page, /5 Priority Marketing Problems and Fixes/i)
  assert.match(page, /7-Day Action Plan/)
})
