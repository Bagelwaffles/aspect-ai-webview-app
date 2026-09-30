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


test("Browser Operator defaults to direct free Gemini and keeps Gateway opt-in only", () => {
  const source = readFileSync("lib/server/browser-operator-agent.ts", "utf8")

  assert.match(source, /AMS_BROWSER_OPERATOR_PROVIDER/)
  assert.match(source, /\|\| "gemini-free"/)
  assert.match(source, /provider === "gemini-free"/)
  assert.match(source, /runGeminiFreeTierStructured/)
  assert.match(source, /provider === "gateway"/)
  assert.match(source, /BROWSER_OPERATOR_PROVIDER_UNSUPPORTED/)
  assert.match(source, /gemini-3\.5-flash-lite/)
})
