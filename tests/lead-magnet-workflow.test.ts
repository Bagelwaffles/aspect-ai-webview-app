import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildLeadMagnetContentBrief } from "../lib/lead-magnet-workflow"

test("Lead Magnet workflow maps customer inputs into the verified Content Agent contract", () => {
  const brief = buildLeadMagnetContentBrief({
    businessName: " Aspect Marketing Solutions ",
    audience: " small business owners ",
    type: "checklist",
    problem: " inconsistent marketing follow-up ",
    desiredOutcome: " leave with seven concrete actions ",
    tone: "educational",
    offer: " $49 Quick Marketing Audit ",
  })

  assert.equal(brief.businessName, "Aspect Marketing Solutions")
  assert.equal(brief.audience, "small business owners")
  assert.equal(brief.channel, "blog")
  assert.equal(brief.tone, "educational")
  assert.equal(brief.offer, "$49 Quick Marketing Audit")
  assert.match(brief.goal, /practical checklist/)
  assert.match(brief.goal, /inconsistent marketing follow-up/)
  assert.match(brief.goal, /seven concrete actions/)
  assert.ok(brief.goal.length <= 500)
})

test("Lead Magnet page keeps all customer text fields mobile-editable", () => {
  const source = readFileSync(new URL("../app/lead-magnet-agent/page.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(source, /<(?:Input|Textarea)[^>]*disabled=/)
  assert.match(source, /id="lead-business"[\s\S]*?className="h-11 text-base"/)
  assert.match(source, /id="lead-audience"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(source, /id="lead-problem"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(source, /id="lead-outcome"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(source, /id="lead-offer"[\s\S]*?className="min-h-20 text-base"/)
})
