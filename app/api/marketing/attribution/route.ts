import { NextResponse } from "next/server"

const MAX_VALUE_LENGTH = 160
const MAX_PATH_LENGTH = 240

function clean(value: unknown, maxLength = MAX_VALUE_LENGTH) {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLength)
}

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const attribution = {
    event: "marketing_attribution",
    source: clean(input.utm_source),
    medium: clean(input.utm_medium),
    campaign: clean(input.utm_campaign),
    content: clean(input.utm_content),
    path: clean(input.path, MAX_PATH_LENGTH),
  }

  if (!attribution.source && !attribution.campaign) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  console.info(JSON.stringify(attribution))

  return NextResponse.json({ ok: true })
}
