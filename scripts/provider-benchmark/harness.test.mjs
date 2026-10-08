import test from 'node:test'
import assert from 'node:assert/strict'
import { cases, score, summarize, fixtureHash, version, promptFor } from './harness.mjs'
test('ten labeled synthetic cases cover both mailboxes and existing AMS workloads', () => {
  assert.equal(cases.length, 10)
  assert.equal(new Set(cases.map(c => c.id)).size, 10)
  for (const c of cases) { assert.equal(score(c, c.expected).passed, true); assert.ok(!promptFor(c).user.includes(JSON.stringify(c.expected))) }
})
test('missed critical alerts and personal false positives are counted', () => {
  const critical = cases.find(c => c.critical)
  assert.equal(score(critical, { ...critical.expected, alert: false }).missedCritical, true)
  assert.equal(score(critical, null).missedCritical, true)
  const personal = cases.find(c => c.id === 'gmail-secondary-personal')
  assert.equal(score(personal, { ...personal.expected, alert: true }).falsePositive, true)
})
test('invented facts and external actions fail the rubric', () => {
  assert.equal(score(cases[5], { ...cases[5].expected, action: 'publish' }).schemaValid, false)
  assert.equal(score(cases[5], { ...cases[5].expected, facts: { ...cases[5].expected.facts, worldRecord: true } }).passed, false)
})
test('collector rejects wrong provenance and missing billed telemetry', () => {
  assert.throws(() => summarize([{ caseId: cases[0].id }]), /PROVENANCE/)
  assert.throws(() => summarize([{ caseId: cases[0].id, fixtureHash, promptVersion: version, provider: 'test', model: 'test', source: 'provider', requestId: 'request', attempts: [] }]), /TELEMETRY/)
})
test('all retries and failed attempts count toward cost per successful task', () => {
  const attempt = { latencyMs: 100, billedCostUsd: .01, billingEvidence: 'synthetic-test-only', inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }
  const capture = (c, output, attempts) => ({ caseId: c.id, fixtureHash, promptVersion: version, provider: 'test', model: 'test', source: 'provider', requestId: c.id, output, attempts })
  const report = summarize([capture(cases[0], cases[0].expected, [{ ...attempt, error: 'timeout' }, attempt]), capture(cases[1], null, [attempt])])
  assert.equal(report.models[0].successful, 1)
  assert.equal(report.models[0].costPerSuccessfulTaskUsd, .03)
  assert.equal(report.models[0].failures, 1)
  assert.equal(report.models[0].go, false)
  assert.throws(() => summarize([capture(cases[0], cases[0].expected, [attempt]), capture(cases[0], cases[0].expected, [attempt])]), /PROVENANCE/)
})
