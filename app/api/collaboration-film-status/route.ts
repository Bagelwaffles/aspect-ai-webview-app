import { NextResponse } from "next/server"

const filmUrl =
  "https://github.com/Bagelwaffles/Aspect-Marketing-Solutions-/releases/download/ams-collaboration-film-v1/ams-collaboration-system-film.mp4"

export async function GET() {
  try {
    const response = await fetch(filmUrl, {
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      cache: "no-store",
    })

    return NextResponse.json({
      ok: response.ok || response.status === 206,
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
      contentRange: response.headers.get("content-range"),
      finalHost: new URL(response.url).host,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown fetch error" },
      { status: 502 },
    )
  }
}
