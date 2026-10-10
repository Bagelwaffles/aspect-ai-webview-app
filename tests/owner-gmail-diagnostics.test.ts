import test from "node:test"
import assert from "node:assert/strict"
import { gmailFailureDiagnostic, gmailProviderFailure } from "../lib/server/owner-gmail-diagnostics"

test("Gmail diagnostics retain only status, operation and allowlisted provider reasons", async t => {
  const logs: unknown[][] = []
  t.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args) })
  const privateText = "PRIVATE token=secret owner@example.com message content"
  for (const [reason, category] of [["accessNotConfigured", "api-configuration"], ["insufficientPermissions", "permissions"], ["authError", "authentication"], ["userRateLimitExceeded", "quota"]]) {
    const failure = await gmailProviderFailure(Response.json({ error: {
      message: privateText, errors: [{ reason, message: privateText, location: privateText }], metadata: privateText,
    } }, { status: 403 }), "send", "GMAIL_SEND_UNCONFIRMED")
    assert.equal(failure.message, "GMAIL_SEND_UNCONFIRMED")
    assert.deepEqual(gmailFailureDiagnostic(failure), { operation: "send", httpStatus: 403, reason, category })
    assert.ok(!JSON.stringify(failure).includes(privateText))
  }
  const rpc = await gmailProviderFailure(Response.json({ error: { details: [
    { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "SERVICE_DISABLED", metadata: { consumer: privateText } },
  ] } }, { status: 403 }), "receipt", "GMAIL_RECEIPT_UNAVAILABLE")
  assert.deepEqual(gmailFailureDiagnostic(rpc), { operation: "receipt", httpStatus: 403, reason: "SERVICE_DISABLED", category: "api-configuration" })
  assert.ok(!JSON.stringify(logs).includes("PRIVATE"))
  assert.ok(!JSON.stringify(logs).includes("owner@example.com"))
})
test("unknown, malformed and oversized provider responses remain private", async t => {
  const logs: unknown[][] = []
  t.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args) })
  for (const response of [
    Response.json({ error: { errors: [{ reason: "PRIVATE_SECRET" }], message: "PRIVATE_SECRET" } }, { status: 401 }),
    Response.json({ error: { errors: [{ reason: "__proto__" }] } }, { status: 401 }),
    Response.json({ error: { errors: [{ reason: "toString" }] } }, { status: 401 }),
    new Response("PRIVATE_SECRET non-json", { status: 401 }),
    Response.json({ error: { message: "PRIVATE_SECRET".repeat(2000), errors: [{ reason: "authError" }] } }, { status: 401 }),
  ]) {
    const error = await gmailProviderFailure(response, "send", "GMAIL_SEND_UNCONFIRMED")
    assert.deepEqual(gmailFailureDiagnostic(error), { operation: "send", httpStatus: 401, reason: "unknown", category: "unknown" })
  }
  assert.equal(gmailFailureDiagnostic(new Error("PRIVATE_SECRET")), undefined)
  assert.equal(gmailFailureDiagnostic({ diagnostic: { httpStatus: 403, reason: "PRIVATE_SECRET" } }), undefined)
  assert.ok(!JSON.stringify(logs).includes("PRIVATE_SECRET"))
})
test("token diagnostic reasons preserve existing revocation and configuration classification", async t => {
  t.mock.method(console, "warn", () => {})
  for (const [reason, code] of [["invalid_grant", "GMAIL_REAUTHORIZE_REQUIRED"], ["invalid_client", "GMAIL_CONFIG_REQUIRED"], ["unauthorized_client", "GMAIL_CONFIG_REQUIRED"], ["temporarily_unavailable", "GMAIL_TOKEN_UNAVAILABLE"]]) {
    const error = await gmailProviderFailure(Response.json({ error: reason, error_description: "PRIVATE_SECRET" }, { status: 400 }), "token", "GMAIL_TOKEN_UNAVAILABLE")
    assert.equal(error.message, code)
    assert.equal(gmailFailureDiagnostic(error)?.reason, reason)
    assert.equal(gmailFailureDiagnostic(error)?.httpStatus, 400)
  }
})
