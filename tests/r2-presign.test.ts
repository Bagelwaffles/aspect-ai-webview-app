import assert from "node:assert/strict"
import test from "node:test"

import { isR2AssetStorageConfigured, presignR2Object } from "../lib/server/r2-presign"

const env = {
  AMS_ASSET_R2_ACCOUNT_ID: "1234567890abcdef1234567890abcdef",
  AMS_ASSET_R2_ACCESS_KEY_ID: "TESTACCESSKEY123",
  AMS_ASSET_R2_SECRET_ACCESS_KEY: "test-secret-key-value",
  AMS_ASSET_R2_BUCKET: "ams-customer-assets",
} as NodeJS.ProcessEnv

test("R2 asset storage fails closed when credentials are incomplete", () => {
  assert.equal(isR2AssetStorageConfigured({ AMS_ASSET_R2_BUCKET: "assets" } as NodeJS.ProcessEnv), false)
  assert.throws(
    () => presignR2Object("GET", "customers/abc/file.png", {}, {} as NodeJS.ProcessEnv),
    /ASSET_STORAGE_NOT_CONFIGURED/,
  )
})

test("R2 PUT URL is short-lived and binds content type", () => {
  const signed = presignR2Object(
    "PUT",
    "customers/abc/asset 1.png",
    {
      contentType: "image/png",
      expiresInSeconds: 300,
      now: new Date("2026-09-11T18:00:00.000Z"),
    },
    env,
  )

  const url = new URL(signed.url)
  assert.equal(url.hostname, "1234567890abcdef1234567890abcdef.r2.cloudflarestorage.com")
  assert.equal(url.pathname, "/ams-customer-assets/customers/abc/asset%201.png")
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256")
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300")
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-type;host")
  assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[a-f0-9]{64}$/)
  assert.deepEqual(signed.requiredHeaders, { "Content-Type": "image/png" })
})

test("R2 GET URL never exposes secret credentials", () => {
  const signed = presignR2Object(
    "GET",
    "customers/abc/report.pdf",
    { now: new Date("2026-09-11T18:00:00.000Z") },
    env,
  )

  assert.doesNotMatch(signed.url, /test-secret-key-value/)
  assert.equal(new URL(signed.url).searchParams.get("X-Amz-SignedHeaders"), "host")
})
