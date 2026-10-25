import { test } from "node:test"
import assert from "node:assert/strict"
import {
  classifyPilotIngressRequest,
  STRIPE_PILOT_INGRESS_HOST,
  STRIPE_PILOT_INGRESS_PATH,
  type PilotIngressRequest,
} from "../lib/server/quick-audit-stripe-pilot-host-policy"

const approved: PilotIngressRequest = {
  hostHeader: STRIPE_PILOT_INGRESS_HOST,
  urlHostname: STRIPE_PILOT_INGRESS_HOST,
  method: "POST",
  pathname: STRIPE_PILOT_INGRESS_PATH,
  search: "",
  vercelEnvironment: "preview",
  gitBranch: "feat/ams-resend-transactional-preview-20261023",
}

test("only exact method/path on dedicated sandbox Preview hostname is routed", () => {
  assert.equal(classifyPilotIngressRequest(approved), "allow")
  for (const method of ["GET", "HEAD", "OPTIONS", "PUT", "DELETE", "PATCH"]) {
    assert.equal(classifyPilotIngressRequest({ ...approved, method }), "deny", method)
  }
  for (const pathname of [
    "/", "/owner/resend-preview", "/api/auth/session", "/api/internal/quick-audit-pilot-dispatch",
    "/api/internal/quick-audit-stripe-pilot/", "/api/internal/quick-audit-stripe-pilot-selftest",
    "/_next/static/chunks/app.js", "/_next/image", "/favicon.ico", "/robots.txt",
    "/api/internal/quick-audit-stripe-pilot%2F..%2Fquick-audit-pilot-dispatch",
  ]) {
    assert.equal(classifyPilotIngressRequest({ ...approved, pathname }), "deny", pathname)
  }
  assert.equal(classifyPilotIngressRequest({ ...approved, search: "?_vercel_share=legacy" }), "deny")
  assert.equal(classifyPilotIngressRequest({ ...approved, search: "?x-vercel-protection-bypass=x" }), "deny")
})

test("unexpected host headers, previews and branch refs fail closed", () => {
  const bad: Partial<PilotIngressRequest>[] = [
    { hostHeader: "example.org" },
    { urlHostname: "example.org" },
    { hostHeader: STRIPE_PILOT_INGRESS_HOST + ":443" },
    { hostHeader: STRIPE_PILOT_INGRESS_HOST + "." },
    { vercelEnvironment: "production" },
    { vercelEnvironment: undefined },
    { gitBranch: "main" },
    { gitBranch: undefined },
  ]
  for (const change of bad) {
    assert.equal(classifyPilotIngressRequest({ ...approved, ...change }), "deny", JSON.stringify(change))
  }
})

test("unrelated protected and production hosts retain existing auth routing", () => {
  for (const host of [
    "www.aspectmarketingsolutions.app",
    "aspect-ai-overlord-git-716b96-kimberleyaversbiz-4131s-projects.vercel.app",
  ]) {
    assert.equal(classifyPilotIngressRequest({
      ...approved, hostHeader: host, urlHostname: host,
    }), "not-ingress-host")
  }
})
