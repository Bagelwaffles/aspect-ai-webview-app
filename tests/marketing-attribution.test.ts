import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const layout = fs.readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8")
const tracker = fs.readFileSync(path.join(process.cwd(), "components/marketing-attribution.tsx"), "utf8")
const route = fs.readFileSync(path.join(process.cwd(), "app/api/marketing/attribution/route.ts"), "utf8")

test("root layout mounts marketing attribution without changing checkout behavior", () => {
  assert.match(layout, /MarketingAttribution/)
  assert.doesNotMatch(layout, /stripe/i)
})

test("marketing attribution records only explicit UTM campaign fields and path", () => {
  assert.match(tracker, /utm_source/)
  assert.match(tracker, /utm_medium/)
  assert.match(tracker, /utm_campaign/)
  assert.match(tracker, /utm_content/)
  assert.match(tracker, /path: url\.pathname/)
  assert.doesNotMatch(tracker, /document\.cookie/)
  assert.doesNotMatch(tracker, /localStorage/)
})

test("attribution endpoint logs bounded campaign data and rejects empty attribution", () => {
  assert.match(route, /MAX_VALUE_LENGTH = 160/)
  assert.match(route, /event: "marketing_attribution"/)
  assert.match(route, /console\.info\(JSON\.stringify\(attribution\)\)/)
  assert.match(route, /!attribution\.source && !attribution\.campaign/)
})
