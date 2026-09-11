import { createHash, createHmac } from "node:crypto"

export type R2ObjectMethod = "GET" | "PUT" | "HEAD" | "DELETE"

type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

type PresignOptions = {
  expiresInSeconds?: number
  contentType?: string
  now?: Date
}

function trimmed(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

export function resolveR2Config(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  const accountId = trimmed(env.AMS_ASSET_R2_ACCOUNT_ID)
  const accessKeyId = trimmed(env.AMS_ASSET_R2_ACCESS_KEY_ID)
  const secretAccessKey = trimmed(env.AMS_ASSET_R2_SECRET_ACCESS_KEY)
  const bucket = trimmed(env.AMS_ASSET_R2_BUCKET)

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  if (!/^[A-Za-z0-9_-]{8,}$/.test(accountId)) return null
  if (!/^[A-Za-z0-9._-]{3,63}$/.test(bucket)) return null

  return { accountId, accessKeyId, secretAccessKey, bucket }
}

export function isR2AssetStorageConfigured(env: NodeJS.ProcessEnv = process.env) {
  return resolveR2Config(env) !== null
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest()
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function lexicalCompare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

function canonicalObjectPath(bucket: string, objectKey: string) {
  const bucketSegment = encodeRfc3986(bucket)
  const objectSegments = objectKey
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeRfc3986(segment))
  return `/${[bucketSegment, ...objectSegments].join("/")}`
}

function amzTimestamp(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "")
}

function canonicalQuery(params: Record<string, string>) {
  return Object.entries(params)
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([a], [b]) => lexicalCompare(a, b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")
}

export function presignR2Object(
  method: R2ObjectMethod,
  objectKey: string,
  options: PresignOptions = {},
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = resolveR2Config(env)
  if (!config) throw new Error("ASSET_STORAGE_NOT_CONFIGURED")
  if (!objectKey || objectKey.startsWith("/") || objectKey.includes("..")) {
    throw new Error("ASSET_OBJECT_KEY_INVALID")
  }

  const expiresInSeconds = Math.min(900, Math.max(30, Math.trunc(options.expiresInSeconds ?? 300)))
  const now = options.now ?? new Date()
  const timestamp = amzTimestamp(now)
  const date = timestamp.slice(0, 8)
  const region = "auto"
  const service = "s3"
  const scope = `${date}/${region}/${service}/aws4_request`
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = canonicalObjectPath(config.bucket, objectKey)

  const headers: Record<string, string> = { host }
  if (method === "PUT") {
    const contentType = options.contentType?.trim().toLowerCase()
    if (!contentType) throw new Error("ASSET_CONTENT_TYPE_REQUIRED")
    headers["content-type"] = contentType
  }

  const signedHeaders = Object.keys(headers).sort(lexicalCompare).join(";")
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => lexicalCompare(a, b))
    .map(([key, value]) => `${key}:${value.trim()}\n`)
    .join("")

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": timestamp,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  }

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n")

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n")

  const kDate = hmac(`AWS4${config.secretAccessKey}`, date)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, "aws4_request")
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex")

  return {
    url: `https://${host}${canonicalUri}?${canonicalQuery({ ...query, "X-Amz-Signature": signature })}`,
    requiredHeaders: method === "PUT" ? { "Content-Type": headers["content-type"] } : {},
    expiresInSeconds,
  }
}
