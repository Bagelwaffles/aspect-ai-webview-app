import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { SANDBOX_ACCOUNT, SESSION_ID, configReady, windowOpen, verifySignature, receive } from '../lib/gateway.js'

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
