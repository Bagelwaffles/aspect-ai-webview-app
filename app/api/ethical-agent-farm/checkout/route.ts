import { NextResponse } from "next/server"

import {
  ETHICAL_AGENT_FARM_REQUEST_PATH,
  ONE_TIME_CHECKOUT_DISABLED_CODE,
} from "@/lib/ethical-agent-farm-checkout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      checkoutConfigured: false,
      error: "One-time checkout is disabled for launch",
      code: ONE_TIME_CHECKOUT_DISABLED_CODE,
      requestPath: ETHICAL_AGENT_FARM_REQUEST_PATH,
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  )
}
