import { NextRequest } from "next/server"

import { handleAciReferenceGet } from "@/lib/aci/owner-references"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  return handleAciReferenceGet(request)
}
