import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const contentAgentSource = readFileSync(new URL("../app/content-agent/page.tsx", import.meta.url), "utf8")
const quickAuditSource = readFileSync(new URL("../components/quick-audit-checkout-form.tsx", import.meta.url), "utf8")

test("content brief fields remain editable when execution is unavailable", () => {
  assert.doesNotMatch(contentAgentSource, /<fieldset[^>]*disabled=\{!launchEnabled/)
  assert.match(contentAgentSource, /<Button type="submit" disabled=\{!launchEnabled \|\| isSubmitting\}/)
})

test("content brief uses mobile-friendly text controls", () => {
  assert.match(contentAgentSource, /id="businessName"[\s\S]*?className="h-11 text-base"/)
  assert.match(contentAgentSource, /id="audience"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(contentAgentSource, /id="goal"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(contentAgentSource, /id="offer"[\s\S]*?className="min-h-20 text-base"/)
})

test("Quick Audit checkout keeps mobile inputs editable and touch friendly", () => {
  assert.doesNotMatch(quickAuditSource, /<(?:Input|Textarea)[^>]*disabled=/)
  assert.match(quickAuditSource, /id="quick-audit-business"[\s\S]*?className="h-11 text-base"/)
  assert.match(quickAuditSource, /id="quick-audit-website"[\s\S]*?inputMode="url"/)
  assert.match(quickAuditSource, /id="quick-audit-goals"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(quickAuditSource, /<Button className="h-11 w-full" disabled=\{submitting\}/)
})
