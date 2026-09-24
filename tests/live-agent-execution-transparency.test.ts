import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { agents } from "../app/agents/agentCatalog"

const liveAgentPages: Record<string, string> = {
  "content-agent": "../app/content-agent/page.tsx",
  "lead-magnet-agent": "../app/lead-magnet-agent/page.tsx",
  "email-campaign-agent": "../app/email-campaign-agent/page.tsx",
  "nurture-agent": "../app/nurture-agent/page.tsx",
  "outreach-agent": "../app/outreach-agent/page.tsx",
  "seo-agent": "../app/seo-agent/page.tsx",
  "product-creator-agent": "../app/product-creator-agent/page.tsx",
}

test("every Live commercial agent has an execution-transparency UI mapping", () => {
  const live = agents
    .filter((agent) => agent.status === "live" && !agent.internal)
    .map((agent) => agent.slug)
    .sort()

  assert.deepEqual(live, Object.keys(liveAgentPages).sort())
})

test("every Live commercial agent requires explicit external processing consent", () => {
  for (const [slug, page] of Object.entries(liveAgentPages)) {
    const source = readFileSync(new URL(page, import.meta.url), "utf8")
    assert.match(
      source,
      /X-AMS-External-Processing-Consent": "granted"/,
      `${slug} must send the explicit consent signal`,
    )
    assert.match(
      source,
      /externalProcessingConsent/,
      `${slug} must maintain a customer-controlled consent state`,
    )
  }
})

test("every Live commercial agent exposes execution provenance to the customer", () => {
  for (const [slug, page] of Object.entries(liveAgentPages)) {
    const source = readFileSync(new URL(page, import.meta.url), "utf8")
    assert.match(
      source,
      /Execution transparency|ExecutionProvenancePanel/,
      `${slug} must expose execution provenance`,
    )
  }
})

test("the shared generation API rejects missing external processing consent", () => {
  const source = readFileSync(
    new URL("../app/api/content-agent/runs/route.ts", import.meta.url),
    "utf8",
  )
  assert.match(source, /EXTERNAL_PROCESSING_CONSENT_REQUIRED/)
  assert.match(source, /hasExplicitExternalProcessingConsent/)
  assert.match(source, /status|428/)
})
