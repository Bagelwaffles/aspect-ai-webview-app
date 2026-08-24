import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  OWNER_QA_DAILY_CREDITS,
  ownerQaClaimKey,
  ownerQaUtcDay,
} from "../lib/server/owner-qa-credits"

const OWNER_SUBJECT = `customer:google:${"a".repeat(64)}`

test("owner QA allowance is bounded to three credits per UTC day", () => {
  assert.equal(OWNER_QA_DAILY_CREDITS, 3)
  assert.equal(ownerQaUtcDay(new Date("2026-08-23T23:59:59.000Z")), "2026-08-23")
  assert.equal(ownerQaUtcDay(new Date("2026-08-24T00:00:00.000Z")), "2026-08-24")

  const dayOne = ownerQaClaimKey(OWNER_SUBJECT, new Date("2026-08-23T23:59:59.000Z"))
  const dayTwo = ownerQaClaimKey(OWNER_SUBJECT, new Date("2026-08-24T00:00:00.000Z"))

  assert.notEqual(dayOne, dayTwo)
  assert.match(dayOne, /owner-qa-entitlement:content:2026-08-23:/)
  assert.match(dayTwo, /owner-qa-entitlement:content:2026-08-24:/)
})

test("owner QA route remains owner-session, trusted-origin, and explicit-confirmation gated", () => {
  const source = readFileSync(
    new URL("../app/api/internal/owner-test-entitlement/route.ts", import.meta.url),
    "utf8",
  )

  assert.match(source, /requestHasTrustedOrigin\(request\)/)
  assert.match(source, /principal\.billingEmail !== ownerEmail/)
  assert.match(source, /confirmation !== CONFIRMATION/)
  assert.match(source, /grantOwnerDailyQaCredits\(principal\.subject\)/)
  assert.match(source, /recurringBilling: false/)
  assert.match(source, /purpose: "owner-qa"/)
})

test("owner QA grant is daily-idempotent and never calls Stripe billing", () => {
  const source = readFileSync(
    new URL("../lib/server/owner-qa-credits.ts", import.meta.url),
    "utf8",
  )

  assert.match(source, /if redis\.call\('EXISTS', KEYS\[1\]\) == 1/)
  assert.match(source, /return \{'already-granted'/)
  assert.match(source, /INCRBY/)
  assert.match(source, /'EX', ARGV\[3\]/)
  assert.doesNotMatch(source, /stripe/i)
})
