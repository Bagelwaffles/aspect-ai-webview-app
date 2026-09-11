import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { findCustomerAsset, markCustomerAssetReady } from "@/lib/server/customer-workspace"
import { presignR2Object } from "@/lib/server/r2-presign"
import { requestHasTrustedAppOrigin } from "@/lib/server/request-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({ assetId: z.string().uuid() }).strict()

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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "INVALID_ASSET_ID" }, 400)

  try {
    const asset = await findCustomerAsset(principal.subject, parsed.data.assetId)
    if (!asset) return json({ ok: false, code: "ASSET_NOT_FOUND" }, 404)
    if (asset.status === "ready") return json({ ok: true, asset, idempotent: true })

    const signed = presignR2Object("HEAD", asset.objectKey, { expiresInSeconds: 60 })
    const verification = await fetch(signed.url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })

    if (!verification.ok) {
      return json({ ok: false, code: "ASSET_UPLOAD_NOT_FOUND", error: "Uploaded object was not verified" }, 409)
    }

    const length = Number(verification.headers.get("content-length") ?? "")
    if (Number.isFinite(length) && length > 0 && length !== asset.sizeBytes) {
      return json({ ok: false, code: "ASSET_SIZE_MISMATCH", error: "Uploaded object size did not match" }, 409)
    }

    const storedType = verification.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
    if (storedType && storedType !== asset.contentType) {
      return json({ ok: false, code: "ASSET_TYPE_MISMATCH", error: "Uploaded object type did not match" }, 409)
    }

    const ready = await markCustomerAssetReady(principal.subject, asset.id)
    return json({ ok: true, asset: ready })
  } catch (error) {
    const code = error instanceof Error ? error.message : "ASSET_VERIFY_UNAVAILABLE"
    if (code === "ASSET_STORAGE_NOT_CONFIGURED") {
      return json({ ok: false, code, error: "Customer asset storage is not configured" }, 503)
    }
    return json({ ok: false, code: "ASSET_VERIFY_UNAVAILABLE", error: "Upload could not be verified" }, 503)
  }
}
