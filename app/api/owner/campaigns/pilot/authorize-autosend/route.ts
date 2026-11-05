import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { authorizeOwnerPilotAutosend } from "@/lib/server/owner-campaign-pilot-scheduler"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const input = z.object({
  id: z.string().uuid(),
  confirmation: z.literal("AUTHORIZE_OWNER_ONLY_PREVIEW_SCHEDULE"),
}).strict()

/** Per-campaign opt-in: approved copy by itself never triggers scheduled sends. */
export async function POST(request: NextRequest) {
  const reply=(status:number,body:Record<string,unknown>)=>NextResponse.json(body,{
    status,headers:{"Cache-Control":"no-store"},
  })
  if (process.env.VERCEL_ENV !== "preview") return reply(404,{ok:false})
  const auth = await authorizeOwnerApiRequest(request, {requireTrustedOrigin:true})
  if (!auth.ok) return reply(auth.status,{ok:false,code:auth.code})
  const parsed=input.safeParse(await request.json().catch(()=>null))
  if (!parsed.success) return reply(400,{ok:false,code:"OWNER_AUTOSEND_CONFIRMATION_REQUIRED"})
  try {
    const authorized=await authorizeOwnerPilotAutosend(parsed.data.id)
    return reply(200,{ok:true,...authorized})
  } catch {
    return reply(409,{ok:false,code:"OWNER_AUTOSEND_NOT_READY"})
  }
}
