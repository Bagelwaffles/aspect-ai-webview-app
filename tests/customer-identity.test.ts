import assert from "node:assert/strict"
import test from "node:test"

import type { Session } from "next-auth"
import type { NextRequest } from "next/server"

import {
  authOptions,
  customerSubjectFromProviderSubject,
  isStableCustomerSubject,
} from "../lib/auth"
import {
  authorizeCustomerApiRequest,
  authorizeInternalApiRequest,
  customerPrincipalFromSession,
} from "../lib/server/customer-api-auth"

const PROVIDER_SUBJECT = "google-provider-subject-123"

function sessionFor(providerSubject = PROVIDER_SUBJECT, email = "Owner@Example.COM"): Session {
  return {
    expires: "2026-09-01T00:00:00.000Z",
    user: {
      email,
      customerSubject: customerSubjectFromProviderSubject(providerSubject) ?? undefined,
    },
  }
}

test("derives an opaque stable customer subject from the provider subject", () => {
  const first = customerSubjectFromProviderSubject(PROVIDER_SUBJECT)
  const replay = customerSubjectFromProviderSubject(` ${PROVIDER_SUBJECT} `)
  const other = customerSubjectFromProviderSubject("different-provider-subject")

  assert.ok(first)
  assert.equal(first, replay)
  assert.notEqual(first, other)
  assert.equal(first.includes(PROVIDER_SUBJECT), false)
  assert.equal(isStableCustomerSubject(first), true)
  assert.equal(customerSubjectFromProviderSubject(""), null)
})

test("NextAuth callbacks derive the session subject from signed JWT sub", async () => {
  const jwtCallback = authOptions.callbacks?.jwt
  const sessionCallback = authOptions.callbacks?.session
  assert.ok(jwtCallback)
  assert.ok(sessionCallback)

  const token = await jwtCallback({ token: { sub: PROVIDER_SUBJECT } } as never)
  const expectedSubject = customerSubjectFromProviderSubject(PROVIDER_SUBJECT)
  assert.equal(token.customerSubject, expectedSubject)

  const session = await sessionCallback({
    session: {
      expires: "2026-09-01T00:00:00.000Z",
      user: { email: "Owner@Example.COM" },
    },
    token: { sub: PROVIDER_SUBJECT, email: "Owner@Example.COM" },
  } as never)

  const sessionUser = session.user as
    | { customerSubject?: string; email?: string | null }
    | undefined
  assert.equal(sessionUser?.customerSubject, expectedSubject)
  assert.equal(sessionUser?.email, "owner@example.com")
})

test("customer principal uses stable subject and email only as billing lookup", () => {
  const principal = customerPrincipalFromSession(sessionFor())

  assert.ok(principal)
  assert.equal(principal.kind, "customer")
  assert.equal(principal.subject, customerSubjectFromProviderSubject(PROVIDER_SUBJECT))
  assert.equal(principal.billingEmail, "owner@example.com")
  assert.equal(principal.email, principal.billingEmail)

  const missingSubject: Session = {
    expires: "2026-09-01T00:00:00.000Z",
    user: { email: "owner@example.com" },
  }
  assert.equal(customerPrincipalFromSession(missingSubject), null)
})

test("internal bearer credentials cannot impersonate a customer session", async () => {
  const previousKey = process.env.AMS_INTERNAL_API_KEY
  process.env.AMS_INTERNAL_API_KEY = "test-internal-key"

  try {
    const request = {
      headers: new Headers({ authorization: "Bearer test-internal-key" }),
    } as NextRequest

    const customer = await authorizeCustomerApiRequest(request, {
      isConfigured: () => true,
      getSession: async () => null,
    })
    const internal = authorizeInternalApiRequest(request)

    assert.equal(customer, null)
    assert.deepEqual(internal, { kind: "internal", subject: "internal-api" })
  } finally {
    if (previousKey === undefined) {
      delete process.env.AMS_INTERNAL_API_KEY
    } else {
      process.env.AMS_INTERNAL_API_KEY = previousKey
    }
  }
})

test("customer authorization fails closed when session storage errors", async () => {
  const request = { headers: new Headers() } as NextRequest
  const principal = await authorizeCustomerApiRequest(request, {
    isConfigured: () => true,
    getSession: async () => {
      throw new Error("simulated session outage")
    },
  })

  assert.equal(principal, null)
})
