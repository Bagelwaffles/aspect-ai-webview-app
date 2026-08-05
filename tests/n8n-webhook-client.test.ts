import assert from "node:assert/strict"
import test, { afterEach } from "node:test"

import { NextRequest } from "next/server"

import { POST } from "../app/api/internal/n8n/orchestrator/route"
import {
  AmsN8nWebhookClientError,
  redactAmsN8nLogData,
  sendAmsN8nWebhook,
  type AmsN8nIdempotencyStore,
  type AmsN8nWebhookResponse,
} from "../lib/server/ams-n8n-webhook-client"
import type { CustomerApiPrincipal } from "../lib/server/customer-api-auth"

const webhookUrl = "https://aspectmarketingsolutions.app.n8n.cloud/webhook/ams-orchestrator"
const internalKey = "test-rotated-header-auth-key-000000000000000000"

type TestGlobals = typeof globalThis & {
  __amsN8nGatewayTestDependencies?: Record<string, unknown>
}

class MemoryN8nIdempotencyStore implements AmsN8nIdempotencyStore {
  readonly entries = new Map<
    string,
    { requestHash: string; requestId: string; response?: AmsN8nWebhookResponse }
  >()

  async reserve(input: {
    key: string
    requestHash: string
    ttlSeconds: number
    requestId: string
  }) {
    const existing = this.entries.get(input.key)
    if (!existing) {
      this.entries.set(input.key, {
        requestHash: input.requestHash,
        requestId: input.requestId,
      })
      return { status: "reserved" as const }
    }

    if (existing.requestHash !== input.requestHash) return { status: "conflict" as const }
    return { status: "duplicate" as const, response: existing.response }
  }

  async complete(input: {
    key: string
    response: AmsN8nWebhookResponse
    ttlSeconds: number
  }) {
    const existing = this.entries.get(input.key)
    this.entries.set(input.key, {
      requestHash: existing?.requestHash ?? "unknown",
      requestId: input.response.request_id,
      response: input.response,
    })
  }
}

function customer(): CustomerApiPrincipal {
  return {
    kind: "customer",
    subject: "cus_sub_test_customer",
    billingEmail: "owner@example.com",
    email: "owner@example.com",
  }
}

function request(body: unknown, headers?: HeadersInit) {
  return new NextRequest("https://aspectmarketingsolutions.app/api/internal/n8n/orchestrator", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

afterEach(() => {
  delete (globalThis as TestGlobals).__amsN8nGatewayTestDependencies
})

test("n8n webhook client uses Header Auth and does not expose browser-facing credentials", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return Response.json({
      ok: true,
      request_id: "req-fixed",
      action: "status.ping",
      result: { accepted: true },
    })
  }

  const result = await sendAmsN8nWebhook(
    {
      action: "status.ping",
      payload: { hello: "world" },
      requestId: "req-fixed",
      idempotencyKey: "idem-fixed",
    },
    {
      webhookUrl,
      internalKey,
      appUrl: "https://aspectmarketingsolutions.app",
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-08-04T22:00:00.000Z"),
      idFactory: () => "unused",
    },
  )

  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, webhookUrl)

  const headers = new Headers(calls[0].init.headers)
  assert.equal(headers.get("x-ams-internal-key"), internalKey)
  assert.equal(headers.get("x-request-id"), "req-fixed")
  assert.equal(headers.get("idempotency-key"), "idem-fixed")
  assert.equal(headers.has("authorization"), false)
  assert.equal(headers.has("x-ams-signature"), false)
  assert.equal(JSON.stringify(calls[0]).includes("N8N_API_KEY"), false)
})

test("n8n webhook client rejects missing or unsafe internal key before network work", async () => {
  let called = false

  await assert.rejects(
    () =>
      sendAmsN8nWebhook(
        { action: "status.ping" },
        {
          webhookUrl,
          internalKey: "placeholder",
          fetchImpl: (async () => {
            called = true
            return Response.json({ ok: true })
          }) as typeof fetch,
        },
      ),
    /AMS_N8N_INTERNAL_KEY must be rotated/u,
  )

  assert.equal(called, false)
})

test("wrong n8n Header Auth value returns sanitized rejection", async () => {
  const response = await sendAmsN8nWebhook(
    {
      action: "status.ping",
      requestId: "req-wrong-key",
      idempotencyKey: "idem-wrong-key",
    },
    {
      webhookUrl,
      internalKey,
      fetchImpl: (async () =>
        Response.json(
          {
            ok: false,
            error: {
              code: "UNAUTHORIZED",
              message: "credential failed",
              x_ams_internal_key: "must-not-return",
            },
          },
          { status: 401 },
        )) as typeof fetch,
    },
  )

  assert.equal(response.ok, false)
  assert.equal(response.error?.code, "UNAUTHORIZED")
  assert.equal(JSON.stringify(response).includes("must-not-return"), false)
})

test("correct n8n Header Auth value accepts structured JSON", async () => {
  const response = await sendAmsN8nWebhook(
    {
      action: "content.launch",
      requestId: "req-correct-key",
      idempotencyKey: "idem-correct-key",
    },
    {
      webhookUrl,
      internalKey,
      fetchImpl: (async (_url, init) => {
        assert.equal(new Headers(init?.headers).get("x-ams-internal-key"), internalKey)
        return Response.json({
          ok: true,
          request_id: "req-correct-key",
          action: "content.launch",
          result: { queued: true },
        })
      }) as typeof fetch,
    },
  )

  assert.equal(response.ok, true)
  assert.equal(response.status, "accepted")
})

test("n8n timeout returns sanitized 504 response", async () => {
  await assert.rejects(
    () =>
      sendAmsN8nWebhook(
        { action: "status.ping" },
        {
          webhookUrl,
          internalKey,
          timeoutMs: 1_000,
          fetchImpl: (async (_url, init) => {
            init?.signal?.dispatchEvent(new Event("abort"))
            throw Object.assign(new Error("aborted"), { name: "AbortError" })
          }) as typeof fetch,
        },
      ),
    (error) =>
      error instanceof AmsN8nWebhookClientError &&
      error.code === "N8N_WEBHOOK_TIMEOUT" &&
      error.status === 504,
  )
})

test("gateway rejects missing website authentication before calling n8n", async () => {
  let called = false
  ;(globalThis as TestGlobals).__amsN8nGatewayTestDependencies = {
    authorize: async () => null,
    sendWebhook: async () => {
      called = true
      return { ok: true, request_id: "x", action: "status.ping", status: "accepted" }
    },
  }

  const response = await POST(request({ action: "status.ping" }))
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.error.code, "AMS_AUTH_REQUIRED")
  assert.equal(called, false)
})

test("gateway rejects malformed payload and unsupported action before calling n8n", async () => {
  let called = false
  ;(globalThis as TestGlobals).__amsN8nGatewayTestDependencies = {
    authorize: async () => customer(),
    sendWebhook: async () => {
      called = true
      return { ok: true, request_id: "x", action: "status.ping", status: "accepted" }
    },
  }

  const malformed = await POST(request("{not-json"))
  assert.equal(malformed.status, 400)

  const unsupported = await POST(request({ action: "delete.everything", payload: {} }))
  assert.equal(unsupported.status, 400)
  assert.equal(called, false)
})

test("gateway reserves idempotency before n8n and duplicate request avoids downstream execution", async () => {
  const store = new MemoryN8nIdempotencyStore()
  let calls = 0
  ;(globalThis as TestGlobals).__amsN8nGatewayTestDependencies = {
    authorize: async () => customer(),
    rateLimit: async () => ({
      allowed: true,
      available: true,
      code: "OK",
      limit: 20,
      remaining: 19,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
      distributed: true,
    }),
    getIdempotencyStore: () => store,
    idFactory: () => "fixed-idempotency",
    sendWebhook: async () => {
      calls += 1
      return {
        ok: true,
        request_id: "fixed-idempotency",
        action: "status.ping",
        status: "accepted",
        result: { accepted: true },
      }
    },
  }

  const first = await POST(request({ action: "status.ping", payload: { hello: "world" } }))
  const second = await POST(request({ action: "status.ping", payload: { hello: "world" } }))

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(calls, 1)
  assert.equal((await second.json()).idempotent, true)
})

test("gateway returns sanitized n8n failure", async () => {
  ;(globalThis as TestGlobals).__amsN8nGatewayTestDependencies = {
    authorize: async () => customer(),
    rateLimit: async () => ({
      allowed: true,
      available: true,
      code: "OK",
      limit: 20,
      remaining: 19,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
      distributed: true,
    }),
    getIdempotencyStore: () => new MemoryN8nIdempotencyStore(),
    idFactory: () => "req-failure",
    sendWebhook: async () => ({
      ok: false,
      request_id: "req-failure",
      action: "status.ping",
      status: "failed",
      error: { code: "N8N_WEBHOOK_HTTP_500", message: "n8n webhook request failed" },
    }),
  }

  const response = await POST(request({ action: "status.ping" }))
  const body = await response.json()

  assert.equal(response.status, 502)
  assert.equal(body.error.message, "n8n webhook request failed")
})

test("n8n log redaction removes headers, secrets, tokens, authorization, and private fields", () => {
  const redacted = redactAmsN8nLogData({
    authorization: "Bearer abc",
    x_ams_internal_key: "secret-key",
    webhookSecret: "secret",
    nested: {
      token: "token-secret-value",
      privatePayload: "sensitive-private-value",
      safe: "visible",
    },
  })

  const text = JSON.stringify(redacted)
  assert.equal(text.includes("Bearer abc"), false)
  assert.equal(text.includes("secret-key"), false)
  assert.equal(text.includes("secret"), false)
  assert.equal(text.includes("token-secret-value"), false)
  assert.equal(text.includes("sensitive-private-value"), false)
  assert.equal(text.includes("visible"), true)
})
