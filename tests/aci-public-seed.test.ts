import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { agents } from "../app/agents/agentCatalog"
import { assessPublicResearchCandidate } from "../lib/aci/research-evidence"
import { selectAciResearchReferences } from "../lib/aci/research-review"
import { prepareAciMaintenanceResearchHandoff } from "../lib/aci/maintenance-handoff"

const fixtureClock = new Date("2026-11-10T21:00:00.000Z")
const relativePath = "docs/aci/public-research-seed.v1.json"

function seed(): {
  version: number
  status: string
  purpose: string
  records: unknown[]
  productionApproved: boolean
} {
  return JSON.parse(readFileSync(relativePath, "utf8")) as ReturnType<typeof seed>
}

test("durable public research seed is limited to three non-executable source references", () => {
  const data=seed()
  assert.deepEqual(Object.keys(data).sort(), [
    "version", "status", "purpose", "records", "productionApproved",
  ].sort())
  assert.equal(data.version,1)
  assert.equal(data.status,"research_only_unverified")
  assert.equal(data.purpose,"source_controlled_reference_seed_no_execution")
  assert.equal(data.productionApproved,false)
  assert.equal(data.records.length,3)
  const source=readFileSync(relativePath,"utf8")
  for(const forbidden of ["ownerSubject","customerEmail","apiKey","accessToken","rawPrompt","rawOutput","trustedInstructions","mayExecute","privateKey"]) {
    assert.equal(source.includes('"' + forbidden + '"'),false,forbidden)
  }
})

test("each seeded entry is attributable, current at capture date, and scoped to an actual agent", () => {
  const data=seed()
  const catalog=new Set(agents.map(agent=>agent.slug))
  const fingerprints=new Set<string>()
  for(const raw of data.records) {
    const normalized=assessPublicResearchCandidate(raw,fixtureClock)
    assert.equal(normalized.accepted,true)
    if(!normalized.accepted) continue
    const record=normalized.record
    assert.equal(catalog.has(record.affectedAgentId),true)
    assert.match(record.baselineRepoSha,/^[a-f0-9]{40}$/)
    assert.ok(!fingerprints.has(record.fingerprint))
    fingerprints.add(record.fingerprint)
    assert.equal(record.verified,false)
    assert.equal(record.trustedInstructions,false)
    assert.equal(record.mayExecute,false)
    assert.equal(record.status,"research_only")
    const selected=selectAciResearchReferences({
      agentSlug:record.affectedAgentId,
      sourceRepoSha:record.baselineRepoSha,
      records:[record],
    },fixtureClock)
    assert.equal(selected.status,"research_only")
    assert.equal(selected.references.length,1)
    assert.equal(selected.references[0].mayExecute,false)
  }
})

test("real public research seed can prepare but cannot submit a Preview maintenance action", () => {
  const data=seed()
  for(const raw of data.records) {
    const normalized=assessPublicResearchCandidate(raw,fixtureClock)
    assert.equal(normalized.accepted,true)
    if(!normalized.accepted) continue
    const {affectedAgentId,baselineRepoSha}=normalized.record
    const result=prepareAciMaintenanceResearchHandoff({
      agentSlug:affectedAgentId,
      sourceRepoSha:baselineRepoSha,
      records:[normalized.record],
    },fixtureClock)
    assert.equal(result.status,"owner_submission_required")
    assert.equal(result.requests.length,1)
    assert.equal(result.submitted,false)
    assert.equal(result.redisWritten,false)
    assert.equal(result.productionAuthorized,false)
  }
})

test("the same 2026 public research becomes stale under later real-time checks", () => {
  const data=seed()
  const future=new Date("2026-12-12T21:00:00.000Z")
  for(const item of data.records) {
    const result=assessPublicResearchCandidate(item,future)
    assert.equal(result.accepted,false)
    if(!result.accepted) assert.ok(result.reasons.includes("STALE_OR_INVALID_RETRIEVAL"))
  }
})

test("tampering with stored source provenance fails normalization", () => {
  const data=seed()
  const raw=data.records[0] as Record<string,unknown>
  const clone=structuredClone(raw)
  ;(clone.source as Record<string,unknown>).url="http://localhost/private"
  const result=assessPublicResearchCandidate(clone,fixtureClock)
  assert.equal(result.accepted,false)
})
