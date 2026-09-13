import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const homepage = fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8")

describe("homepage customer navigation", () => {
  it("puts the Agent Store, pricing, audit, contact, and sign-in paths in primary navigation", () => {
    expect(homepage).toContain('href="/agents"')
    expect(homepage).toContain("Agent Store")
    expect(homepage).toContain('href="/pricing"')
    expect(homepage).toContain('href="/quick-marketing-audit"')
    expect(homepage).toContain('href="/contact"')
    expect(homepage).toContain('href="/login?next=/dashboard"')
  })

  it("states the verified offer choices clearly above the fold", () => {
    expect(homepage).toContain("seven production-verified AI agents")
    expect(homepage).toContain("from $29/month")
    expect(homepage).toContain("$49 Quick Marketing Audit")
  })

  it("links featured agents directly to their dedicated sales pages", () => {
    expect(homepage).toContain('href: "/agents/content-agent"')
    expect(homepage).toContain('href: "/agents/lead-magnet-agent"')
    expect(homepage).toContain('href: "/agents/nurture-agent"')
    expect(homepage).toContain("View sales page")
  })
})
