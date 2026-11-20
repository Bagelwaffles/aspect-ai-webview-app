import assert from "node:assert/strict"
import test from "node:test"

import { isAcademyPreviewEnabled } from "../lib/academy/preview-gate"

test("Academy defaults closed in any environment without an explicit pilot flag", () => {
  for (const environment of ["production", "preview", "development", undefined]) {
    assert.equal(
      isAcademyPreviewEnabled({ VERCEL_ENV: environment, NODE_ENV: "production" }),
      false,
    )
  }
})

test("Academy allows only an explicitly flagged Vercel Preview deployment", () => {
  assert.equal(
    isAcademyPreviewEnabled({
      AMS_ACADEMY_PREVIEW_ENABLED: "true",
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
    }),
    true,
  )
  for (const environment of ["production", "development", "staging", ""]) {
    assert.equal(
      isAcademyPreviewEnabled({
        AMS_ACADEMY_PREVIEW_ENABLED: "true",
        VERCEL_ENV: environment,
        NODE_ENV: "production",
      }),
      false,
      `Unexpected Academy access when VERCEL_ENV=${environment}`,
    )
  }
})

test("Even an accidental development NODE_ENV cannot open Academy on Vercel Production", () => {
  assert.equal(
    isAcademyPreviewEnabled({
      AMS_ACADEMY_PREVIEW_ENABLED: "true",
      VERCEL_ENV: "production",
      NODE_ENV: "development",
    }),
    false,
  )
})

test("Local development requires the explicit flag and no Vercel environment", () => {
  assert.equal(isAcademyPreviewEnabled({ NODE_ENV: "development" }), false)
  assert.equal(
    isAcademyPreviewEnabled({
      AMS_ACADEMY_PREVIEW_ENABLED: "true",
      NODE_ENV: "development",
    }),
    true,
  )
  assert.equal(
    isAcademyPreviewEnabled({
      AMS_ACADEMY_PREVIEW_ENABLED: "TRUE",
      NODE_ENV: "development",
    }),
    false,
  )
})
