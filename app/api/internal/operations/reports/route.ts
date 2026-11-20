import type { NextRequest } from "next/server"
import { handleReportingGet, handleReportingPost } from "@/lib/server/operations-report-api"
export const runtime = "nodejs"
export const maxDuration = 30
export const dynamic = "force-dynamic"
export function GET(request: NextRequest) { return handleReportingGet(request) }
export function POST(request: NextRequest) { return handleReportingPost(request) }
