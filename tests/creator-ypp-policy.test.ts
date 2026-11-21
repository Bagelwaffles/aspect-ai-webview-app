import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const creatorPage = readFileSync(new URL("../app/creators/page.tsx", import.meta.url), "utf8")

test("creator page gives dated, source-linked YouTube 2027 monetization guidance", () => {
  assert.match(creatorPage, /id="creator-ypp-2027"/)
  assert.match(creatorPage, /January 31, 2027/)
  assert.match(creatorPage, /February 1, 2027/)
  assert.match(creatorPage, /10 million qualified Shorts/)
  assert.match(creatorPage, /20 million qualified Shorts/)
  assert.match(creatorPage, /8,000 qualified watch hours/)
  assert.match(creatorPage, /October 15, 2026/)
  assert.match(creatorPage, /support\.google\.com\/youtube\/blog\/451804019/)
})

test("creator guidance requires channel-owner action and avoids bonus guarantees", () => {
  assert.match(creatorPage, /AMS cannot accept channel terms on a creator&apos;s behalf/)
  assert.match(creatorPage, /invite-only Shorts bonus pilot/)
  assert.match(creatorPage, /does not guarantee invitations, eligibility, views, earnings, or publishing outcomes/)
  assert.match(creatorPage, /rel="noopener noreferrer"/)
})
