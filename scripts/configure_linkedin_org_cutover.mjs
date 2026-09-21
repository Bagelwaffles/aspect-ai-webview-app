import { writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

const required = ["VERCEL_TOKEN","VERCEL_ORG_ID","VERCEL_PROJECT_ID","CURRENT_PRODUCTION_DEPLOYMENT_ID"]
for (const name of required) {
  if (!process.env[name]) throw new Error("Missing required cutover context: " + name)
}

const token=process.env.VERCEL_TOKEN
const teamId=process.env.VERCEL_ORG_ID
const projectId=process.env.VERCEL_PROJECT_ID
const deploymentId=process.env.CURRENT_PRODUCTION_DEPLOYMENT_ID
const headers={authorization:"Bearer "+token}

const desired={
  AMS_LINKEDIN_AUTHOR_URN:"urn:li:organization:145213077",
  AMS_LINKEDIN_API_VERSION:"202608",
  AMS_LINKEDIN_CONNECTION_GENERATION:"ams-linkedin-org-pending-oauth-2026-09",
}

function isProduction(record){
  const t=record?.target
  return Array.isArray(t)?t.includes("production"):t==="production"
}

async function getEnvList(){
  const u=new URL("https://api.vercel.com/v10/projects/"+projectId+"/env")
  u.searchParams.set("teamId",teamId)
  const r=await fetch(u,{headers})
  if(!r.ok) throw new Error("Vercel env lookup failed with HTTP "+r.status)
  const body=await r.json()
  return Array.isArray(body.envs)?body.envs:[]
}

async function upsert(key,value){
  const u=new URL("https://api.vercel.com/v10/projects/"+projectId+"/env")
  u.searchParams.set("teamId",teamId)
  u.searchParams.set("upsert","true")
  const r=await fetch(u,{
    method:"POST",
    headers:{...headers,"content-type":"application/json"},
    body:JSON.stringify([{
      key,
      value,
      type:"plain",
      target:["production"],
      comment:"AMS LinkedIn organization-only cutover; publishing stays fail-closed pending fresh OAuth",
    }]),
  })
  if(!r.ok) throw new Error(key+" upsert failed with HTTP "+r.status)
}

const before=await getEnvList()
const tokenRecord=before.find((e)=>e?.key==="AMS_LINKEDIN_ACCESS_TOKEN"&&isProduction(e))??null
const changed=[]

for(const [key,value] of Object.entries(desired)){
  const record=before.find((e)=>e?.key===key&&isProduction(e))??null
  const current=typeof record?.value==="string"?record.value:""
  if(current!==value){
    await upsert(key,value)
    changed.push(key)
  }
}

const after=await getEnvList()
for(const [key,value] of Object.entries(desired)){
  const record=after.find((e)=>e?.key===key&&isProduction(e))??null
  if(!record) throw new Error(key+" missing after cutover")
  if(typeof record.value==="string" && record.value && record.value!=="[SENSITIVE]" && record.value!==value){
    throw new Error(key+" has unexpected value after cutover")
  }
}

let redeployed=false
if(changed.length>0){
  execFileSync("npx",[
    "--yes","vercel@latest","redeploy",deploymentId,
    "--non-interactive","--token",token
  ],{
    stdio:["ignore","pipe","pipe"],
    env:{...process.env,VERCEL_ORG_ID:teamId,VERCEL_PROJECT_ID:projectId},
  })
  redeployed=true
}

const result={
  organizationId:"145213077",
  authorUrn:desired.AMS_LINKEDIN_AUTHOR_URN,
  apiVersion:desired.AMS_LINKEDIN_API_VERSION,
  generation:desired.AMS_LINKEDIN_CONNECTION_GENERATION,
  accessTokenPresent:Boolean(tokenRecord),
  accessTokenType:tokenRecord?.type??null,
  changedKeys:changed,
  productionRedeployed:redeployed,
}
writeFileSync("linkedin-cutover-result.json",JSON.stringify(result,null,2))
console.log("LinkedIn organization cutover values configured for Production.")
console.log("Access token present: "+(result.accessTokenPresent?"yes":"no"))
console.log("Production redeployed: "+(redeployed?"yes":"no"))
