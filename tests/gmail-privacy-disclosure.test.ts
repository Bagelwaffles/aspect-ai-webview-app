import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const privacy = readFileSync(new URL("../app/privacy/page.tsx", import.meta.url), "utf8")

test("Gmail disclosure does not claim an unimplemented in-product disconnect", () => {
  assert.match(privacy, /does not currently provide an in-product Gmail disconnect or deletion control/)
  assert.doesNotMatch(privacy, /may disconnect access in the product/)
})

test("Gmail disclosure documents revocation, deletion requests, and Limited Use", () => {
  assert.match(privacy, /Google Account permissions page/)
  assert.match(privacy, /request manual deletion of eligible stored OAuth credentials and Gmail-derived monitoring data/)
  assert.match(privacy, /Temporary OAuth authorization attempts expire after 10 minutes/)
  assert.match(privacy, /Preview refresh-verification evidence expires after 30 days/)
  assert.match(privacy, /revoking access at Google does not by itself delete records already retained by AMS/)
  assert.match(privacy, /Google API Services User Data Policy, including the Limited Use requirements/)
})
