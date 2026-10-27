import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { NextRequest } from "next/server"
import type Stripe from "stripe"
import { createOwnerSignedReceiptHandoff, ownerSignedReceiptHandoffReady } from "../lib/server/quick-audit-owner-signed-receipt-handoff"
import { AMS_PILOT_STRIPE_ACCOUNT } from "../lib/server/quick-audit-isolated-stripe-pilot"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"
import type { createIsolatedPilotStores } from "../lib/server/quick-audit-isolated-pilot-stores"
import type { QuickAuditRecord } from "../lib/server/quick-audit-fulfillment"

const now = Date.parse("2026-10-27T21:45:00Z")
const eventId = "evt_1234567890ownercheckout"
const sessionId = "cs_test_1234567890ownercheckout"
const runId = "owner-acceptance-20261027"
const recipient = "owner@example.com"
const price = "price_1234567890"
const requestId = "quick-audit-" + createHash("sha256").update(AMS_PILOT_STRIPE_ACCOUNT + ":" + runId).digest("hex").slice(0, 32)
const metadata = { ams_offer:"quick-marketing-audit",ams_preview_run_id:runId,ams_request_id:requestId,
  ams_business_name:"Aspect Marketing Solutions",ams_website_url:"https://www.aspectmarketingsolutions.app",
  ams_industry:"Marketing automation",ams_goals:"Check real paid TEST fulfillment and branded owner-only report delivery" }
const paid = { id:sessionId,object:"checkout.session",livemode:false,mode:"payment",status:"complete",
  payment_status:"paid",amount_total:4900,currency:"usd",metadata,customer_details:{email:recipient} }
const event = { id:eventId,object:"event",type:"checkout.session.completed",livemode:false,data:{object:paid} }
const env: NodeJS.ProcessEnv = {
  NODE_ENV:"test",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:RESEND_PREVIEW_BRANCH,
  AMS_STRIPE_PILOT_ACCOUNT_ID:AMS_PILOT_STRIPE_ACCOUNT,
  AMS_STRIPE_PILOT_REDIS_REST_URL:"https://isolated-owner-handoff-123.upstash.io",
  AMS_STRIPE_PILOT_REDIS_REST_TOKEN:"synthetic-no-network",
  AMS_STRIPE_PILOT_REDIS_NAMESPACE:"ams:preview:stripe-pilot:owner-handoff:",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL:"https://accepted-quetzal-206056.upstash.io",
  AMS_STRIPE_PILOT_TEST_SECRET_KEY:"sk_test_synthetic_no_network",
  AMS_STRIPE_PILOT_WEBHOOK_SECRET:"whsec_synthetic_1234567890_owner_only",
  AMS_STRIPE_PILOT_PRICE_ID:price,AMS_STRIPE_PILOT_FULFILLMENT_ENABLED:"true",
  AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED:"true",AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED:"false",
  AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED:"false",AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED:"false",
  AMS_STRIPE_PILOT_CHECKOUT_ENABLED:"false",AMS_STRIPE_PILOT_HANDOFF_ENABLED:"true",
  AMS_STRIPE_PILOT_HANDOFF_UNTIL:new Date(now+4*60_000).toISOString(),
  AMS_STRIPE_PILOT_CHECKOUT_RUN_ID:runId,AMS_STRIPE_PILOT_APPROVED_SESSION_ID:sessionId,
  AMS_OWNER_EMAIL:recipient,AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL:recipient,
}
const receipt = {kind:"signed-owner-audit-v1",id:eventId,type:"checkout.session.completed",
  account:AMS_PILOT_STRIPE_ACCOUNT,livemode:false,digest:"a".repeat(64),
  checkoutSessionId:sessionId,requestId,runId,recordedAt:new Date(now-60_000).toISOString()}
const request = (body:unknown={eventId}) => new NextRequest("https://example.com/api/internal/quick-audit-owner-signed-handoff",
  {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
function fixture(options:{
  receipt?:unknown;paid?:Record<string,unknown>;event?:Record<string,unknown>;
  env?:Partial<NodeJS.ProcessEnv>;owner?:boolean;
}={}) {
 const calls:string[]=[]
 let completed:QuickAuditRecord|null=null
 let outbox:{auditId:string;requestId:string;checkoutSessionId:string;recipient:string;state:string}|null=null
 const stores={
   eventReceipts:{async get(){calls.push("receipt-read");return options.receipt===undefined?receipt:options.receipt}},
   payment:{
     async reserve(){if(completed)return{state:"duplicate",record:completed};return{state:"reserved",token:"test-claim"}},
     async complete(item:QuickAuditRecord){completed=item},
     async release(){},
   },
   auditGateway:{async run(){calls.push("native-audit");return{auditId:"audit_1234567890"}}},
   outbox:{
     async enqueue(item:{auditId:string;requestId:string;checkoutSessionId:string;recipient:string}){
       calls.push("outbox");outbox={...item,state:"queued"};return outbox},
     async read(){return outbox},
   },
 } as unknown as NonNullable<ReturnType<typeof createIsolatedPilotStores>>
 const stripe={
  accounts:{async retrieve(){calls.push("account");return{id:AMS_PILOT_STRIPE_ACCOUNT}}},
  events:{async retrieve(){calls.push("event");return options.event??event}},
  checkout:{sessions:{
    async retrieve(){calls.push("checkout");return options.paid??paid},
    async listLineItems(){calls.push("items");return{data:[{price:{id:price},quantity:1}],has_more:false}},
  }},
 } as unknown as Stripe
 const handler=createOwnerSignedReceiptHandoff({
  env:{...env,...options.env},now:()=>now,owner:async()=>options.owner!==false,
  makeStripe:()=>stripe,makeStores:()=>stores,evidenceCollector:async()=>({hasPrimaryCta:true}),
 })
 return{handler,calls}
}
test("readiness requires strict Preview, owner, isolation, short window and outbox",()=>{
 assert.equal(ownerSignedReceiptHandoffReady(env,now),true)
 for(const patch of [{VERCEL_ENV:"production"},{AMS_STRIPE_PILOT_HANDOFF_ENABLED:"false"},
  {AMS_STRIPE_PILOT_HANDOFF_UNTIL:new Date(now-1).toISOString()},
  {AMS_STRIPE_PILOT_HANDOFF_UNTIL:new Date(now+11*60_000).toISOString()},
  {AMS_STRIPE_PILOT_CHECKOUT_ENABLED:"true"},{AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED:"true"},
  {AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED:"false"},{AMS_OWNER_EMAIL:"other@example.net"},
  {AMS_STRIPE_PILOT_APPROVED_SESSION_ID:"cs_live_forbidden"}]) {
  assert.equal(ownerSignedReceiptHandoffReady({...env,...patch},now),false,JSON.stringify(patch))
 }
})
test("unauthorized, closed, malformed, nonexistent and old receipt cannot access Stripe",async()=>{
 const unauth=fixture({owner:false});assert.equal((await unauth.handler(request())).status,401);assert.deepEqual(unauth.calls,[])
 const closed=fixture({env:{AMS_STRIPE_PILOT_HANDOFF_ENABLED:"false"}})
 assert.equal((await closed.handler(request())).status,503);assert.deepEqual(closed.calls,[])
 for(const body of [{},{eventId:"bad"},{eventId,live:true}]) {
  const f=fixture();assert.equal((await f.handler(request(body))).status,400);assert.deepEqual(f.calls,[])
 }
 for(const bad of [null,{...receipt,kind:"old-receipt"},{...receipt,runId:"incorrect"},
  {...receipt,checkoutSessionId:"cs_test_other1111111111"},{...receipt,digest:"bad"}]) {
  const f=fixture({receipt:bad})
  assert.ok([403,404].includes((await f.handler(request())).status))
  assert.equal(f.calls.includes("event"),false)
 }
})
test("real-origin receipt and provider event mock drive native audit/outbox once; never email",async()=>{
 const f=fixture()
 const first=await f.handler(request());assert.equal(first.status,200)
 assert.equal((await first.json()).code,"PILOT_PAID_AUDIT_QUEUED")
 const second=await f.handler(request());assert.equal(second.status,200)
 assert.equal((await second.json()).code,"PILOT_PAID_AUDIT_DUPLICATE")
 assert.equal(f.calls.filter(x=>x==="native-audit").length,1)
 assert.equal(f.calls.filter(x=>x==="outbox").length,1)
})
test("unapproved price amount, wrong customer and unrelated event fail before native audit",async()=>{
 for(const changed of [
  {paid:{...paid,amount_total:500}}, {paid:{...paid,customer_details:{email:"someone@example.net"}}},
  {paid:{...paid,metadata:{...metadata,ams_offer:"other"}}},
  {event:{...event,livemode:true}},
  {event:{...event,data:{object:{...paid,id:"cs_test_other123456789"}}}},
 ]){
   const f=fixture(changed)
   assert.equal((await f.handler(request())).status,403)
   assert.equal(f.calls.includes("native-audit"),false)
 }
})
