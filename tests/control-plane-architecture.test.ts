import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

import { NextRequest } from "next/server"

import { GET as getAgent } from "../app/api/agents/[id]/route"
import { GET as getAgents } from "../app/api/agents/route"
import { GET as getDeployment } from "../app/api/deployments/[id]/route"
import { GET as getDeployments } from "../app/api/deployments/route"

const previousInternalKey = process.env.AMS_INTERNAL_API_KEY

test.after(() => {
  if (previousInternalKey === undefined) {
    delete process.env.AMS_INTERNAL_API_KEY
  } else {
    process.env.AMS_INTERNAL_API_KEY = previousInternalKey
  }
})

async function exists(url: URL) {
  try {
    await access(url)
    return true
  } catch {
    return false
  }
}

function request(path: string, authorized = false) {
  return new NextRequest(`http://localhost${path}`, {
    headers: authorized ? { authorization: "Bearer focused-control-plane-key" } : undefined,
  })
}

test("legacy Grok metadata cannot act as an in-memory production backend", async () => {
  const source = await readFile(new URL("../lib/grok-agents.ts", import.meta.url), "utf8")

  for (const forbidden of [
    "new Map",
    "createAgent(",
    "updateAgent(",
    "deleteAgent(",
    "generateResponse(",
    "streamResponse(",
    "generateText(",
    "streamText(",
    '@ai-sdk/xai',
  ]) {
    assert.equal(source.includes(forbidden), false, `virtual backend primitive present: ${forbidden}`)
  }

  assert.match(source, /static launch metadata|read-only compatibility facade/i)
  assert.match(source, /not a database/i)
})

test("generic agent and deployment reads are internal-only and remain honest", async () => {
  process.env.AMS_INTERNAL_API_KEY = "focused-control-plane-key"

  const anonymousResponses = await Promise.all([
    getAgents(request("/api/agents")),
    getAgent(request("/api/agents/missing"), { params: Promise.resolve({ id: "missing" }) }),
    getDeployments(request("/api/deployments")),
    getDeployment(request("/api/deployments/missing")),
  ])

  for (const response of anonymousResponses) {
    assert.equal(response.status, 401)
    assert.equal((await response.json()).code, "INTERNAL_API_AUTH_REQUIRED")
  }

  const agents = await getAgents(request("/api/agents", true))
  assert.equal(agents.status, 200)
  const agentsBody = await agents.json()
  assert.deepEqual(agentsBody.agents, [])
  assert.equal(agentsBody.status, "not_configured")
  assert.equal(agentsBody.source, "persistent_agent_store")

  const agent = await getAgent(
    request("/api/agents/missing", true),
    { params: Promise.resolve({ id: "missing" }) },
  )
  assert.equal(agent.status, 404)
  assert.equal((await agent.json()).code, "AGENT_NOT_FOUND")

  const deployments = await getDeployments(request("/api/deployments", true))
  assert.equal(deployments.status, 200)
  const deploymentsBody = await deployments.json()
  assert.deepEqual(deploymentsBody.deployments, [])
  assert.equal(deploymentsBody.status, "not_configured")
  assert.equal(deploymentsBody.source, "persistent_deployment_store")

  const deployment = await getDeployment(request("/api/deployments/missing", true))
  assert.equal(deployment.status, 404)
  assert.equal((await deployment.json()).code, "DEPLOYMENT_NOT_FOUND")
})

test("unimplemented agent surfaces remain fail-closed", async () => {
  const [agents, deploy, relevance, aiChat, grokChat] = await Promise.all([
    readFile(new URL("../app/api/agents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agents/deploy/route.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/relevance/agents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/grok/chat/route.ts", import.meta.url), "utf8"),
  ])

  assert.match(agents, /AGENT_STORE_NOT_CONFIGURED/)
  assert.match(deploy, /NOT_IMPLEMENTED/)
  assert.match(relevance, /NOT_IMPLEMENTED/)
  assert.match(aiChat, /LEGACY_AI_ROUTE_DISABLED/)
  assert.match(grokChat, /LEGACY_AI_ROUTE_DISABLED/)
})

test("repository does not contain an active Cloudflare Worker control plane", async () => {
  assert.equal(await exists(new URL("../wrangler.toml", import.meta.url)), false)
  assert.equal(await exists(new URL("../wrangler.json", import.meta.url)), false)
  assert.equal(await exists(new URL("../wrangler.jsonc", import.meta.url)), false)

  const decision = await readFile(new URL("../docs/AMS_CONTROL_PLANE.md", import.meta.url), "utf8")
  assert.match(decision, /Vercel-hosted Next\.js application.*control plane/i)
  assert.match(decision, /ams-api-gateway.*retired\/orphaned infrastructure/i)
  assert.match(decision, /must never be presented as durable/i)
})
