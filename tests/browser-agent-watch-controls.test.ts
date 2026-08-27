import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { riskForBrowserAction, validateBrowserJobInput } from "../lib/browser-control-policy"

test("focus_browser is a green allowlisted worker action without selectors", () => {
  assert.equal(riskForBrowserAction("focus_browser"), "green")
  const parsed = validateBrowserJobInput({
    action: "focus_browser",
    url: "https://www.linkedin.com/developers/apps/new",
  })
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    assert.equal(parsed.value.action, "focus_browser")
    assert.equal(parsed.value.selector, undefined)
    assert.equal(parsed.value.useCurrentPage, undefined)
  }
})

test("Windows worker foregrounds only the dedicated AMS browser profile", () => {
  const source = readFileSync("tools/browser-worker/src/index.ts", "utf8")
  assert.match(source, /const VERSION = "1\.3\.0"/)
  assert.match(source, /focus_browser/)
  assert.match(source, /page\.bringToFront\(\)/)
  assert.match(source, /WScript\.Shell/)
  assert.match(source, /Get-CimInstance Win32_Process/)
  assert.match(source, /CommandLine\.Contains\(\$profile\)/)
  assert.match(source, /profilePath/)
  assert.doesNotMatch(source, /Stop-Process/)
})

test("Browser Agent chat exposes show browser, STOP, Resume, and typed control commands", () => {
  const source = readFileSync("app/dashboard/browser-control/operator/BrowserOperatorClient.tsx", "utf8")
  assert.match(source, /SHOW_COMMANDS/)
  assert.match(source, /STOP_COMMANDS/)
  assert.match(source, /RESUME_COMMANDS/)
  assert.match(source, /action: "focus_browser"/)
  assert.match(source, /\/api\/browser-control\/kill-switch/)
  assert.match(source, />Show browser</)
  assert.match(source, />STOP</)
  assert.match(source, />Resume</)
  assert.match(source, /that single action may finish/)
})
