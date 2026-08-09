import assert from "node:assert/strict"
import test from "node:test"

import {
  AMS_RECRUITMENT_GOAL,
  GOOGLE_CLOSED_TEST_DAYS,
  GOOGLE_CLOSED_TEST_MINIMUM,
  betaTesterIdFromEmail,
  buildAndroidBetaTesterLead,
  normalizeBetaTesterEmail,
} from "../lib/server/android-beta-testers"

test("beta tester email normalization is case-insensitive", () => {
  assert.equal(normalizeBetaTesterEmail(" Tester@Example.COM "), "tester@example.com")
})

test("tester id is stable for equivalent email spellings", () => {
  assert.equal(
    betaTesterIdFromEmail("Tester@Example.com"),
    betaTesterIdFromEmail(" tester@example.COM "),
  )
})

test("tester records preserve only bounded recruitment fields", () => {
  const tester = buildAndroidBetaTesterLead(
    {
      firstName: "  Alex   Smith  ",
      email: " Alex@example.com ",
      androidDevice: "  Pixel 8   Android 16 ",
      source: "tester community",
      notes: "Happy to test accessibility and rotation.",
    },
    "2026-08-09T12:00:00.000Z",
  )

  assert.equal(tester.first_name, "Alex Smith")
  assert.equal(tester.email, "alex@example.com")
  assert.equal(tester.android_device, "Pixel 8 Android 16")
  assert.equal(tester.commitment_14_days, true)
  assert.equal(tester.feedback_count, 0)
  assert.equal(tester.created_at, "2026-08-09T12:00:00.000Z")
})

test("recruitment target keeps a buffer above Google's minimum", () => {
  assert.equal(GOOGLE_CLOSED_TEST_MINIMUM, 12)
  assert.equal(GOOGLE_CLOSED_TEST_DAYS, 14)
  assert.ok(AMS_RECRUITMENT_GOAL > GOOGLE_CLOSED_TEST_MINIMUM)
})
