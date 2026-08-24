import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildEmailCampaignContentBrief } from "../lib/email-campaign-workflow"
import { buildContentAgentPrompt } from "../lib/server/content-agent"

test("Email Campaign maps into the verified Content Agent contract", () => {
  const brief = buildEmailCampaignContentBrief({
    businessName: " Aspect Marketing Solutions ",
    audience: " Kentucky small-business owners ",
    campaignType: "promotion",
    sequenceLength: "5",
    objective: "Introduce the $49 Quick Marketing Audit",
    keyMessage: "Practical marketing help without inflated promises",
    tone: "professional",
    offer: " $49 Quick Marketing Audit ",
    constraints: "Keep each email concise",
  })

  assert.equal(brief.businessName, "Aspect Marketing Solutions")
  assert.equal(brief.audience, "Kentucky small-business owners")
  assert.equal(brief.channel, "email")
  assert.equal(brief.tone, "professional")
  assert.equal(brief.offer, "$49 Quick Marketing Audit")
  assert.match(brief.goal, /^DRAFT ONLY\./)
  assert.match(brief.goal, /Write 5 distinct emails/)
  assert.match(brief.goal, /do not send, schedule, enroll contacts, scrape addresses, or claim consent/)
  assert.match(brief.goal, /Avoid fabricated results, fake scarcity, unsupported urgency, or guarantees/)
  assert.ok(brief.goal.length <= 500)
})

test("Email Campaign max-length inputs stay inside Content Agent limits", () => {
  const brief = buildEmailCampaignContentBrief({
    businessName: "B".repeat(120),
    audience: "A".repeat(500),
    campaignType: "launch",
    sequenceLength: "7",
    objective: "O".repeat(240),
    keyMessage: "K".repeat(300),
    tone: "conversational",
    offer: "F".repeat(500),
    constraints: "C".repeat(200),
  })

  assert.equal(brief.businessName.length, 120)
  assert.equal(brief.audience.length, 500)
  assert.equal(brief.offer?.length, 500)
  assert.ok(brief.goal.length <= 500)
  assert.match(brief.goal, /^DRAFT ONLY\./)
})

test("Email Campaign page keeps customer text fields mobile-editable", () => {
  const source = readFileSync(new URL("../app/email-campaign-agent/page.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(source, /<(?:Input|Textarea)[^>]*disabled=/)
  assert.match(source, /id="email-campaign-business"[\s\S]*?className="h-11 text-base"/)
  assert.match(source, /id="email-campaign-audience"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(source, /id="email-campaign-objective"[\s\S]*?className="min-h-20 text-base"/)
  assert.match(source, /id="email-campaign-message"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(source, /id="email-campaign-offer"[\s\S]*?className="h-11 text-base"/)
})

test("Email Campaign page remains draft-only with no delivery action", () => {
  const source = readFileSync(new URL("../app/email-campaign-agent/page.tsx", import.meta.url), "utf8")
  assert.match(source, /Draft-only campaign boundary/)
  assert.match(source, /AMS does not send, schedule, enroll contacts, or collect addresses/)
  assert.match(source, /Review every email before use/)
})

test("Content Agent prompt does not ask users to re-verify exact validated input spelling", () => {
  const prompt = buildContentAgentPrompt({
    businessName: "Aspect Marketing Solutions",
    audience: "Kentucky small-business owners",
    goal: "Create a concise campaign",
    channel: "email",
    tone: "professional",
  })

  assert.match(prompt, /Do not use safetyNotes merely to ask the customer to verify spelling or wording of exact validated brief values/)
  assert.match(prompt, /claims introduced by the draft or facts requiring independent confirmation/)
})
