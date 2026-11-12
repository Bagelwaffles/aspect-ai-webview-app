import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server"
import { handleReportingGet, handleReportingPost } from "../lib/server/operations-report-api"
import { REPORTING_PREVIEW_BRANCH } from "../lib/server/operations-report-store"
import type { OwnerAuthorizationResult } from "../lib/server/owner-api-auth"
import type { ReportEnvelope } from "../lib/operations/reporting"

const sha = "a".repeat(40)
const env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: REPORTING_PREVIEW_BRANCH, VERCEL_GIT_COMMIT_SHA: sha } as unknown as NodeJS.ProcessEnv
const authorize = async (): Promise<OwnerAuthorizationResult> => ({ ok: true, principal: { kind: "customer", subject: "synthetic-owner", billingEmail: "owner@example.invalid", email: "owner@example.invalid" } })
function body() { return { specialistId: "engineering", reviewedAgainstRepoSha: sha, attestations: { publicOnly: true, noSensitiveData: true, sourceReviewed: true }, report: { synthetic: true } } }
function request(payload: unknown = body(), raw = false) { return new NextRequest("https://preview.example.org/api/internal/operations/reports", { method: "POST", headers: { origin: "https://preview.example.org", "content-type": "application/json" }, body: raw ? String(payload) : JSON.stringify(payload) }) }
function get() { return new NextRequest("https://preview.example.org/api/internal/operations/reports") }
const neverSave = async (): Promise<never> => { assert.fail("Persistence must not be called") }
const neverRead = async (): Promise<never> => { assert.fail("Read must not be called") }

test("production and other branches reject before authentication or persistence", async () => {
  const forbiddenAuth = async (): Promise<never> => assert.fail("Auth must not run outside exact Preview branch")
  for (const bad of [{ ...env, VERCEL_ENV: "production" }, { ...env, VERCEL_ENV: "development" }, { ...env, VERCEL_GIT_COMMIT_REF: "main" }, { ...env, VERCEL_GIT_COMMIT_REF: REPORTING_PREVIEW_BRANCH + "-other" }]) {
    const deps = { env: bad, authorize: forbiddenAuth, read: neverRead, save: neverSave }
    assert.equal((await handleReportingPost(request(), deps)).status, 404)
    assert.equal((await handleReportingGet(get(), deps)).status, 404)
  }
})
test("owner denial stops both read and write; POST requires trusted origin", async () => {
  const denied = async (): Promise<OwnerAuthorizationResult> => ({ ok: false, status: 401, code: "OWNER_SESSION_REQUIRED" })
  for (const response of [await handleReportingGet(get(), { env, authorize: denied, read: neverRead }), await handleReportingPost(request(), { env, authorize: denied, save: neverSave })]) {
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { code: "OWNER_SESSION_REQUIRED" })
  }
  let checked = false
  const response = await handleReportingPost(request(), { env, save: neverSave, authorize: async (_request, options) => {
    checked = true
    assert.equal(options?.requireTrustedOrigin, true)
    assert.equal(options?.env, env)
    return { ok: false, status: 403, code: "UNTRUSTED_ORIGIN" }
  } })
  assert.equal(checked, true); assert.equal(response.status, 403)
})
test("POST requires exact full deployment SHA, configured on server", async () => {
  for (const reviewedAgainstRepoSha of ["b".repeat(40), sha.slice(0, 7), sha.toUpperCase(), ""]) {
    const response = await handleReportingPost(request({ ...body(), reviewedAgainstRepoSha }), { env, authorize, save: neverSave })
    assert.equal(response.status, reviewedAgainstRepoSha === "b".repeat(40) ? 409 : 400)
  }
  const response = await handleReportingPost(request(), { env: { ...env, VERCEL_GIT_COMMIT_SHA: undefined }, authorize, save: neverSave })
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { code: "REPORTING_COMMIT_MISMATCH" })
})
test("malformed JSON, unknown lanes, missing attestations and extra envelope fields are rejected", async () => {
  const malformed = await handleReportingPost(request("{broken", true), { env, authorize, save: neverSave })
  assert.equal(malformed.status, 400); assert.deepEqual(await malformed.json(), { code: "REPORTING_INVALID_JSON" })
  for (const payload of [null, [], {}, { ...body(), specialistId: "unknown" }, { ...body(), attestations: { publicOnly: true, noSensitiveData: false, sourceReviewed: true } }, { ...body(), approvalGranted: true }, { ...body(), attestations: { ...body().attestations, granted: true } }]) {
    const response = await handleReportingPost(request(payload), { env, authorize, save: neverSave })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { code: "REPORTING_PAYLOAD_INVALID" })
  }
})
test("payload cap counts UTF-8 bytes, not characters", async () => {
  for (const raw of ["x".repeat(16385), JSON.stringify({ ...body(), report: "é".repeat(9000) })]) {
    const response = await handleReportingPost(request(raw, true), { env, authorize, save: neverSave })
    assert.equal(response.status, 413)
    assert.deepEqual(await response.json(), { code: "REPORTING_PAYLOAD_TOO_LARGE" })
  }
})
test("store validation/conflict map to 400/409; uncertain errors return replay guidance without secret details", async () => {
  for (const [error, status, code] of [[new Error("REPORTING_PAYLOAD_INVALID"), 400, "REPORTING_PAYLOAD_INVALID"], [new Error("REPORTING_IDENTITY_CONFLICT"), 409, "REPORTING_IDENTITY_CONFLICT"], [new Error("private dependency details"), 503, "REPORTING_STORE_UNAVAILABLE"], ["non-Error failure", 503, "REPORTING_STORE_UNAVAILABLE"]] as const) {
    const response = await handleReportingPost(request(), { env, authorize, save: async () => { throw error } })
    const result = await response.json()
    assert.equal(response.status, status); assert.equal(result.code, code)
    if (status === 503) assert.match(result.outcome, /unknown; read back or replay the identical report/)
    assert.ok(!JSON.stringify(result).includes("private dependency details"))
  }
})
test("an unrecognized storage response returns 503 with unknown-outcome guidance rather than 409", async () => {
  const response = await handleReportingPost(request(), { env, authorize, save: async () => { throw new Error("REPORTING_STORE_RESPONSE_INVALID") } })
  assert.equal(response.status, 503)
  const result = await response.json()
  assert.equal(result.code, "REPORTING_STORE_UNAVAILABLE")
  assert.match(result.outcome, /unknown; read back or replay the identical report/)
})

test("successful creation and replay remain inert, owner-only and uncached", async () => {
  for (const created of [true, false]) {
    const response = await handleReportingPost(request(), { env, authorize, save: async (lane, report, options) => {
      assert.equal(lane, "engineering"); assert.deepEqual(report, body().report); assert.equal(options?.env, env)
      return { created, report: { reportId: "synthetic" } as ReportEnvelope }
    } })
    assert.equal(response.status, created ? 201 : 200)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.equal(response.headers.get("x-content-type-options"), "nosniff")
    const result = await response.json()
    assert.equal(result.mayExecute, false); assert.equal(result.approvalGranted, false); assert.equal(result.sourceAuthenticityMachineVerified, false)
  }
})
test("GET distinguishes empty available history from unavailable or not configured, never claims automatic transport", async () => {
  for (const state of ["available", "unknown", "not_configured", "unavailable"] as const) {
    const response = await handleReportingGet(get(), { env, authorize, read: async () => ({ state, data: state === "available" ? [] : null, checkedAt: "2026-11-12T12:00:00.000Z", error: state === "available" ? null : "REPORTING_READ_FAILED" }) })
    assert.equal(response.status, state === "available" ? 200 : 503)
    const result = await response.json()
    assert.equal(result.state, state); assert.equal(result.automaticTransportVerified, false); assert.equal(result.sourceAuthenticityMachineVerified, false); assert.equal(result.mayExecute, false)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
  }
})

test("oversized declared body is rejected without reading and streaming bodies are cancelled at cap", async () => {
  const declared = new NextRequest("https://preview.example.org/api/internal/operations/reports", { method: "POST", headers: { "content-length": "20000" }, body: "{}" })
  assert.equal((await handleReportingPost(declared, { env, authorize, save: neverSave })).status, 413)
  let cancelled = false
  let pulls = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(9000).fill(32)) },
    cancel() { cancelled = true },
  })
  const streamed = new NextRequest("https://preview.example.org/api/internal/operations/reports", { method: "POST", body: stream })
  assert.equal((await handleReportingPost(streamed, { env, authorize, save: neverSave })).status, 413)
  assert.equal(cancelled, true)
  assert.ok(pulls < 5)
})
