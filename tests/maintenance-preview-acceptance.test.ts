import assert from "node:assert/strict"
import test from "node:test"

import {
  ACI_PREVIEW_ACCEPTANCE,
  runAciPreviewAcceptance,
} from "../lib/maintenance/preview-acceptance"

const fixedNow = () => new Date("2026-11-11T21:45:00.000Z")
const findingId = "f".repeat(40)
const ciVerifiedAt = "2026-11-11T21:46:00.000Z"

type Finding = {
  id: string
  origin: string
  sourceFingerprint: string
  state: string
  pr: null | { url: string; headSha: string; ciVerifiedAt: string | null }
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function acceptanceServer(options: {
  replayNew?: boolean
  attachedSha?: string
  finalState?: string
  authStatus?: number
  trustedOrigin?: boolean
} = {}) {
  let finding: Finding | null = null
  const calls: Array<{ method: string; body?: Record<string, unknown>; credentials?: RequestCredentials }> = []
  const fetcher: typeof fetch = async (input, init = {}) => {
    const method = init.method ?? "GET"
    const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined
    calls.push({ method, body, credentials: init.credentials })
    if (options.authStatus) {
      return response({ ok: false, code: "OWNER_SESSION_REQUIRED" }, options.authStatus)
    }
    if (body?.action === "diagnose_origin") {
      return response({
        ok: true,
        trustedOrigin: options.trustedOrigin ?? true,
        originDiagnostics: {
          requestOrigin: "https://preview.example.org",
          originHeaderOrigin: "https://preview.example.org",
          configuredOrigin: "https://preview.example.org",
          originHeaderMatchesConfigured: options.trustedOrigin ?? true,
        },
        readOnly: true,
      })
    }
    if (method === "GET") {
      return response({ ok: true, findings: finding ? [finding] : [] })
    }
    if (body?.action === "record_research") {
      const isNew = finding === null
      finding ??= {
        id: findingId,
        origin: "owner_research",
        sourceFingerprint: String(body.sourceFingerprint),
        state: "observed",
        pr: null,
      }
      return response({ ok: true, finding, new: isNew, executionPerformed: false })
    }
    if (body?.action === "attach_draft_pr") {
      if (!finding || body.findingId !== finding.id) {
        return response({ ok: false, code: "MAINTENANCE_FINDING_NOT_FOUND" }, 404)
      }
      finding = {
        ...finding,
        state: "draft_pr",
        pr: {
          url: ACI_PREVIEW_ACCEPTANCE.prUrl,
          headSha: options.attachedSha ?? ACI_PREVIEW_ACCEPTANCE.prHeadSha,
          ciVerifiedAt: null,
        },
      }
      return response({ ok: true, finding, executionPerformed: false })
    }
    if (body?.action === "verify_pr_checks") {
      if (!finding?.pr) return response({ ok: false, code: "MAINTENANCE_PR_NOT_RECORDED" }, 409)
      finding = {
        ...finding,
        state: options.finalState ?? "checks_passed",
        pr: { ...finding.pr, ciVerifiedAt },
      }
      return response({ ok: true, finding, productionReleaseAuthorized: false })
    }
    return response({ ok: false, code: "MAINTENANCE_ACTION_FORBIDDEN" }, 400)
  }
  return { fetcher, calls, getFinding: () => finding }
}

test("owner browser sequence records, reads, deduplicates, attaches exact Draft PR and verifies checks", async () => {
  const server = acceptanceServer()
  const steps: string[] = []
  const result = await runAciPreviewAcceptance({
    fetcher: server.fetcher,
    now: fixedNow,
    onStep: (step) => steps.push(step),
  })

  assert.equal(result.findingId, findingId)
  assert.equal(result.firstInsertNew, true)
  assert.equal(result.replayDuplicateConfirmed, true)
  assert.equal(result.finalState, "checks_passed")
  assert.equal(result.prUrl, ACI_PREVIEW_ACCEPTANCE.prUrl)
  assert.equal(result.prHeadSha, ACI_PREVIEW_ACCEPTANCE.prHeadSha)
  assert.equal(result.ciVerifiedAt, ciVerifiedAt)
  assert.equal(result.productionReleaseAuthorized, false)
  assert.deepEqual(steps, [
    "origin_preflight", "record", "readback", "replay", "dedupe_readback",
    "attach_pr", "verify_checks", "final_readback",
  ])
  assert.equal(server.calls.length, 8)
  assert.deepEqual(server.calls.map((call) => call.method), [
    "POST", "POST", "GET", "POST", "GET", "POST", "POST", "GET",
  ])
  assert.equal(server.calls.every((call) => call.credentials === "same-origin"), true)
  assert.deepEqual(server.calls.filter((call) => call.method === "POST").map((call) => call.body?.action), [
    "diagnose_origin", "record_research", "record_research", "attach_draft_pr", "verify_pr_checks",
  ])
  const first = server.calls[1].body!
  const replay = server.calls[3].body!
  assert.deepEqual(replay, first)
  assert.equal(first.sourceFingerprint, ACI_PREVIEW_ACCEPTANCE.findingFingerprint)
  assert.equal(first.evidenceUrl, ACI_PREVIEW_ACCEPTANCE.evidenceUrl)
  assert.equal(server.getFinding()?.state, "checks_passed")
})

test("a previously inserted finding is accepted only when replay confirms new=false", async () => {
  const server = acceptanceServer()
  await runAciPreviewAcceptance({ fetcher: server.fetcher, now: fixedNow })
  const second = await runAciPreviewAcceptance({ fetcher: server.fetcher, now: fixedNow })
  assert.equal(second.firstInsertNew, false)
  assert.equal(second.replayDuplicateConfirmed, true)
  assert.equal(server.getFinding()?.id, findingId)
})

test("untrusted origin diagnostic stops before the first persistence request", async () => {
  const server = acceptanceServer({ trustedOrigin: false })
  await assert.rejects(
    runAciPreviewAcceptance({ fetcher: server.fetcher, now: fixedNow }),
    /UNTRUSTED_ORIGIN:/u,
  )
  assert.equal(server.calls.length, 1)
  assert.equal(server.calls[0].body?.action, "diagnose_origin")
  assert.equal(server.getFinding(), null)
})

test("missing owner authentication stops before any persistence or later action", async () => {
  const server = acceptanceServer({ authStatus: 401 })
  await assert.rejects(
    runAciPreviewAcceptance({ fetcher: server.fetcher, now: fixedNow }),
    /OWNER_SESSION_REQUIRED/u,
  )
  assert.equal(server.calls.length, 1)
  assert.equal(server.getFinding(), null)
})

test("a replay that creates a second finding fails the deduplication acceptance gate", async () => {
  let count = 0
  const server = acceptanceServer()
  const fetcher: typeof fetch = async (input, init = {}) => {
    if (init.method === "POST" && typeof init.body === "string") {
      const body = JSON.parse(init.body) as Record<string, unknown>
      if (body.action === "record_research") {
        count++
        const result = await server.fetcher(input, init)
        if (count === 2) {
          const data = await result.json() as Record<string, unknown>
          return response({ ...data, new: true })
        }
        return result
      }
    }
    return server.fetcher(input, init)
  }
  await assert.rejects(
    runAciPreviewAcceptance({ fetcher, now: fixedNow }),
    /MAINTENANCE_DEDUPE_REPLAY_FAILED/u,
  )
})

test("an attached PR with a different head is rejected before check verification", async () => {
  const server = acceptanceServer({ attachedSha: "a".repeat(40) })
  await assert.rejects(
    runAciPreviewAcceptance({ fetcher: server.fetcher, now: fixedNow }),
    /MAINTENANCE_DRAFT_PR_ATTACHMENT_FAILED/u,
  )
  assert.equal(server.calls.some((call) => call.body?.action === "verify_pr_checks"), false)
})

test("a failed exact-head check cannot be reported as accepted", async () => {
  const server = acceptanceServer({ finalState: "draft_pr" })
  await assert.rejects(
    runAciPreviewAcceptance({ fetcher: server.fetcher, now: fixedNow }),
    /MAINTENANCE_EXACT_HEAD_CHECKS_FAILED/u,
  )
})

test("invalid clocks fail before the first API request", async () => {
  const server = acceptanceServer()
  await assert.rejects(
    runAciPreviewAcceptance({ fetcher: server.fetcher, now: () => new Date("invalid") }),
    /ACI_ACCEPTANCE_CLOCK_INVALID/u,
  )
  assert.equal(server.calls.length, 0)
})
