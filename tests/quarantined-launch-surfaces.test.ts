import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { NextRequest } from "next/server"

import { POST as deployAgent } from "../app/api/agents/deploy/route"

const previousInternalKey = process.env.AMS_INTERNAL_API_KEY

test.after(() => {
  if (previousInternalKey === undefined) {
    delete process.env.AMS_INTERNAL_API_KEY
  } else {
    process.env.AMS_INTERNAL_API_KEY = previousInternalKey
  }
})

test("agent deployment requires internal authentication before returning not implemented", async () => {
  process.env.AMS_INTERNAL_API_KEY = "focused-test-key"

  const unauthenticated = await deployAgent(
    new NextRequest("http://localhost/api/agents/deploy", { method: "POST" }),
  )
  assert.equal(unauthenticated.status, 401)
  assert.equal((await unauthenticated.json()).code, "INTERNAL_API_AUTH_REQUIRED")

  const authenticated = await deployAgent(
    new NextRequest("http://localhost/api/agents/deploy", {
      method: "POST",
      headers: { authorization: "Bearer focused-test-key" },
    }),
  )
  assert.equal(authenticated.status, 501)
  assert.equal((await authenticated.json()).code, "NOT_IMPLEMENTED")
})

test("quarantined launch pages contain no fabricated operational claims or controls", async () => {
  const [analytics, deployments, billing] = await Promise.all([
    readFile(new URL("../app/analytics/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/deployments/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/billing/page.tsx", import.meta.url), "utf8"),
  ])

  for (const unsafeClaim of ["Live Revenue", "Avg Conversion Rate", "New Deployment", "Create Deployment"]) {
    assert.equal(`${analytics}\n${deployments}`.includes(unsafeClaim), false, unsafeClaim)
  }

  assert.match(analytics, /not currently have a verified analytics data source/i)
  assert.match(deployments, /deployment is not connected/i)
  assert.match(billing, /Content Agent is the first planned launch capability/i)
  assert.match(billing, /Outreach and Analytics are not available/i)
})
