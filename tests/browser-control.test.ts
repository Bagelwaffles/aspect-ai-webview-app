import assert from "node:assert/strict"
import test from "node:test"

import {
  isAllowedBrowserUrl,
  riskForBrowserAction,
  validateBrowserJobInput,
} from "../lib/browser-control-policy"

test("browser control classifies read-only and write actions by risk", () => {
  assert.equal(riskForBrowserAction("open"), "green")
  assert.equal(riskForBrowserAction("inspect"), "green")
  assert.equal(riskForBrowserAction("screenshot"), "green")
  assert.equal(riskForBrowserAction("click"), "yellow")
  assert.equal(riskForBrowserAction("fill"), "yellow")
  assert.equal(riskForBrowserAction("submit"), "red")
})

test("browser control only accepts exact allowlisted HTTPS hosts", () => {
  assert.equal(isAllowedBrowserUrl("https://www.aspectmarketingsolutions.app/collaborate"), true)
  assert.equal(isAllowedBrowserUrl("https://github.com/Bagelwaffles"), true)
  assert.equal(isAllowedBrowserUrl("https://evil.example/"), false)
  assert.equal(isAllowedBrowserUrl("https://github.com.evil.example/"), false)
  assert.equal(isAllowedBrowserUrl("https://user:pass@github.com/"), false)
})

test("browser control validates selectors and fill values", () => {
  assert.deepEqual(
    validateBrowserJobInput({ action: "click", url: "https://www.aspectmarketingsolutions.app/", selector: "a[href='/collaborate']" }).ok,
    true,
  )
  assert.deepEqual(
    validateBrowserJobInput({ action: "click", url: "https://www.aspectmarketingsolutions.app/" }).ok,
    false,
  )
  assert.deepEqual(
    validateBrowserJobInput({ action: "fill", url: "https://www.aspectmarketingsolutions.app/", selector: "input", value: "test" }).ok,
    true,
  )
  assert.deepEqual(
    validateBrowserJobInput({ action: "fill", url: "https://www.aspectmarketingsolutions.app/", selector: "input" }).ok,
    false,
  )
})
