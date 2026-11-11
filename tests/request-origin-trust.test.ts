import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server"

import { requestHasTrustedAppOrigin, trustedOriginDiagnostics } from "../lib/server/request-origin"

const branch = "feat/ams-maintenance-agent-pipeline-20261015"
const stable = "https://aspect-ai-overlord-git-79739a-kimberleyaversbiz-4131s-projects.vercel.app"
const deployment = "https://aspect-ai-overlord-qpzj22iw3-kimberleyaversbiz-4131s-projects.vercel.app"

function request(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { method: "POST", headers })
}

test("configured stable Preview origin is accepted exactly", () => {
  const req = request(stable + "/api/internal/maintenance", { origin: stable })
  assert.equal(requestHasTrustedAppOrigin(req, { NEXTAUTH_URL: stable } as NodeJS.ProcessEnv), true)
})

test("empty PUBLIC_APP_URL does not shadow the valid Preview NEXTAUTH_URL", () => {
  const req = request(stable + "/api/internal/maintenance", { origin: stable })
  assert.equal(requestHasTrustedAppOrigin(req, {
    PUBLIC_APP_URL: "  ",
    NEXTAUTH_URL: stable,
  } as NodeJS.ProcessEnv), true)
  const diagnostics = trustedOriginDiagnostics(req, {
    PUBLIC_APP_URL: "  ",
    NEXTAUTH_URL: stable,
  } as NodeJS.ProcessEnv)
  assert.equal(diagnostics.configuredSource, "NEXTAUTH_URL")
  assert.equal(diagnostics.originHeaderMatchesConfigured, true)
})

test("Vercel immutable deployment origin is accepted only on the exact maintenance Preview branch", () => {
  const req = request(deployment + "/api/internal/maintenance", { origin: deployment })
  const allowedEnv = {
    NEXTAUTH_URL: stable,
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: branch,
    VERCEL_URL: deployment.replace("https://", ""),
    VERCEL_BRANCH_URL: stable.replace("https://", ""),
  } as NodeJS.ProcessEnv
  assert.equal(requestHasTrustedAppOrigin(req, allowedEnv), true)
  assert.equal(requestHasTrustedAppOrigin(req, {
    ...allowedEnv,
    VERCEL_GIT_COMMIT_REF: "feat/another-branch",
  } as NodeJS.ProcessEnv), false)
  assert.equal(requestHasTrustedAppOrigin(req, {
    ...allowedEnv,
    VERCEL_ENV: "production",
  } as NodeJS.ProcessEnv), false)
})

test("missing Origin can use a matching Referer only with same-origin Fetch Metadata", () => {
  const req = request(stable + "/api/internal/maintenance", {
    referer: stable + "/dashboard/maintenance?utm_source=chatgpt.com",
    "sec-fetch-site": "same-origin",
  })
  assert.equal(requestHasTrustedAppOrigin(req, { NEXTAUTH_URL: stable } as NodeJS.ProcessEnv), true)
})

test("missing Origin without same-origin Fetch Metadata fails closed", () => {
  const req = request(stable + "/api/internal/maintenance", {
    referer: stable + "/dashboard/maintenance",
    "sec-fetch-site": "cross-site",
  })
  assert.equal(requestHasTrustedAppOrigin(req, { NEXTAUTH_URL: stable } as NodeJS.ProcessEnv), false)
})

test("a present mismatched Origin is never overridden by a matching Referer", () => {
  const attacker = "https://attacker.example"
  const req = request(stable + "/api/internal/maintenance", {
    origin: attacker,
    referer: stable + "/dashboard/maintenance",
    "sec-fetch-site": "same-origin",
  })
  assert.equal(requestHasTrustedAppOrigin(req, {
    NEXTAUTH_URL: stable,
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: branch,
    VERCEL_URL: deployment.replace("https://", ""),
    VERCEL_BRANCH_URL: stable.replace("https://", ""),
  } as NodeJS.ProcessEnv), false)
})

test("Production trusts only its configured canonical origin, never Vercel Preview hosts", () => {
  const production = "https://www.aspectmarketingsolutions.app"
  const req = request(deployment + "/api/internal/maintenance", { origin: deployment })
  assert.equal(requestHasTrustedAppOrigin(req, {
    NEXTAUTH_URL: production,
    VERCEL_ENV: "production",
    VERCEL_URL: deployment.replace("https://", ""),
    VERCEL_BRANCH_URL: stable.replace("https://", ""),
  } as NodeJS.ProcessEnv), false)
})

test("unparseable, insecure or missing configured origins fail closed", () => {
  const req = request(stable + "/api/internal/maintenance", { origin: stable })
  assert.equal(requestHasTrustedAppOrigin(req, { NEXTAUTH_URL: "not a URL" } as NodeJS.ProcessEnv), false)
  assert.equal(requestHasTrustedAppOrigin(req, { NEXTAUTH_URL: "http://preview.example.org" } as NodeJS.ProcessEnv), false)
  assert.equal(requestHasTrustedAppOrigin(req, {} as NodeJS.ProcessEnv), false)
})
