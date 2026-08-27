import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("Browser Agent has bounded AI Gateway model fallbacks", () => {
  const runtime = readFileSync("lib/server/agent-runtime.ts", "utf8")

  assert.match(runtime, /DEFAULT_BROWSER_OPERATOR_FALLBACK_MODELS/)
  assert.match(runtime, /google\/gemini-2\.5-flash-lite/)
  assert.match(runtime, /openai\/gpt-4\.1-nano/)
  assert.match(runtime, /alibaba\/qwen-3-14b/)
  assert.match(runtime, /AMS_BROWSER_OPERATOR_FALLBACK_MODELS/)
  assert.match(runtime, /definition\.id === "browser-operator"/)
  assert.match(runtime, /providerOptions:[\s\S]*gateway:[\s\S]*models: fallbackModels/)
  assert.match(runtime, /\.slice\(0, 4\)/)
})

test("fallback routing is opt-in for non-browser structured agents", () => {
  const runtime = readFileSync("lib/server/agent-runtime.ts", "utf8")

  assert.match(
    runtime,
    /definition\.fallbackModels \?\?[\s\S]*definition\.id === "browser-operator"[\s\S]*configuredBrowserOperatorFallbackModels\(env\) : \[\]/,
  )
})
