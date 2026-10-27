import assert from "node:assert/strict";
import test from "node:test";
import { isDedicatedOwnerAuditPilotHost, isPermittedOwnerAuditPilotPath } from "../lib/server/owner-audit-pilot-domain-guard";

const isolatedHost = "aspect-ai-overlord-unique-7c9f.vercel.app";
const branchHost = "aspect-ai-overlord-git-e240cd-kimberleyaversbiz-4131s-projects.vercel.app";
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test", VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "feat/audit-delivery-security-preview-20261023",
  VERCEL_URL: isolatedHost, VERCEL_BRANCH_URL: branchHost,
  AMS_QUICK_AUDIT_PILOT_IMMUTABLE_HOST_GUARD: "true",
};

test("only immutable owner-audit pilot host matches; other preview and Production hosts are untouched", () => {
  assert.equal(isDedicatedOwnerAuditPilotHost(isolatedHost, env), true);
  for (const host of [branchHost, "www.aspectmarketingsolutions.app", "aspectmarketingsolutions.app", "other-preview.vercel.app", `${isolatedHost}.evil.com`]) {
    assert.equal(isDedicatedOwnerAuditPilotHost(host, env), false);
  }
  assert.equal(isDedicatedOwnerAuditPilotHost(isolatedHost, { ...env, VERCEL_ENV: "production" }), false);
  assert.equal(isDedicatedOwnerAuditPilotHost(isolatedHost, { ...env, VERCEL_GIT_COMMIT_REF: "main" }), false);
  assert.equal(isDedicatedOwnerAuditPilotHost(isolatedHost, { ...env, AMS_QUICK_AUDIT_PILOT_IMMUTABLE_HOST_GUARD: "false" }), false);
  assert.equal(isDedicatedOwnerAuditPilotHost(isolatedHost, { ...env, VERCEL_URL: undefined }), false);
  assert.equal(isDedicatedOwnerAuditPilotHost(isolatedHost, { ...env, VERCEL_URL: branchHost }), false);
  assert.equal(isDedicatedOwnerAuditPilotHost(isolatedHost, { ...env, VERCEL_URL: "https://aspect-ai-overlord-unique-7c9f.vercel.app" }), false);
  assert.equal(isDedicatedOwnerAuditPilotHost(isolatedHost, { ...env, VERCEL_URL: "aspect-ai-overlord-unique-7c9f.vercel.app.evil.com" }), false);
});

test("only the exact pilot webhook path is permitted on the isolated host", () => {
  assert.equal(isPermittedOwnerAuditPilotPath("/api/internal/quick-audit-pilot/webhook"), true);
  for (const path of ["/", "/owner", "/dashboard", "/api/webhooks/stripe", "/api/internal/quick-audit-test/checkout", "/api/internal/quick-audit-pilot/webhook/extra", "/api/internal/quick-audit-pilot/webhook/", "/api/auth/session", "/_next/static/chunk.js", "/favicon.ico"]) {
    assert.equal(isPermittedOwnerAuditPilotPath(path), false, path);
  }
});
