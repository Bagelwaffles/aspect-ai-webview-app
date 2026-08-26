import { NextRequest } from "next/server"

import { createCreditTopupCheckoutHandler } from "@/lib/server/credit-topup-checkout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  return createCreditTopupCheckoutHandler()(request)
}
