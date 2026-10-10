import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const page = readFileSync("app/page.tsx", "utf8")
const packet = readFileSync("docs/AMS_GOOGLE_OAUTH_VERIFICATION_PACKET.md", "utf8")

test("public homepage describes accurate owner-only Gmail data use, limits, and deletion link", () => {
  assert.match(page, /owner-gmail-data-use/u)
  assert.match(page, /owner workspace/u)
  assert.match(page, /message headers/u)
  assert.match(page, /primary/u)
  assert.match(page, /secondary account is read-only/u)
  assert.match(page, /Customer Gmail connections and unrestricted AI-generated email replies are/u)
  assert.match(page, /href="\/privacy"/u)
})

test("verification packet contains real, restricted scope justifications and explicit hold gates", () => {
  assert.match(packet, /gmail\.readonly/u)
  assert.match(packet, /gmail\.send/u)
  assert.match(packet, /gmail\.metadata/u)
  assert.match(packet, /OAuth clients/u)
  assert.match(packet, /security assessment/u)
  assert.match(packet, /NOT SUBMITTED/u)
  assert.match(packet, /PR #262/u)
})
