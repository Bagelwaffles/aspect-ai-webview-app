import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("checked-in production configuration uses the canonical AMS origin", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"))
  const nextConfig = readFileSync(new URL("../next.config.js", import.meta.url), "utf8")

  assert.equal(vercel.env.NEXT_PUBLIC_APP_URL, "https://www.aspectmarketingsolutions.app")
  assert.doesNotMatch(nextConfig, /vo\.aspectmarketingsolutions\.app/)
  assert.doesNotMatch(nextConfig, /Access-Control-Allow-Origin/)
})
