import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const homepage = fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8")
const publicHeader = fs.readFileSync(path.join(process.cwd(), "components/ams-public-header.tsx"), "utf8")
const publicFooter = fs.readFileSync(path.join(process.cwd(), "components/ams-public-footer.tsx"), "utf8")
const publicJourney = `${homepage}\n${publicHeader}\n${publicFooter}`

test("homepage puts the Agent Store, pricing, audit, contact, and sign-in paths in primary navigation", () => {
  assert.match(publicJourney, /href="\/agents"/)
  assert.match(publicJourney, /Agent Store/)
  assert.match(publicJourney, /href="\/pricing"/)
  assert.match(publicJourney, /href="\/quick-marketing-audit"/)
  assert.match(publicJourney, /href="\/contact"/)
  assert.match(publicJourney, /href="\/login\?next=\/dashboard"/)
})

test("homepage states the verified offer choices clearly above the fold", () => {
  assert.match(homepage, /7 AI agents available today/)
  assert.match(homepage, /Start from \$29\/month/)
  assert.match(homepage, /Start with the \$49 audit/)
})

test("homepage links featured agents directly to their dedicated sales pages", () => {
  assert.match(homepage, /href: "\/agents\/content-agent"/)
  assert.match(homepage, /href: "\/agents\/lead-magnet-agent"/)
  assert.match(homepage, /href: "\/agents\/nurture-agent"/)
  assert.match(homepage, /See what it does/)
})
