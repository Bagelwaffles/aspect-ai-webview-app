import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { findCustomerAsset } from "@/lib/server/customer-workspace"
import { presignR2Object } from "@/lib/server/r2-presign"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const idSchema = z.string().uuid()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET(request: NextRequest) {
  const principal = await authorizeCustomerApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    return json({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }

  const parsed = idSchema.safeParse(request.nextUrl.searchParams.get("assetId"))
  if (!parsed.success) return json({ ok: false, code: "INVALID_ASSET_ID" }, 400)

  try {
    const asset = await findCustomerAsset(principal.subject, parsed.data)
    if (!asset || asset.status !== "ready") return json({ ok: false, code: "ASSET_NOT_FOUND" }, 404)

    const signed = presignR2Object("GET", asset.objectKey, { expiresInSeconds: 180 })
    return json({
      ok: true,
      asset: {
        id: asset.id,
        fileName: asset.fileName,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
      },
      downloadUrl: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : "ASSET_DOWNLOAD_UNAVAILABLE"
    if (code === "ASSET_STORAGE_NOT_CONFIGURED") {
      return json({ ok: false, code, error: "Customer asset storage is not configured" }, 503)
    }
    return json({ ok: false, code: "ASSET_DOWNLOAD_UNAVAILABLE", error: "Download could not be prepared" }, 503)
  }
}
