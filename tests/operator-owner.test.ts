import assert from "node:assert/strict"
import test from "node:test"

import {
  configuredOperatorOwnerEmail,
  isOperatorOwnerEmail,
  normalizeOperatorEmail,
} from "../lib/operator-owner"

function withOwnerEnvironment(
  values: { AMS_OWNER_EMAIL?: string; INTERNAL_ADMIN_EMAIL?: string },
  callback: () => void,
) {
  const previousOwner = process.env.AMS_OWNER_EMAIL
  const previousInternal = process.env.INTERNAL_ADMIN_EMAIL

  if (values.AMS_OWNER_EMAIL === undefined) delete process.env.AMS_OWNER_EMAIL
  else process.env.AMS_OWNER_EMAIL = values.AMS_OWNER_EMAIL

  if (values.INTERNAL_ADMIN_EMAIL === undefined) delete process.env.INTERNAL_ADMIN_EMAIL
  else process.env.INTERNAL_ADMIN_EMAIL = values.INTERNAL_ADMIN_EMAIL

  try {
    callback()
  } finally {
    if (previousOwner === undefined) delete process.env.AMS_OWNER_EMAIL
    else process.env.AMS_OWNER_EMAIL = previousOwner

    if (previousInternal === undefined) delete process.env.INTERNAL_ADMIN_EMAIL
    else process.env.INTERNAL_ADMIN_EMAIL = previousInternal
  }
}

test("operator owner email normalization is strict and case-insensitive", () => {
  assert.equal(normalizeOperatorEmail(" Owner@Example.COM "), "owner@example.com")
  assert.equal(normalizeOperatorEmail("not-an-email"), null)
  assert.equal(normalizeOperatorEmail(null), null)
})

test("AMS_OWNER_EMAIL takes precedence over legacy internal admin email", () => {
  withOwnerEnvironment(
    {
      AMS_OWNER_EMAIL: "owner@example.com",
      INTERNAL_ADMIN_EMAIL: "legacy@example.com",
    },
    () => {
      assert.equal(configuredOperatorOwnerEmail(), "owner@example.com")
      assert.equal(isOperatorOwnerEmail("OWNER@example.com"), true)
      assert.equal(isOperatorOwnerEmail("legacy@example.com"), false)
    },
  )
})

test("legacy internal admin email remains a compatibility fallback", () => {
  withOwnerEnvironment({ INTERNAL_ADMIN_EMAIL: "legacy@example.com" }, () => {
    assert.equal(configuredOperatorOwnerEmail(), "legacy@example.com")
    assert.equal(isOperatorOwnerEmail("legacy@example.com"), true)
  })
})

test("owner authorization fails closed when no owner email is configured", () => {
  withOwnerEnvironment({}, () => {
    assert.equal(configuredOperatorOwnerEmail(), null)
    assert.equal(isOperatorOwnerEmail("owner@example.com"), false)
  })
})
