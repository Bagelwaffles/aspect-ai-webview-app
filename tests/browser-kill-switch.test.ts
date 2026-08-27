import assert from "node:assert/strict"
import test from "node:test"

import { browserKillSwitchValueIsEnabled } from "../lib/server/browser-kill-switch"

test("browser kill switch accepts Upstash numeric and string enabled values", () => {
  assert.equal(browserKillSwitchValueIsEnabled(1), true)
  assert.equal(browserKillSwitchValueIsEnabled("1"), true)
  assert.equal(browserKillSwitchValueIsEnabled(true), true)
  assert.equal(browserKillSwitchValueIsEnabled("true"), true)
})

test("browser kill switch rejects missing and disabled values", () => {
  assert.equal(browserKillSwitchValueIsEnabled(null), false)
  assert.equal(browserKillSwitchValueIsEnabled(undefined), false)
  assert.equal(browserKillSwitchValueIsEnabled(0), false)
  assert.equal(browserKillSwitchValueIsEnabled("0"), false)
  assert.equal(browserKillSwitchValueIsEnabled(false), false)
  assert.equal(browserKillSwitchValueIsEnabled("false"), false)
})
