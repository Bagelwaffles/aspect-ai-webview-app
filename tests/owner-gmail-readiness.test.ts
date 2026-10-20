import assert from "node:assert/strict"
import test from "node:test"
import { ownerGmailPreviewReadiness } from "../lib/server/owner-gmail-readiness"

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test", VERCEL_ENV: "preview",
  AMS_GMAIL_CLIENT_ID: "fixture.apps.googleusercontent.com",
  AMS_GMAIL_CLIENT_SECRET: "private_fixture",
  AMS_GMAIL_PRIMARY_EMAIL: "primary@example.com",
  AMS_GMAIL_SECONDARY_EMAIL: "secondary@example.com",
  AMS_CONNECTION_ENCRYPTION_KEY: "private_encryption_key",
  UPSTASH_REDIS_REST_URL: "https://redis.example.com",
  UPSTASH_REDIS_REST_TOKEN: "private_redis_token",
  AMS_GMAIL_CONSENT_MODE: "testing",
  PUBLIC_APP_URL: "https://aspect-ai-overlord-git-preview.vercel.app",
}
test("Preview preflight reports only missing variable names and never discloses secrets", () => {
  const result = ownerGmailPreviewReadiness({...env, AMS_GMAIL_CLIENT_SECRET:undefined})
  assert.equal(result.readyForOwnerAuthorization,false)
  assert.deepEqual(result.missing,["AMS_GMAIL_CLIENT_SECRET"])
  const output=JSON.stringify(result)
  for(const secret of ["private_fixture", "private_redis_token", "private_encryption_key"]) assert.equal(output.includes(secret),false)
})
test("working config is not a send authorization",()=>{
  const result=ownerGmailPreviewReadiness(env,false)
  assert.equal(result.readyForOwnerAuthorization,true)
  assert.equal(result.ownerGrantConnected,false)
  assert.equal(result.automatedPilotEnabled,false)
  assert.equal(result.primaryCallback,"https://aspect-ai-overlord-git-preview.vercel.app/api/owner/gmail/primary/callback")
})
test("never show owner ready state or callback on production",()=>{
  const result=ownerGmailPreviewReadiness({...env,VERCEL_ENV:"production"},true)
  assert.equal(result.preview,false)
  assert.equal(result.automatedPilotEnabled,false)
  assert.equal(result.primaryCallback,null)
})
test("worker enabling alone does not make an absent grant ready",()=>{
  const result=ownerGmailPreviewReadiness({
    ...env, AMS_GMAIL_SEND_ENABLED:"true",AMS_OWNER_CAMPAIGN_PILOT_ENABLED:"true",
    AMS_OWNER_CAMPAIGN_AUTOSEND_ENABLED:"true",
  },false)
  assert.equal(result.automatedPilotEnabled,false)
})
