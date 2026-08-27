import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { riskForBrowserAction, validateBrowserJobInput } from "../lib/browser-control-policy"

test("browser credential capture and fill are red owner-approved actions", () => {
  assert.equal(riskForBrowserAction("capture_secret"), "red")
  assert.equal(riskForBrowserAction("fill_secret"), "red")
  assert.equal(riskForBrowserAction("describe"), "green")
})

test("sanitized describe can inspect the current live form without reloading it", () => {
  const described = validateBrowserJobInput({
    action: "describe",
    url: "https://www.linkedin.com/developers/apps/new",
    useCurrentPage: true,
  })
  assert.equal(described.ok, true)
  if (described.ok) assert.equal(described.value.useCurrentPage, true)

  assert.equal(
    validateBrowserJobInput({
      action: "inspect",
      url: "https://www.linkedin.com/developers/apps/new",
      useCurrentPage: true,
    }).ok,
    false,
  )
})

test("browser credential actions accept only safe secret references and reject raw values outright", () => {
  const capture = validateBrowserJobInput({
    action: "capture_secret",
    url: "https://www.linkedin.com/developers/apps/example/auth",
    selector: "label=Client secret",
    secretRef: "linkedin.client_secret",
    useCurrentPage: true,
  })
  assert.equal(capture.ok, true)
  if (capture.ok) {
    assert.equal(capture.value.secretRef, "linkedin.client_secret")
    assert.equal(capture.value.value, undefined)
    assert.equal(capture.value.useCurrentPage, true)
  }

  assert.equal(
    validateBrowserJobInput({
      action: "capture_secret",
      url: "https://www.linkedin.com/developers/apps/example/auth",
      selector: "label=Client secret",
      secretRef: "linkedin.client_secret",
      value: "must-never-cross-control-plane",
      useCurrentPage: true,
    }).ok,
    false,
  )

  const fill = validateBrowserJobInput({
    action: "fill_secret",
    url: "https://vercel.com/example/project/settings/environment-variables",
    selector: "input[name='value']",
    secretRef: "linkedin.client_secret",
    useCurrentPage: true,
  })
  assert.equal(fill.ok, true)

  assert.equal(
    validateBrowserJobInput({
      action: "fill_secret",
      url: "https://vercel.com/example/project/settings/environment-variables",
      selector: "input[name='value']",
      secretRef: "linkedin.client_secret",
      value: "must-never-cross-control-plane",
      useCurrentPage: true,
    }).ok,
    false,
  )

  assert.equal(
    validateBrowserJobInput({
      action: "capture_secret",
      url: "https://www.linkedin.com/developers/apps/example/auth",
      selector: "label=Client secret",
      secretRef: "../credentials.json",
      useCurrentPage: true,
    }).ok,
    false,
  )
  assert.equal(
    validateBrowserJobInput({
      action: "fill_secret",
      url: "https://vercel.com/example/project/settings/environment-variables",
      selector: "input[name='value']",
      useCurrentPage: true,
    }).ok,
    false,
  )
})

test("Windows worker vault uses CurrentUser DPAPI and pipes raw values over stdin, not command arguments", () => {
  const source = readFileSync("tools/browser-worker/src/index.ts", "utf8")
  assert.match(source, /ProtectedData\]::Protect/)
  assert.match(source, /ProtectedData\]::Unprotect/)
  assert.match(source, /DataProtectionScope\]::CurrentUser/)
  assert.match(source, /child\.stdin\.end\(input/)
  assert.match(source, /secretRoot/)
  assert.match(source, /capture_secret/)
  assert.match(source, /fill_secret/)
  assert.doesNotMatch(source, /spawn\([^\n]+rawSecret/)
})

test("sanitized describe action enumerates controls without reading form values", () => {
  const source = readFileSync("tools/browser-worker/src/index.ts", "utf8")
  const describeStart = source.indexOf("async function describePage")
  const ownerActionStart = source.indexOf("async function detectOwnerAction")
  assert.ok(describeStart >= 0)
  assert.ok(ownerActionStart > describeStart)
  const describeSource = source.slice(describeStart, ownerActionStart)
  assert.match(describeSource, /querySelectorAll\("input,textarea,select,button,a/)
  assert.match(describeSource, /placeholder/)
  assert.match(describeSource, /label:/)
  assert.doesNotMatch(describeSource, /\.value/)
  assert.doesNotMatch(describeSource, /inputValue/)
})

test("Browser Agent planner forbids model-visible raw credentials and routes secrets through references", () => {
  const source = readFileSync("lib/server/browser-operator-agent.ts", "utf8")
  assert.match(source, /NEVER ask for, emit, repeat/)
  assert.match(source, /capture_secret/)
  assert.match(source, /fill_secret/)
  assert.match(source, /Never use inspect or screenshot to obtain credentials/)
  assert.match(source, /looksLikeRawSecret/)
  assert.match(source, /selectorLooksCredentialSensitive/)
})

test("Browser Agent strict response schema uses required nullable proposed-job fields", () => {
  const source = readFileSync("lib/server/browser-operator-agent.ts", "utf8")
  assert.match(source, /selector: z\.string\(\)\.max\(500\)\.nullable\(\)/)
  assert.match(source, /value: z\.string\(\)\.max\(5_000\)\.nullable\(\)/)
  assert.match(source, /secretRef: z\.string\(\)\.max\(80\)\.nullable\(\)/)
  assert.match(source, /useCurrentPage: z\.boolean\(\)\.nullable\(\)/)
  assert.match(source, /Use null when a field is not applicable/)
  assert.doesNotMatch(source, /selector: z\.string\(\)\.max\(500\)\.optional\(\)/)
})

test("Browser Agent automatically recovers current-page origin mismatches", () => {
  const route = readFileSync("app/api/browser-control/operator/route.ts", "utf8")
  const client = readFileSync("app/dashboard/browser-control/operator/BrowserOperatorClient.tsx", "utf8")

  assert.match(route, /CURRENT_PAGE_ORIGIN_MISMATCH/)
  assert.match(route, /action: "open"/)
  assert.match(route, /recover from current-page origin mismatch before continuing/)
  assert.match(client, /CURRENT_PAGE_ORIGIN_MISMATCH/)
  assert.match(client, /recovering the correct page automatically/)
  assert.match(client, /window\.setTimeout\(\(\) => void continueGoal\(\), 500\)/)
})
