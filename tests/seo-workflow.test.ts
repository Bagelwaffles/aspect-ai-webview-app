import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildSeoContentBrief } from "../lib/seo-workflow"

test("SEO workflow maps customer inputs into the verified Content Agent contract", () => {
  const brief = buildSeoContentBrief({
    businessName: " Aspect Marketing Solutions ",
    audience: " small business owners ",
    pageType: "service-page",
    topic: " affordable marketing audits ",
    location: " Kentucky ",
    objective: "qualified-leads",
    tone: "professional",
    offer: " $49 Quick Marketing Audit ",
  })

  assert.equal(brief.businessName, "Aspect Marketing Solutions")
  assert.equal(brief.audience, "small business owners")
  assert.equal(brief.channel, "website")
  assert.equal(brief.tone, "professional")
  assert.equal(brief.offer, "$49 Quick Marketing Audit")
  assert.match(brief.goal, /service page/i)
  assert.match(brief.goal, /affordable marketing audits/i)
  assert.match(brief.goal, /Kentucky/i)
  assert.match(brief.goal, /never invent rankings, volume, traffic, competitor data, or live-search findings/i)
  assert.ok(brief.goal.length <= 500)
})

test("SEO max-length form values stay inside Content Agent schema limits", () => {
  const brief = buildSeoContentBrief({
    businessName: "B".repeat(120),
    audience: "A".repeat(300),
    pageType: "location-page",
    topic: "T".repeat(160),
    location: "L".repeat(120),
    objective: "local-visibility",
    tone: "conversational",
    offer: "F".repeat(300),
  })

  assert.ok(brief.goal.length <= 500)
  assert.equal(brief.businessName.length, 120)
  assert.equal(brief.audience.length, 300)
  assert.equal(brief.offer?.length, 300)
})

test("SEO page keeps all customer text fields mobile-editable", () => {
  const source = readFileSync(new URL("../app/seo-agent/page.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(source, /<(?:Input|Textarea)[^>]*disabled=/)
  assert.match(source, /id="seo-business"[\s\S]*?className="h-11 text-base"/)
  assert.match(source, /id="seo-audience"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(source, /id="seo-topic"[\s\S]*?className="min-h-24 text-base"/)
  assert.match(source, /id="seo-location"[\s\S]*?className="h-11 text-base"/)
  assert.match(source, /id="seo-offer"[\s\S]*?className="min-h-20 text-base"/)
  assert.match(source, /No fabricated SEO metrics/)
})
