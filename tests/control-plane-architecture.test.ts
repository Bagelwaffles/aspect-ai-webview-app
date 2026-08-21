import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

async function exists(url: URL) {
  try {
    await access(url)
    return true
  } catch {
    return false
  }
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
