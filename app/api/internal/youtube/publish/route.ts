import { NextRequest, NextResponse } from "next/server"

import {
  YouTubePublisherError,
  parseYouTubePublishInput,
  sendYouTubePublishRequest,
} from "@/lib/server/youtube-publisher"
import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 64 * 1024

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return noStoreJson(
      { ok: false, error: { code: "YOUTUBE_PAYLOAD_TOO_LARGE", message: "Request payload is too large" } },
      413,
    )
  }

  const rawBody = await request.text().catch(() => null)
  if (rawBody === null || Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return noStoreJson(
      { ok: false, error: { code: "YOUTUBE_REQUEST_MALFORMED", message: "Expected a valid JSON request body" } },
      rawBody === null ? 400 : 413,
    )
  }

  try {
    const input = parseYouTubePublishInput(JSON.parse(rawBody))
    const result = await sendYouTubePublishRequest(input)
    return noStoreJson(result, result.ok ? 200 : 502)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return noStoreJson(
        { ok: false, error: { code: "YOUTUBE_REQUEST_MALFORMED", message: "Expected a valid JSON object" } },
        400,
      )
    }

    if (error instanceof YouTubePublisherError) {
      return noStoreJson(
        { ok: false, error: { code: error.code, message: error.message } },
        error.status,
      )
    }

    console.error("AMS YouTube publisher failed", {
      code: "YOUTUBE_PUBLISH_FAILED",
      errorType: error instanceof Error ? error.name : "unknown",
    })
    return noStoreJson(
      { ok: false, error: { code: "YOUTUBE_PUBLISH_FAILED", message: "YouTube publish request failed" } },
      502,
    )
  }
}
