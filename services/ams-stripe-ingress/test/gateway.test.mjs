import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { SANDBOX_ACCOUNT, SESSION_ID, configReady, windowOpen, auditHandoffWindowOpen, verifySignature, receive } from '../lib/gateway.js'

const nowMs = Date.UTC(2026,9,25,23,45,0)
const secret = 'whsec_'+'x'.repeat(44)
const env = {
  VERCEL_ENV:'preview', AMS_GATEWAY_INTAKE_ENABLED:'true',
  AMS_GATEWAY_INTAKE_UNTIL: new Date(nowMs+4*60_000).toISOString(),
  AMS_GATEWAY_ACCOUNT_ID:SANDBOX_ACCOUNT, AMS_GATEWAY_SESSION_ID:SESSION_ID,
  AMS_GATEWAY_WEBHOOK_SECRET:secret, AMS_GATEWAY_REDIS_REST_TOKEN:'ci-placeholder-not-real',
  AMS_GATEWAY_REDIS_REST_URL:'https://internal-chicken-238070.upstash.io',
  AMS_GATEWAY_REDIS_NAMESPACE:'ams:preview:stripe-gateway:pr300:',
}
const event = {id:'evt_abcdefghij123456',type:'checkout.session.completed',livemode:false,account:SANDBOX_ACCOUNT,
  data:{object:{object:'checkout.session',id:SESSION_ID,livemode:false,mode:'payment',payment_status:'paid',amount_total:4900,currency:'usd'}}}
const body = JSON.stringify(event)
const signature = (payload=body,timestamp=Math.floor(nowMs/1000)) => 't='+timestamp+',v1='+createHmac('sha256',secret).update(String(timestamp)+'.'+payload).digest('hex')
const req = (payload=body,header=signature(payload),path='/api/stripe-webhook') => new Request('https://isolated-ams.example'+path,
  { method:'POST',headers:{'content-type':'application/json','stripe-signature':header},body:payload })
const mockStore=()=>{const map=new Map();return async (_url,init)=>{const [cmd,key,val]=JSON.parse(init.body);let result=null;
 if(cmd==='SET'&&!map.has(key)){map.set(key,val);result='OK'}
 if(cmd==='GET')result=map.get(key)??null
 return new Response(JSON.stringify({result}),{status:200,headers:{'Content-Type':'application/json'}})
}}

test('inactive in production, no intake, expired or >10 minutes',()=>{
 assert.equal(windowOpen(env,nowMs),true)
 for(const patch of [{VERCEL_ENV:'production'},{AMS_GATEWAY_INTAKE_ENABLED:'false'},
  {AMS_GATEWAY_INTAKE_UNTIL:new Date(nowMs-1).toISOString()},
  {AMS_GATEWAY_INTAKE_UNTIL:new Date(nowMs+600001).toISOString()},
  {AMS_GATEWAY_ACCOUNT_ID:'acct_bad'},{AMS_GATEWAY_SESSION_ID:'cs_test_other'}])
  assert.equal(windowOpen({...env,...patch},nowMs),false)
})
test('isolated Upstash host and scoped namespace are mandatory',()=>{
 assert.equal(configReady(env),true)
 for (const patch of [{AMS_GATEWAY_REDIS_REST_URL:'https://wrong.upstash.io'},
  {AMS_GATEWAY_REDIS_REST_URL:'http://internal-chicken-238070.upstash.io'},
  {AMS_GATEWAY_REDIS_NAMESPACE:'ams:other:'},{AMS_GATEWAY_REDIS_REST_TOKEN:''},
  {AMS_GATEWAY_WEBHOOK_SECRET:'bad'}]) assert.equal(configReady({...env,...patch}),false)
})
test('signature verifies raw bytes and timestamp, not reconstructed JSON',()=>{
 assert.equal(verifySignature(Buffer.from(body),signature(),secret,Math.floor(nowMs/1000)),true)
 assert.equal(verifySignature(Buffer.from(body+' '),signature(),secret,Math.floor(nowMs/1000)),false)
 assert.equal(verifySignature(Buffer.from(body),signature(body,Math.floor(nowMs/1000)-301),secret,Math.floor(nowMs/1000)),false)
 assert.equal(verifySignature(Buffer.from(body),'t=blah,v1=bad',secret,Math.floor(nowMs/1000)),false)
})
test('closed or unsigned ingress cannot write a receipt',async()=>{
 let calls=0;const never=async()=>{calls++;throw Error('unexpected')}
 assert.equal((await receive(req(),{env:{...env,AMS_GATEWAY_INTAKE_ENABLED:'false'},nowMs,fetchFn:never})).status,503)
 assert.equal((await receive(req(body,'bad'),{env,nowMs,fetchFn:never})).status,400)
 assert.equal((await receive(req(body,signature(),'/api/stripe-webhook?x=1'),{env,nowMs,fetchFn:never})).status,404)
 assert.equal(calls,0)
})
test('valid signed single $49 checkout creates exactly one durable receipt but never fulfills',async()=>{
 const store=mockStore()
 const first=await receive(req(),{env,nowMs,fetchFn:store})
 assert.equal(first.status,503)
 assert.equal((await first.json()).receiptRecorded,true)
 const duplicate=await receive(req(),{env,nowMs,fetchFn:store})
 assert.equal(duplicate.status,503)
 assert.equal((await duplicate.json()).duplicate,true)
})
test('wrong checkout, live event and event type cannot persist',async()=>{
 let calls=0;const never=async()=>{calls++;throw Error('unexpected')}
 for(const change of [{type:'payment_intent.succeeded'}, {livemode:true},
   {data:{object:{...event.data.object,amount_total:5000}}},
   {data:{object:{...event.data.object,id:'cs_test_another'}}}]){
   const modified=JSON.stringify({...event,...change})
   assert.equal((await receive(req(modified,signature(modified)),{env,nowMs,fetchFn:never})).status,403)
 }
 assert.equal(calls,0)
})


test('new metadata-complete owner TEST Checkout can write only a signed handoff receipt; historical receipt remains ineligible', async () => {
 const auditenv={...env,AMS_GATEWAY_AUDIT_HANDOFF_ENABLED:'true',AMS_GATEWAY_SESSION_ID:'cs_test_NEWownercheckout123456789',
   AMS_GATEWAY_AUDIT_RUN_ID:'audit-acceptance-owner-20261027',AMS_GATEWAY_AUDIT_OWNER_EMAIL:'owner@example.com'}
 assert.equal(windowOpen(auditenv,nowMs),false)
 assert.equal(auditHandoffWindowOpen(auditenv,nowMs),true)
 const data={...event,data:{object:{...event.data.object,id:auditenv.AMS_GATEWAY_SESSION_ID,status:'complete',
   customer_details:{email:'owner@example.com'},
   metadata:{ams_offer:'quick-marketing-audit',ams_preview_run_id:auditenv.AMS_GATEWAY_AUDIT_RUN_ID,
     ams_request_id:'quick-audit-'+'a'.repeat(32),ams_business_name:'Aspect Marketing Solutions',
     ams_website_url:'https://www.aspectmarketingsolutions.app',ams_industry:'Marketing automation',
     ams_goals:'Check real paid TEST fulfillment and branded owner-only report delivery'}}}}
 const signed=JSON.stringify(data),store=mockStore()
 const resp=await receive(req(signed,signature(signed)),{env:auditenv,nowMs,fetchFn:store})
 assert.equal(resp.status,503)
 assert.equal((await resp.json()).receiptRecorded,true)
 const r=await receive(req(signed,signature(signed)),{env:auditenv,nowMs,fetchFn:store})
 assert.equal((await r.json()).duplicate,true)
 const key=auditenv.AMS_GATEWAY_REDIS_NAMESPACE+'event:'+data.id
 const raw=await store('https://ignored',{body:JSON.stringify(['GET',key])})
 const receipt=JSON.parse((await raw.json()).result)
 assert.equal(receipt.kind,'signed-owner-audit-v1')
 assert.equal(receipt.account,SANDBOX_ACCOUNT)
 assert.equal(receipt.checkoutSessionId,auditenv.AMS_GATEWAY_SESSION_ID)
 assert.equal(receipt.runId,auditenv.AMS_GATEWAY_AUDIT_RUN_ID)
 assert.equal(receipt.requestId,data.data.object.metadata.ams_request_id)
 assert.equal(JSON.stringify(receipt).includes('owner@example.com'),false)
 assert.equal(JSON.stringify(receipt).includes('whsec_'),false)
 for(const change of [
  {AMS_GATEWAY_AUDIT_HANDOFF_ENABLED:'false'}, {AMS_GATEWAY_AUDIT_RUN_ID:'bad'},
  {AMS_GATEWAY_SESSION_ID:SESSION_ID}, {AMS_GATEWAY_INTAKE_UNTIL:new Date(nowMs+11*60_000).toISOString()},
  {VERCEL_ENV:'production'},{AMS_GATEWAY_AUDIT_OWNER_EMAIL:''}
 ]) assert.equal(auditHandoffWindowOpen({...auditenv,...change},nowMs),false,JSON.stringify(change))
})

test('owner audit handoff rejects wrong metadata/session/owner without any datastore writes',async()=>{
 const auditenv={...env,AMS_GATEWAY_AUDIT_HANDOFF_ENABLED:'true',AMS_GATEWAY_SESSION_ID:'cs_test_NEWownercheckout123456789',
   AMS_GATEWAY_AUDIT_RUN_ID:'audit-acceptance-owner-20261027',AMS_GATEWAY_AUDIT_OWNER_EMAIL:'owner@example.com'}
 let writes=0;const never=async()=>{writes++;throw Error('unexpected write')}
 const metadata={ams_offer:'quick-marketing-audit',ams_preview_run_id:auditenv.AMS_GATEWAY_AUDIT_RUN_ID,
    ams_request_id:'quick-audit-'+'b'.repeat(32),ams_business_name:'Aspect Marketing Solutions',
    ams_website_url:'https://www.aspectmarketingsolutions.app',ams_industry:'Marketing automation',
    ams_goals:'Check real paid TEST fulfillment and branded owner-only report delivery'}
 const base={...event,data:{object:{...event.data.object,id:auditenv.AMS_GATEWAY_SESSION_ID,status:'complete',
     customer_details:{email:'owner@example.com'},metadata}}}
 for(const diff of [
  {data:{object:{...base.data.object,metadata:{...metadata,ams_offer:'something-else'}}}},
  {data:{object:{...base.data.object,metadata:{...metadata,ams_preview_run_id:'other-run'}}}},
  {data:{object:{...base.data.object,customer_details:{email:'unrelated@example.net'}}}},
  {data:{object:{...base.data.object,id:SESSION_ID}}},
  {data:{object:{...base.data.object,status:'open'}}},
  {data:{object:{...base.data.object,metadata:{...metadata,ams_request_id:'bad-id'}}}},
  {livemode:true},
 ]) {
  const raw=JSON.stringify({...base,...diff})
  const r=await receive(req(raw,signature(raw)),{env:auditenv,nowMs,fetchFn:never})
  assert.equal(r.status,403,JSON.stringify(diff).slice(0,200))
 }
 assert.equal(writes,0)
})


test('only matching owner-certified durable audit+outbox ack permits Stripe signed retry HTTP 200',async()=>{
 const auditenv={...env,AMS_GATEWAY_AUDIT_HANDOFF_ENABLED:'true',
   AMS_GATEWAY_SESSION_ID:'cs_test_ACKownercheckout123456789',
   AMS_GATEWAY_AUDIT_RUN_ID:'audit-acceptance-owner-20261027',
   AMS_GATEWAY_AUDIT_OWNER_EMAIL:'owner@example.com'}
 const metadata={ams_offer:'quick-marketing-audit',ams_preview_run_id:auditenv.AMS_GATEWAY_AUDIT_RUN_ID,
   ams_request_id:'quick-audit-'+'f'.repeat(32),
   ams_business_name:'Aspect Marketing Solutions',
   ams_website_url:'https://www.aspectmarketingsolutions.app',
   ams_industry:'Marketing automation',
   ams_goals:'Check real paid TEST fulfillment and branded owner-only report delivery'}
 const testEvent={...event,data:{object:{...event.data.object,
   id:auditenv.AMS_GATEWAY_SESSION_ID,status:'complete',
   customer_details:{email:'owner@example.com'},metadata}}}
 const signed=JSON.stringify(testEvent)
 const r=req(signed,signature(signed))
 const store=mockStore()
 const first=await receive(r,{env:auditenv,nowMs,fetchFn:store})
 assert.equal(first.status,503)
 const key=auditenv.AMS_GATEWAY_REDIS_NAMESPACE+'event:'+testEvent.id
 const persisted=await store('https://fixture',{body:JSON.stringify(['GET',key])})
 const receipt=JSON.parse((await persisted.json()).result)
 const ackKey=auditenv.AMS_GATEWAY_REDIS_NAMESPACE+'ack:'+testEvent.id
 const ack={kind:'paid-owner-audit-queued-v1',eventId:testEvent.id,
   sessionId:auditenv.AMS_GATEWAY_SESSION_ID,runId:auditenv.AMS_GATEWAY_AUDIT_RUN_ID,
   requestId:metadata.ams_request_id,digest:receipt.digest,auditId:'audit_1234567890',
   recordedAt:new Date(nowMs).toISOString()}
 // Incomplete or incorrect owner attestation must never make Stripe believe
 // that receiving a receipt alone finished the audit.
 const wrongStore=mockStore()
 await receive(req(signed,signature(signed)),{env:auditenv,nowMs,fetchFn:wrongStore})
 await wrongStore('https://fixture',{body:JSON.stringify(['SET',ackKey,JSON.stringify({...ack,digest:'b'.repeat(64)})])})
 const rejected=await receive(req(signed,signature(signed)),{env:auditenv,nowMs,fetchFn:wrongStore})
 assert.equal(rejected.status,503)
 const stillPending=await receive(req(signed,signature(signed)),{env:auditenv,nowMs,fetchFn:store})
 assert.equal(stillPending.status,503)
 await store('https://fixture',{body:JSON.stringify(['SET',ackKey,JSON.stringify(ack)])})
 const approved=await receive(req(signed,signature(signed)),{env:auditenv,nowMs,fetchFn:store})
 const response=await approved.json()
 assert.equal(approved.status,200)
 assert.equal(response.ok,true)
 assert.equal(response.code,'PILOT_PAID_AUDIT_QUEUED_ACKNOWLEDGED')
 assert.equal(response.fulfillmentEnabled,false)
 assert.equal(response.sendEnabled,false)
 assert.equal((await receive(req(signed,'incorrect'),{env:auditenv,nowMs,fetchFn:store})).status,400)
})
