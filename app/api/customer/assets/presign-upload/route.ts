import { NextRequest, NextResponse } from "next/server"

import { customerAssetUploadRequestSchema } from "@/lib/server/asset-policy"
import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { createPendingCustomerAsset } from "@/lib/server/customer-workspace"
import { presignR2Object } from "@/lib/server/r2-presign"
import { requestHasTrustedAppOrigin } from "@/lib/server/request-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  if (!requestHasTrustedAppOrigin(request)) {
    return json({ ok: false, code: "UNTRUSTED_ORIGIN" }, 403)
  }

  const principal = await authorizeCustomerApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    return json({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }

  const parsed = customerAssetUploadRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json(
      { ok: false, code: "INVALID_ASSET_UPLOAD", error: "File name, type, or size was not accepted" },
      400,
    )
  }

  try {
    const asset = await createPendingCustomerAsset(principal.subject, parsed.data)
    const signed = presignR2Object("PUT", asset.objectKey, {
      contentType: asset.contentType,
      expiresInSeconds: 300,
    })

    return json({
      ok: true,
      asset: {
        id: asset.id,
        fileName: asset.fileName,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        status: asset.status,
        createdAt: asset.createdAt,
      },
      upload: signed,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : "ASSET_UPLOAD_UNAVAILABLE"
    if (code === "ASSET_STORAGE_NOT_CONFIGURED") {
      return json(
        { ok: false, code, error: "Customer asset storage is not configured" },
        503,
      )
    }
    return json({ ok: false, code: "ASSET_UPLOAD_UNAVAILABLE", error: "Upload could not be prepared" }, 503)
  }
}
