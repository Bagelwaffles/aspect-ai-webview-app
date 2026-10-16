import test from "node:test"
import assert from "node:assert/strict"
import { readableSource, runIntelligence, validateIntelligenceFindings, intelligenceSources } from "../lib/server/scheduled-task-workers"
import { initialTaskState, scheduledTaskDefinitions } from "../lib/server/scheduled-task-engine"
const now = new Date("2026-10-06T13:00:00Z")
const state = initialTaskState(scheduledTaskDefinitions[0], "owner", now)
const finding = { sourceId: "v0", publicationDate: "2026-10-05", dateEvidence: "October 5, 2026", evidence: "A new official agent API is now available.", whatChanged: "Agent API launch", whyAMS: "Could improve AMS agent workflows", opportunity: "Evaluate an isolated proof", costsAndLimits: "Pricing is unavailable in this source", competitiveImplications: "Inference: a broader agent platform competes with AMS", nextAction: "Read documentation before adopting", classification: "Understand" as const }
const source = { id: "v0", url: "https://v0.app/changelog", text: "October 5, 2026 A new official agent API is now available.", fingerprint: "snapshot-1", ok: true }
test("findings require source text and publication date evidence, not generated citations", () => {
  const accepted = validateIntelligenceFindings([finding], [source], state, now)
  assert.equal(accepted[0].originalSource, source.url)
  assert.throws(() => validateIntelligenceFindings([{ ...finding, evidence: "An invented feature never described in the original source" }], [source], state, now), /EVIDENCE_INVALID/u)
  assert.throws(() => validateIntelligenceFindings([{ ...finding, publicationDate: "2026-10-04" }], [source], state, now), /DATE_INVALID/u)
  assert.throws(() => validateIntelligenceFindings([{ ...finding, sourceId: "untrusted" }], [source], state, now), /EVIDENCE_INVALID/u)
})
test("rewording the same publisher/day cannot generate repeated alerts", () => {
  const prior = { ...state, findings: ["finding:v0:2026-10-05"] }
  assert.deepEqual(validateIntelligenceFindings([{ ...finding, whatChanged: "Same change, different generated prose" }], [source], prior, now), [])
})
test("date-only publication evidence is independent of a positive-offset host timezone", () => {
  const previous = process.env.TZ
  try {
    process.env.TZ = "Pacific/Port_Moresby"
    assert.equal(validateIntelligenceFindings([finding], [source], state, now)[0].publicationDate, "2026-10-05")
    assert.equal(validateIntelligenceFindings([{ ...finding, dateEvidence: "2026-10-05" }], [{ ...source, text: `${source.text} 2026-10-05` }], state, now)[0].publicationDate, "2026-10-05")
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})
test("future or stale discoveries are rejected", () => {
  assert.throws(() => validateIntelligenceFindings([{ ...finding, publicationDate: "2026-10-07" }], [source], state, now), /EVIDENCE_INVALID/u)
  assert.throws(() => validateIntelligenceFindings([{ ...finding, publicationDate: "2026-09-01" }], [source], state, now), /EVIDENCE_INVALID/u)
})
test("failed required providers cannot produce a false successful intelligence run", async () => {
  const fetcher = (async () => new Response("Provider unavailable", { status: 403 })) as typeof fetch
  await assert.rejects(runIntelligence(state, now, { NODE_ENV: "test" }, fetcher), /CORE_SOURCE_UNAVAILABLE/u)
})
test("no configured model means no provider spend or invented findings", async () => {
  const fetcher = (async () => new Response("Official release note ".repeat(30))) as typeof fetch
  await assert.rejects(runIntelligence(state, now, { NODE_ENV: "test" }, fetcher), /AI_MODEL_NOT_CONFIGURED/u)
})
test("network targets are fixed official sources and scripts are not fed to the model", () => {
  assert.ok(intelligenceSources.every(source => new URL(source.url).protocol === "https:"))
  assert.equal(readableSource("<script>privateScript</script><style>css</style><p>Official &amp; public release</p>"), "Official & public release")
})
