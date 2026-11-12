import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (file: string) => readFileSync(file, "utf8")
const audit = read("app/quick-marketing-audit/page.tsx")
const contact = read("app/contact/page.tsx")

test("audit and contact describe a paused offer without immediate-purchase claims", () => {
  for (const page of [audit, contact]) {
    assert.match(page, /checkout is currently paused while fulfillment is re-verified/i)
    assert.match(page, /no payment is accepted until verification is complete/i)
    assert.doesNotMatch(page, /First live AMS revenue offer|What happens after you buy|buyers get a real deliverable now|verified products you can use today|Start with a focused \$49 marketing audit|Get the \$49 audit/)
    const metadata = page.slice(page.indexOf("export const metadata"), page.indexOf("export default"))
    assert.match(metadata, /paused while fulfillment is re-verified/)
  }
  assert.match(contact, /Check audit availability/)
  assert.match(audit, /Intended deliverables when available/)
  assert.match(audit, /delivery is targeted within 48 hours/)
})

test("presentation retains runtime-gated checkout and canonical offer facts", () => {
  assert.match(audit, /const checkoutReady = await isQuickAuditRuntimeLaunchEnabled\(\)/)
  assert.match(audit, /\{checkoutReady \? \(\s*<div id="quick-audit-checkout">\s*<QuickAuditCheckoutForm \/>\s*<\/div>\s*\) : \(/)
  assert.match(audit, /QUICK_MARKETING_AUDIT\.deliverables\.map/)
  assert.match(audit, /QUICK_MARKETING_AUDIT\.priceLabel/)
  assert.match(audit, /QUICK_MARKETING_AUDIT\.deliveryWindow/)
  assert.match(contact, /\$49 Quick Marketing Audit/)
})

test("shared footer retains scoped 44 by 44 targets and wrapping", () => {
  const css = read("app/globals.css")
  const rules = [...css.matchAll(/\.ams-public-footer__nav a\s*\{([^}]+)\}/g)].map(m => m[1]).join("\n")
  assert.match(rules, /min-width:\s*44px/)
  assert.match(rules, /min-height:\s*44px/)
  assert.match(rules, /justify-content:\s*center/)
  assert.match(rules, /padding-inline:\s*6px/)
  assert.match(css, /\.ams-public-footer \.ams-public-brand\s*\{\s*min-height:\s*44px/)
  assert.match(css, /\.ams-public-footer__nav\s*\{[^}]*flex-wrap:\s*wrap/)
  assert.match(read("components/ams-public-footer.tsx"), /aria-label="Footer navigation"/)
})
