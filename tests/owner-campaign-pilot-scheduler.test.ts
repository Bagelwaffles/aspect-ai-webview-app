import assert from "node:assert/strict"
import test from "node:test"
import {
  authorizedOwnerCampaignWorker,
  ownerCampaignAutoSendAllowed,
  ownerCampaignDueAction,
} from "../lib/server/owner-campaign-pilot-scheduler"
import type { OwnerCampaignPilotRecord } from "../lib/server/owner-campaign-pilot"

const env = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  AMS_GMAIL_CONSENT_MODE: "testing",
  AMS_GMAIL_SEND_ENABLED: "true",
  AMS_OWNER_CAMPAIGN_PILOT_ENABLED: "true",
  AMS_OWNER_CAMPAIGN_AUTOSEND_ENABLED: "true",
  AMS_OWNER_CAMPAIGN_WORKER_SECRET: "this-is-a-separate-owner-only-worker-secret-2026",
} as NodeJS.ProcessEnv
const dueAt = new Date(Date.now() - 3600000).toISOString()
const fixture = {
  status: "approved",
  sends: [],
  input: { steps: [{dueAt},{dueAt},{dueAt}] },
} as unknown as OwnerCampaignPilotRecord
test("worker disabled unless every explicit gate is enabled and preview-only", () => {
  assert.equal(ownerCampaignAutoSendAllowed(env),true)
  assert.equal(ownerCampaignAutoSendAllowed({...env,VERCEL_ENV:"production"}),false)
  assert.equal(ownerCampaignAutoSendAllowed({...env,AMS_OWNER_CAMPAIGN_AUTOSEND_ENABLED:"false"}),false)
  assert.equal(ownerCampaignAutoSendAllowed({...env,AMS_GMAIL_SEND_ENABLED:"false"}),false)
  assert.equal(ownerCampaignAutoSendAllowed({...env,AMS_GMAIL_CONSENT_MODE:"approved-owner-use"}),false)
})
test("worker authentication has an independent long secret",()=>{
  assert.equal(authorizedOwnerCampaignWorker("Bearer "+env.AMS_OWNER_CAMPAIGN_WORKER_SECRET,env),true)
  assert.equal(authorizedOwnerCampaignWorker("Bearer wrong",env),false)
  assert.equal(authorizedOwnerCampaignWorker(null,env),false)
  assert.equal(authorizedOwnerCampaignWorker("Bearer abc",{...env,AMS_OWNER_CAMPAIGN_WORKER_SECRET:"abc"}),false)
  assert.equal(authorizedOwnerCampaignWorker("Bearer "+env.AMS_OWNER_CAMPAIGN_WORKER_SECRET,{...env,VERCEL_ENV:"production"}),false)
})
test("only an approved due pilot can be sent",()=>{
  assert.equal(ownerCampaignDueAction(fixture,Date.now()),"send")
  assert.equal(ownerCampaignDueAction({...fixture,status:"stopped"},Date.now()),"skip")
  assert.equal(ownerCampaignDueAction({...fixture,status:"draft"},Date.now()),"skip")
  assert.equal(ownerCampaignDueAction({...fixture,input:{...fixture.input,steps:fixture.input.steps.map(s=>({...s,dueAt:new Date(Date.now()+86400000).toISOString()}))} as never},Date.now()),"not_due")
})
test("ambiguous send holds; accepted requires receipt; completed sends stop",()=>{
  const s=(state:"accepted"|"unconfirmed"|"delivered",step:number)=>({state,step,at:dueAt,providerId:state==="accepted"?"mail-id":null}) as OwnerCampaignPilotRecord["sends"][number]
  assert.equal(ownerCampaignDueAction({...fixture,sends:[s("unconfirmed",0)]},Date.now()),"hold")
  assert.equal(ownerCampaignDueAction({...fixture,sends:[s("accepted",0)]},Date.now()),"verify")
  assert.equal(ownerCampaignDueAction({...fixture,sends:[s("delivered",0)]},Date.now()),"send")
  assert.equal(ownerCampaignDueAction({...fixture,sends:[s("delivered",0),s("delivered",1),s("delivered",2)]},Date.now()),"complete")
})

test("bounded scheduler scans only approved owner namespace and never contacts provider for future steps", async () => {
  const {createHash}=await import("node:crypto")
  const {tickOwnerCampaignPilot}=await import("../lib/server/owner-campaign-pilot-scheduler")
  const {createOwnerCampaignPilot,changeOwnerCampaignPilot}=await import("../lib/server/owner-campaign-pilot")
  const start=Date.parse("2026-10-19T20:00:00Z")
  const ownerEnv: NodeJS.ProcessEnv={...env,AMS_OWNER_EMAIL:"owner@example.com",
    AMS_GMAIL_PRIMARY_EMAIL:"primary@example.com",AMS_GMAIL_SECONDARY_EMAIL:"secondary@example.com",
    AMS_GMAIL_CLIENT_ID:"fixture-client",AMS_GMAIL_CLIENT_SECRET:"fixture-secret",
    AMS_CONNECTION_ENCRYPTION_KEY:Buffer.alloc(32,3).toString("base64"),
    PUBLIC_APP_URL:"https://ams-preview.example.com"}
  const prefix="ams:owner-gmail:v1:"+createHash("sha256").update("owner@example.com").digest("hex")+":"
  const records=new Map<string,string>()
  const redis={
    async get<T>(k:string){return (records.get(k)??null) as T|null},
    async set(k:string,v:string){records.set(k,v);return "OK"},
    async eval(script:string,keys:string[],args:string[]){
      if(script.includes("SCAN"))return ["0",[...records.keys()].filter(k=>k.startsWith(prefix+"campaign-pilot:v1:"))]
      const current=records.get(keys[0]);if(!current)return 0
      if(JSON.parse(current).revision!==Number(args[0]))return 0
      records.set(keys[0],args[1]);return 1
    },
  }
  let calls=0
  const ctx={env:ownerEnv,redis,now:start,fetcher:(async()=>{calls++;throw new Error("MUST_NOT_FETCH")}) as typeof fetch}
  const id="11111111-1111-4111-8111-111111111111"
  const sourceRunId="content-run-22222222-2222-4222-8222-222222222222"
  const base={id,sourceRunId,recipient:"primary@example.com",
    steps:[1,2,3].map(n=>({subject:"Owner test stage "+n,body:"This owner-only test is not a customer email.",
      dueAt:new Date(start+n*86400000).toISOString()}))}
  await createOwnerCampaignPilot(base,ctx)
  await changeOwnerCampaignPilot(id,"approve",ctx)
  const result=await tickOwnerCampaignPilot(ctx)
  assert.equal(result.status,"ok");assert.equal(result.checked,1);assert.equal(result.processed,0)
  assert.equal(calls,0)
  await changeOwnerCampaignPilot(id,"stop",ctx)
  const again=await tickOwnerCampaignPilot(ctx)
  assert.equal(again.processed,0);assert.equal(calls,0)
})

test("scheduled route is disabled by default, rejects bad bearer, and does not touch Gmail", async t => {
  const {NextRequest}=await import("next/server")
  const previous=Object.fromEntries(["VERCEL_ENV","AMS_GMAIL_CONSENT_MODE","AMS_GMAIL_SEND_ENABLED",
    "AMS_OWNER_CAMPAIGN_PILOT_ENABLED","AMS_OWNER_CAMPAIGN_AUTOSEND_ENABLED",
    "AMS_OWNER_CAMPAIGN_WORKER_SECRET"].map(k=>[k,process.env[k]]))
  t.after(()=>{for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v}})
  let called=0
  t.mock.method(globalThis,"fetch",async()=>{called++;throw new Error("NO_NETWORK")})
  const {POST}=await import("../app/api/internal/owner-campaign-pilot/tick/route")
  const req=(auth?:string)=>new NextRequest("https://preview.example.com/api/internal/owner-campaign-pilot/tick",{
    method:"POST",headers:auth?{authorization:auth}:{},
  })
  Object.assign(process.env,env,{AMS_OWNER_CAMPAIGN_AUTOSEND_ENABLED:"false"})
  assert.equal((await POST(req())).status,503)
  Object.assign(process.env,env)
  assert.equal((await POST(req())).status,401)
  assert.equal((await POST(req("Bearer invalid"))).status,401)
  process.env.VERCEL_ENV="production"
  assert.equal((await POST(req("Bearer "+env.AMS_OWNER_CAMPAIGN_WORKER_SECRET))).status,404)
  assert.equal(called,0)
})

test("reviewed campaigns need a separate per-campaign autosend grant before the worker can act",async()=>{
  const {createHash}=await import("node:crypto")
  const {createOwnerCampaignPilot,changeOwnerCampaignPilot}=await import("../lib/server/owner-campaign-pilot")
  const {authorizeOwnerPilotAutosend,tickOwnerCampaignPilot}=await import("../lib/server/owner-campaign-pilot-scheduler")
  const now=Date.parse("2026-10-19T22:00:00Z")
  const owner="owner@example.com"
  const p="ams:owner-gmail:v1:"+createHash("sha256").update(owner).digest("hex")+":"
  const env2:NodeJS.ProcessEnv={...env,AMS_OWNER_EMAIL:owner,
    AMS_GMAIL_PRIMARY_EMAIL:"primary@example.com",AMS_GMAIL_SECONDARY_EMAIL:"secondary@example.com",
    AMS_CONNECTION_ENCRYPTION_KEY:Buffer.alloc(32,4).toString("base64"),
    AMS_GMAIL_CLIENT_ID:"client",AMS_GMAIL_CLIENT_SECRET:"secret",PUBLIC_APP_URL:"https://preview.example.com"}
  const records=new Map<string,string>()
  let oauthCalls=0
  const redis={
    async get<T>(key:string){return (records.get(key)??null) as T|null},
    async set(key:string,value:string,opts?:{nx?:boolean;ex?:number}){if(opts?.nx&&records.has(key))return null;records.set(key,value);return "OK"},
    async eval(script:string,keys:string[],args:string[]){
      if(script.includes("SCAN")) return ["0",[...records.keys()].filter(k=>k.startsWith(p+"campaign-pilot:v1:"))]
      const v=records.get(keys[0]);if(!v)return 0
      if(JSON.parse(v).revision!==Number(args[0]))return 0
      records.set(keys[0],args[1]);return 1
    },
  }
  const ctx={env:env2,redis,now,fetcher:(async()=>{oauthCalls++;throw new Error("NO_GMAIL")}) as typeof fetch}
  const id="33333333-3333-4333-8333-333333333333"
  const input={id,sourceRunId:"content-run-22222222-2222-4222-8222-222222222222",
    recipient:"primary@example.com",steps:[1,2,3].map(n=>({
      subject:"Step "+n+" owner only",body:"No user mailing list authorized.",
      dueAt:new Date(now+n*86400000).toISOString(),
    })) as [never,never,never]}
  await createOwnerCampaignPilot(input,ctx)
  await assert.rejects(authorizeOwnerPilotAutosend(id,ctx),/REVIEW_REQUIRED/)
  await changeOwnerCampaignPilot(id,"approve",ctx)
  assert.equal((await tickOwnerCampaignPilot(ctx)).checked,1)
  assert.equal((await tickOwnerCampaignPilot(ctx)).processed,0)
  assert.equal(oauthCalls,0)
  assert.deepEqual(await authorizeOwnerPilotAutosend(id,ctx),{authorized:true})
  assert.deepEqual(await authorizeOwnerPilotAutosend(id,ctx),{authorized:true})
  // This schedule is still in the future. No unsolicited email is sent.
  assert.equal((await tickOwnerCampaignPilot(ctx)).processed,0)
  await changeOwnerCampaignPilot(id,"stop",ctx)
  await assert.rejects(authorizeOwnerPilotAutosend(id,ctx),/REVIEW_REQUIRED/)
  assert.equal((await tickOwnerCampaignPilot(ctx)).processed,0)
  assert.equal(oauthCalls,0)
})

