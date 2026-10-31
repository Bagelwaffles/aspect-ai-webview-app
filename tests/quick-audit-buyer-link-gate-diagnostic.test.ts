import assert from "node:assert/strict"
import test from "node:test"
import { inspectBuyerLinkGate, buyerLinkRehearsalEnvironment } from "../lib/server/quick-audit-buyer-link-gate-diagnostic"
const now = Date.parse("2026-10-31T00:00:00Z")
const base = {
 VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/ams-audit-buyer-link-integration-20261029",
 AMS_STRIPE_PILOT_ACCOUNT_ID: "acct_1UTtFMGuhFCl8JHa", AMS_OWNER_EMAIL: "owner@example.com",
 AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "owner@example.com", AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED: "true",
 AMS_QUICK_AUDIT_PILOT_BUYER_RESULT_ENABLED: "true", AMS_STRIPE_PILOT_TEST_SECRET_KEY: "sk_test_synthetic_only",
}
test("rehearsal does not mutate actual flags or windows", () => {
 const before = JSON.stringify(base); const armed=buyerLinkRehearsalEnvironment(base,now)
 assert.equal(inspectBuyerLinkGate(armed,{ready:true,code:"PILOT_DISPATCH_ARMED"},now).ready,true)
 assert.equal(JSON.stringify(base),before)
 assert.equal(inspectBuyerLinkGate(base,{ready:false,code:"PILOT_DISPATCH_DISABLED"},now).ready,false)
})
test("both expiries reject absent, expired and overlong windows", () => {
 for(const name of ["AMS_QUICK_AUDIT_PILOT_DISPATCH_UNTIL","AMS_QUICK_AUDIT_BUYER_DISPATCH_UNTIL"]) {
  for(const value of [undefined,new Date(now).toISOString(),new Date(now+600001).toISOString()]) {
   const env={...buyerLinkRehearsalEnvironment(base,now),[name]:value}
   assert.equal(inspectBuyerLinkGate(env,{ready:true,code:"PILOT_DISPATCH_ARMED"},now).ready,false)
  }
 }
})
test("no key or recipient leaks in output and restricted TEST format is diagnosed", () => {
 const env=buyerLinkRehearsalEnvironment({...base,AMS_STRIPE_PILOT_TEST_SECRET_KEY:"rk_test_synthetic_private"},now)
 const result=inspectBuyerLinkGate(env,{ready:true,code:"PILOT_DISPATCH_ARMED"},now)
 assert.equal(result.stripeKeyKind,"restricted-test")
 assert.equal(result.checks.stripeTestKeyAccepted,false)
 assert.ok(!JSON.stringify(result).includes("synthetic_private"))
 assert.ok(!JSON.stringify(result).includes("owner@example.com"))
})
test("wrong branch, owner, live key, public checkout or unisolated pilot fails", () => {
 for(const patch of [{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},{AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL:"other@example.com"},{AMS_STRIPE_PILOT_TEST_SECRET_KEY:"sk_live_synthetic"},{AMS_STRIPE_PILOT_CHECKOUT_ENABLED:"true"}]) {
  assert.equal(inspectBuyerLinkGate(buyerLinkRehearsalEnvironment({...base,...patch},now),{ready:true,code:"PILOT_DISPATCH_ARMED"},now).ready,false)
 }
 assert.equal(inspectBuyerLinkGate(buyerLinkRehearsalEnvironment(base,now),{ready:false,code:"PILOT_STORAGE_NOT_ISOLATED"},now).ready,false)
})
