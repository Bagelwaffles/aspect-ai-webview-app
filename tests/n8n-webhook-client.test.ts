import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import test from "node:test"

import {
  redactAmsN8nLogData,
  sendAmsN8nWebhook,
} from "../lib/server/ams-n8n-webhook-client"

const webhookUrl = "https://aspectmarketingsolutions.app.n8n.cloud/webhook/ams-orchestrator"
const webhookSecret = "test-rotated-secret-000000000000000000000000000000"

test("n8n webhook client signs requests without N8N_API_KEY", async () => {
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
      webhookSecret,
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
  const rawBody = String(calls[0].init.body)
  const expectedSignature =
    "sha256=" +
    createHmac("sha256", webhookSecret)
      .update(`${headers.get("x-ams-timestamp")}.${rawBody}`, "utf8")
      .digest("hex")

  assert.equal(headers.get("x-ams-timestamp"), "2026-08-04T22:00:00.000Z")
  assert.equal(headers.get("x-request-id"), "req-fixed")
  assert.equal(headers.get("idempotency-key"), "idem-fixed")
  assert.equal(headers.get("x-ams-signature"), expectedSignature)
  assert.equal(headers.has("authorization"), false)
  assert.equal(JSON.stringify(calls[0]).includes("N8N_API_KEY"), false)
})

test("n8n webhook client rejects missing or unsafe rotated secret before network work", async () => {
  let called = false

  await assert.rejects(
    () =>
      sendAmsN8nWebhook(
        { action: "status.ping" },
        {
          webhookUrl,
          webhookSecret: "placeholder",
          fetchImpl: (async () => {
            called = true
            return Response.json({ ok: true })
          }) as typeof fetch,
        },
      ),
    /AMS_N8N_WEBHOOK_SECRET must be rotated/u,
  )

  assert.equal(called, false)
})

test("n8n webhook client returns sanitized downstream failure", async () => {
  const response = await sendAmsN8nWebhook(
    {
      action: "unknown.action",
      requestId: "req-failed",
      idempotencyKey: "idem-failed",
    },
    {
      webhookUrl,
      webhookSecret,
      fetchImpl: (async () =>
        Response.json(
          {
            ok: false,
            error: {
              code: "UNKNOWN_ACTION",
              message: "Secret details must not be forwarded",
              signature: "should-not-return",
            },
          },
          { status: 400 },
        )) as typeof fetch,
    },
  )

  assert.equal(response.ok, false)
  assert.equal(response.status, "failed")
  assert.equal(response.error?.code, "UNKNOWN_ACTION")
  assert.equal(JSON.stringify(response).includes("should-not-return"), false)
})

test("n8n log redaction removes signatures, secrets, tokens, authorization, and private fields", () => {
  const redacted = redactAmsN8nLogData({
    authorization: "Bearer abc",
    x_ams_signature: "sha256=abc",
    webhookSecret: "secret",
    nested: {
      token: "token-secret-value",
      privatePayload: "sensitive-private-value",
      safe: "visible",
    },
  })

  const text = JSON.stringify(redacted)
  assert.equal(text.includes("Bearer abc"), false)
  assert.equal(text.includes("sha256=abc"), false)
  assert.equal(text.includes("secret"), false)
  assert.equal(text.includes("token-secret-value"), false)
  assert.equal(text.includes("sensitive-private-value"), false)
  assert.equal(text.includes("visible"), true)
})
