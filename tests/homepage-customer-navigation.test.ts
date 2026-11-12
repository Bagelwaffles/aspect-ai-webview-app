import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const homepage = fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8")
const publicHeader = fs.readFileSync(path.join(process.cwd(), "components/ams-public-header.tsx"), "utf8")

test("homepage puts the Agent Store, pricing, audit, contact, and sign-in paths in primary navigation", () => {
  assert.match(publicHeader, /href="\/agents"/)
  assert.match(homepage, /Agent Store/)
  assert.match(publicHeader, /href="\/pricing"/)
  assert.match(publicHeader, /href="\/quick-marketing-audit"/)
  assert.match(publicHeader, /href="\/contact"/)
  assert.match(publicHeader, /href="\/login\?next=\/dashboard"/)
  assert.match(publicHeader, /How it works/)
  assert.match(publicHeader, /ams-public-mobile-nav/)
})

test("homepage states the verified offer choices clearly above the fold", () => {
  assert.match(homepage, /seven production-verified AI agents/)
  assert.match(homepage, /from \$29\/month/)
  assert.match(homepage, /\$49 Quick Marketing Audit/)
})

test("homepage links featured agents directly to their dedicated sales pages", () => {
  assert.match(homepage, /href: "\/agents\/content-agent"/)
  assert.match(homepage, /href: "\/agents\/lead-magnet-agent"/)
  assert.match(homepage, /href: "\/agents\/nurture-agent"/)
  assert.match(homepage, /View sales page/)
})
