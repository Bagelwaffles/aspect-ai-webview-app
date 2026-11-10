import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { handleAciReferenceGet } from "../app/api/internal/aci/references/route"

const sourceRepoSha = "d6e7f98720ef9d96ab89906e1828187b36048659"
const preview = { VERCEL_ENV: "preview" } as NodeJS.ProcessEnv
const production = { VERCEL_ENV: "production" } as NodeJS.ProcessEnv
const today = new Date("2026-11-10T21:00:00.000Z")
const future = new Date("2026-12-12T21:00:00.000Z")

const owner = async () => ({
  ok: true as const,
  principal: {
    kind: "customer" as const,
    subject: "ams-test-owner-principal",
    billingEmail: "only-a-test@example.invalid",
    email: "only-a-test@example.invalid",
  },
})
const denied = async () => ({
  ok: false as const,
  status: 401 as const,
  code: "OWNER_SESSION_REQUIRED" as const,
})

function request(query?: string) {
  const q = query ?? "agentSlug=research-agent&sourceRepoSha=" + sourceRepoSha
  return new NextRequest("https://preview.example.org/api/internal/aci/references?" + q)
}

test("Production returns 404 before consulting owner auth or opening references", async () => {
  let called = false
  const response = await handleAciReferenceGet(request(), {
    env: production, now: today, authorize: async () => {
      called = true
      return owner()
    },
  })
  assert.equal(response.status, 404)
  assert.equal(called, false)
  const body = await response.json()
  assert.equal(body.code, "ACI_PREVIEW_ONLY")
  assert.equal(response.headers.get("cache-control"),"no-store")
})

test("Preview reference access requires the existing authenticated owner principal", async () => {
  const response = await handleAciReferenceGet(request(), {
    env: preview, now: today, authorize: denied,
  })
  assert.equal(response.status, 401)
  assert.equal((await response.json()).code, "OWNER_SESSION_REQUIRED")
})

test("Preview owner can retrieve bounded, current research citations without raw claims", async () => {
  const response = await handleAciReferenceGet(request(), {
    env: preview, now: today, authorize: owner,
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  const data = await response.json()
  assert.equal(data.ok, true)
  assert.equal(data.status, "research_only")
  assert.equal(data.sourceControlled, true)
  assert.equal(data.sourceVerified, false)
  assert.equal(data.memoryRuntimeActive, false)
  assert.equal(data.productionApproved, false)
  assert.equal(data.references.length, 1)
  assert.equal(data.references[0].agentSlug,"research-agent")
  assert.equal(data.references[0].sourceRepoSha, sourceRepoSha)
  assert.equal(data.references[0].mayExecute,false)
  assert.equal(data.references[0].verified,false)
  const serialized=JSON.stringify(data)
  assert.equal(serialized.includes("claim"),false)
  assert.equal(serialized.includes("customerEmail"),false)
  assert.equal(serialized.includes("ownerSubject"),false)
})

test("different existing agents cannot see each other's source references", async () => {
  const agents = ["research-agent","aspect-overmind","technical-support-agent"]
  const sourceUrls: string[] = []
  for(const agentSlug of agents) {
    const response = await handleAciReferenceGet(request("agentSlug=" + agentSlug +
      "&sourceRepoSha=" + sourceRepoSha), { env: preview, now: today, authorize: owner })
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.references.length, 1)
    assert.equal(data.references[0].agentSlug,agentSlug)
    sourceUrls.push(data.references[0].sourceUrl)
  }
  assert.equal(new Set(sourceUrls).size, agents.length)
})

test("unknown agent and invalid version are denied", async () => {
  const unknown = await handleAciReferenceGet(
    request("agentSlug=fabricated-agent&sourceRepoSha=" + sourceRepoSha),
    { env: preview, now: today, authorize: owner },
  )
  assert.equal(unknown.status, 400)
  assert.equal((await unknown.json()).code,"ACI_UNKNOWN_AGENT")

  const invalid = await handleAciReferenceGet(
    request("agentSlug=research-agent&sourceRepoSha=guess"),
    { env: preview, now: today, authorize: owner },
  )
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).code, "ACI_INVALID_QUERY")
})

test("a valid agent with an unrelated commit receives no research references", async () => {
  const response=await handleAciReferenceGet(
    request("agentSlug=research-agent&sourceRepoSha="+"b".repeat(40)),
    {env:preview,now:today,authorize:owner},
  )
  assert.equal(response.status,200)
  const data=await response.json()
  assert.equal(data.status,"no_references")
  assert.deepEqual(data.references,[])
  assert.equal(data.productionApproved,false)
})

test("expired research fails closed instead of being treated as reusable truth", async () => {
  const response=await handleAciReferenceGet(request(),{
    env:preview,now:future,authorize:owner,
  })
  assert.equal(response.status,409)
  assert.equal((await response.json()).code,"ACI_RESEARCH_INVALID_OR_STALE")
})

test("unknown or duplicated query keys and invalid limits are rejected", async () => {
  const cases=[
    "agentSlug=research-agent&sourceRepoSha="+sourceRepoSha+"&token=private",
    "agentSlug=research-agent&agentSlug=research-agent&sourceRepoSha="+sourceRepoSha,
    "agentSlug=research-agent&sourceRepoSha="+sourceRepoSha+"&maxReferences=0",
    "agentSlug=research-agent&sourceRepoSha="+sourceRepoSha+"&maxReferences=6",
    "agentSlug=research-agent&sourceRepoSha="+sourceRepoSha+"&maxReferences=01",
  ]
  for(const query of cases) {
    const response=await handleAciReferenceGet(request(query),{
      env:preview,now:today,authorize:owner,
    })
    assert.equal(response.status,400,query)
  }
})

test("malformed evaluation clock cannot make outdated references appear fresh", async () => {
  const response=await handleAciReferenceGet(request(),{
    env:preview,now:new Date("invalid"),authorize:owner,
  })
  assert.equal(response.status,503)
  assert.equal((await response.json()).code,"ACI_INVALID_CLOCK")
})
