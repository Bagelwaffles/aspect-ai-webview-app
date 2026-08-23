import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const pageSource = readFileSync(new URL("../app/content-agent/page.tsx", import.meta.url), "utf8")

test("content brief fields remain editable when execution is unavailable", () => {
  assert.doesNotMatch(pageSource, /<fieldset[^>]*disabled=\{!launchEnabled/)
  assert.match(pageSource, /<Button type="submit" disabled=\{!launchEnabled \|\| isSubmitting\}/)
})

test("content brief uses mobile-friendly text controls", () => {
  assert.match(pageSource, /id="businessName"[\s\S]*?className="h-11 text-base"/)
  assert.match(pageSource, /id="audience"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(pageSource, /id="goal"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(pageSource, /id="offer"[\s\S]*?className="min-h-20 text-base"/)
})
