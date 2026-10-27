import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const cfg = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  routes: Array<{ src: string; dest?: string; status?: number; has?: unknown[] }>
}

/**
 * Vercel Deployment Protection remains responsible for SSO on Preview URLs.
 * Blanket hostname 404 routing is not a safe pilot isolation mechanism: it
 * affects unrelated immutable Preview deployments.
 */
test("Vercel routing preserves API and pages without blanket immutable Preview denial", () => {
  assert.deepEqual(cfg.routes, [
    { src: "/api/(.*)", dest: "/api/$1" },
    { src: "/(.*)", dest: "/$1" },
  ])
  assert.equal(cfg.routes.some((route) =>
    route.status === 404 && Array.isArray(route.has) && route.has.length > 0,
  ), false)
})
