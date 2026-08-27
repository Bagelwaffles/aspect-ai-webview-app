import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { isAllowedBrowserUrl, riskForBrowserAction, validateBrowserJobInput } from "../lib/browser-control-policy"

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

test("LinkedIn developer URLs with normal tracking query strings remain allowlisted", () => {
  assert.equal(
    isAllowedBrowserUrl(
      "https://www.linkedin.com/developers/apps/new?src=direct%2Fnone&veh=direct%2Fnone%7Cdirect%2Fnone",
    ),
    true,
  )
})

test("Browser Agent recovers from a rejected planner destination by describing the current trusted page", () => {
  const source = readFileSync("lib/server/browser-operator-agent.ts", "utf8")
  assert.match(source, /validated\.error === "URL is not on the browser-control allowlist"/)
  assert.match(source, /isAllowedBrowserUrl\(parsedInput\.currentUrl\)/)
  assert.match(source, /action: "describe"/)
  assert.match(source, /url: parsedInput\.currentUrl/)
  assert.match(source, /useCurrentPage: true/)
  assert.match(source, /outside the approved provider registry/)
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
