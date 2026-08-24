import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildOutreachContentBrief } from "../lib/outreach-workflow"

test("Outreach workflow maps one draft into the verified Content Agent contract", () => {
  const brief = buildOutreachContentBrief({
    businessName: " Aspect Marketing Solutions ",
    prospectDescription: " Kentucky HVAC company owner ",
    stage: "first-contact",
    channel: "email",
    relationship: "cold-relevant",
    objective: "quick-audit",
    knownContext: " Active website and public Facebook page ",
    tone: "professional",
    offer: " $49 Quick Marketing Audit ",
  })

  assert.equal(brief.businessName, "Aspect Marketing Solutions")
  assert.equal(brief.audience, "Kentucky HVAC company owner")
  assert.equal(brief.channel, "email")
  assert.equal(brief.tone, "professional")
  assert.equal(brief.offer, "$49 Quick Marketing Audit")
  assert.match(brief.goal, /DRAFT ONLY/)
  assert.match(brief.goal, /Do not send, automate, scrape, or claim consent/)
  assert.match(brief.goal, /Never invent personalization, prior contact, a warm intro/)
  assert.match(brief.goal, /first-contact message/)
  assert.match(brief.goal, /no prior relationship is claimed/)
  assert.ok(brief.goal.length <= 500)
})

test("Outreach maps LinkedIn and social DMs to the protected social channel", () => {
  for (const channel of ["linkedin", "social-dm"] as const) {
    const brief = buildOutreachContentBrief({
      businessName: "AMS",
      prospectDescription: "local small business owner",
      stage: "follow-up",
      channel,
      relationship: "existing-conversation",
      objective: "continue-conversation",
      tone: "friendly",
    })
    assert.equal(brief.channel, "social")
  }
})

test("Outreach max-length inputs stay within Content Agent limits and retain safety guardrails", () => {
  const brief = buildOutreachContentBrief({
    businessName: "B".repeat(120),
    prospectDescription: "P".repeat(500),
    stage: "objection-response",
    channel: "email",
    relationship: "warm-intro",
    objective: "send-details",
    knownContext: "C".repeat(300),
    objection: "O".repeat(240),
    tone: "conversational",
    offer: "F".repeat(300),
  })

  assert.equal(brief.businessName.length, 120)
  assert.equal(brief.audience.length, 500)
  assert.equal(brief.offer?.length, 300)
  assert.ok(brief.goal.length <= 500)
  assert.match(brief.goal, /^DRAFT ONLY\./)
  assert.match(brief.goal, /Never invent personalization/)
})

test("Outreach page keeps all customer text fields mobile-editable", () => {
  const source = readFileSync(new URL("../app/outreach-agent/page.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(source, /<(?:Input|Textarea)[^>]*disabled=/)
  assert.match(source, /id="outreach-business"[\s\S]*?className="h-11 text-base"/)
  assert.match(source, /id="outreach-prospect"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(source, /id="outreach-context"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(source, /id="outreach-objection"[\s\S]*?className="min-h-20 text-base"/)
  assert.match(source, /id="outreach-offer"[\s\S]*?className="h-11 text-base"/)
})

test("Outreach page states that generation is draft-only and never auto-sends", () => {
  const source = readFileSync(new URL("../app/outreach-agent/page.tsx", import.meta.url), "utf8")
  assert.match(source, /Draft-only safety boundary/)
  assert.match(source, /AMS does not send, scrape, enrich, or contact anyone/)
  assert.match(source, /Review every message yourself before use/)
})
