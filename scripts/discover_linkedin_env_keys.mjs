const token=process.env.VERCEL_TOKEN
const teamId=process.env.VERCEL_ORG_ID
const projectId=process.env.VERCEL_PROJECT_ID
if(!token||!teamId||!projectId) throw new Error("Missing Vercel discovery context")
const u=new URL("https://api.vercel.com/v10/projects/"+projectId+"/env")
u.searchParams.set("teamId",teamId)
const r=await fetch(u,{headers:{authorization:"Bearer "+token}})
if(!r.ok) throw new Error("Vercel env lookup failed with HTTP "+r.status)
const body=await r.json()
const envs=Array.isArray(body.envs)?body.envs:[]
const keys=envs
  .filter((e)=>typeof e?.key==="string" && /LINKEDIN/i.test(e.key))
  .map((e)=>({key:e.key,target:e.target,type:e.type}))
  .sort((a,b)=>a.key.localeCompare(b.key))
console.log(JSON.stringify({linkedinEnvKeys:keys},null,2))

// rerun marker 2026-09-21T19:17
