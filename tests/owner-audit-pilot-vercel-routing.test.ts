import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cfg = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"));
const deny = cfg.routes[0];
const pilotPath = "/api/internal/quick-audit-pilot/webhook";
const hostPattern = new RegExp(deny.has[0].value.re);
const denyPattern = new RegExp(deny.src);

test("Vercel routes deny everything but the exact pilot webhook on immutable deployment hosts", () => {
  assert.equal(deny.status, 404);
  assert.equal(deny.has[0].type, "host");
  assert.equal(deny.headers["Cache-Control"], "no-store");
  assert.equal(hostPattern.test("aspect-ai-overlord-nz5p3xn5z-kimberleyaversbiz-4131s-projects.vercel.app"), true);
  assert.equal(hostPattern.test("aspect-ai-overlord-git-e240cd-kimberleyaversbiz-4131s-projects.vercel.app"), false);
  assert.equal(hostPattern.test("www.aspectmarketingsolutions.app"), false);
  assert.equal(hostPattern.test("aspect-ai-overlord-nz5p3xn5z-kimberleyaversbiz-4131s-projects.vercel.app.bad.com"), false);
  assert.equal(denyPattern.test(pilotPath), false);
  for (const pathname of ["/", "/owner", "/login", "/dashboard", "/api/webhooks/stripe",
       "/api/internal/quick-audit-test/checkout", "/api/internal/quick-audit-pilot/webhook/",
       "/api/internal/quick-audit-pilot/webhook/more", "/_next/static/app.js", "/favicon.ico", "/api/auth/session"]) {
    assert.equal(denyPattern.test(pathname), true, pathname);
  }
});
