import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { riskForBrowserAction, validateBrowserJobInput } from "../lib/browser-control-policy"

test("browser credential capture and fill are red owner-approved actions", () => {
  assert.equal(riskForBrowserAction("capture_secret"), "red")
  assert.equal(riskForBrowserAction("fill_secret"), "red")
})

test("browser credential actions accept only safe secret references and never accept a raw value", () => {
  const capture = validateBrowserJobInput({
    action: "capture_secret",
    url: "https://www.linkedin.com/developers/apps/example/auth",
    selector: "label=Client secret",
    secretRef: "linkedin.client_secret",
    value: "must-never-cross-control-plane",
    useCurrentPage: true,
  })
  assert.equal(capture.ok, true)
  if (capture.ok) {
    assert.equal(capture.value.secretRef, "linkedin.client_secret")
    assert.equal(capture.value.value, undefined)
    assert.equal(capture.value.useCurrentPage, true)
  }

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
