import { NextRequest, NextResponse } from "next/server"
import { deliverGmailAlert, verifyMonitorSignature } from "@/lib/server/owner-gmail-delivery"
import { taskErrorCode } from "@/lib/server/scheduled-task-engine"
export const runtime = "nodejs"
export const maxDuration = 60
export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 200_000) return NextResponse.json({ delivered: false }, { status: 413 })
  const reader = request.body?.getReader()
  if (!reader) return NextResponse.json({ delivered: false }, { status: 400 })
  let bytes = 0, body = ""; const decoder = new TextDecoder()
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 200_000) return NextResponse.json({ delivered: false }, { status: 413 }); body += decoder.decode(part.value, { stream: true }) }
    body += decoder.decode()
  } finally { await reader.cancel() }
  if (!verifyMonitorSignature(body, request.headers.get("x-ams-monitor-signature"), process.env.AMS_MONITOR_ALERT_WEBHOOK_SECRET)) return NextResponse.json({ delivered: false }, { status: 401 })
  try { return NextResponse.json(await deliverGmailAlert(JSON.parse(body), request.headers.get("idempotency-key")), { headers: { "Cache-Control": "no-store" } }) }
  catch (error) { return NextResponse.json({ delivered: false, code: taskErrorCode(error) }, { status: 503, headers: { "Cache-Control": "no-store" } }) }
}
