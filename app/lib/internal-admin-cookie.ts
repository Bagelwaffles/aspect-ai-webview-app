const encoder = new TextEncoder()
const ADMIN_SCOPE = "admin,ethical-agent-farm-requests"
const MINIMUM_SESSION_SECRET_BYTES = 32

function base64UrlEncode(input: string | Uint8Array | ArrayBuffer) {
  const bytes =
    typeof input === "string"
      ? encoder.encode(input)
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : input
  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url value")
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  if (base64UrlEncode(bytes) !== value) {
    throw new Error("Non-canonical base64url value")
  }

  return bytes
}

async function importHmacKey(secret: string, usages: KeyUsage[]) {
  if (!isValidInternalAdminSessionSecret(secret)) {
    throw new Error("Internal admin session secret must contain at least 32 bytes")
  }

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  )
}

async function hmac(secret: string, payload: string) {
  const key = await importHmacKey(secret, ["sign"])
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return base64UrlEncode(signature)
}

async function verifyHmac(secret: string, payload: string, signature: Uint8Array<ArrayBuffer>) {
  const key = await importHmacKey(secret, ["verify"])
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(payload))
}

export function isValidInternalAdminSessionSecret(secret: string): boolean {
  return encoder.encode(secret).length >= MINIMUM_SESSION_SECRET_BYTES
}

export async function createInternalAdminCookie(
  email: string,
  secret: string,
  maxAgeSeconds = 60 * 60 * 8,
) {
  if (!isValidInternalAdminSessionSecret(secret)) {
    throw new Error("Internal admin session secret must contain at least 32 bytes")
  }

  const expiresAt = Date.now() + maxAgeSeconds * 1000
  const payload = JSON.stringify({ v: 1, email, exp: expiresAt, scope: ADMIN_SCOPE })
  const signature = await hmac(secret, payload)
  return `v1.${base64UrlEncode(payload)}.${signature}`
}

export async function verifyInternalAdminCookie(token: string | undefined, secret: string) {
  if (!token || !isValidInternalAdminSessionSecret(secret)) {
    return null
  }

  const parts = token.split(".")
  if (parts.length !== 3) {
    return null
  }

  const [version, payloadPart, signaturePart] = parts
  if (version !== "v1" || !payloadPart || !signaturePart) {
    return null
  }

  let payloadText = ""
  let signature: Uint8Array<ArrayBuffer>
  try {
    payloadText = new TextDecoder().decode(base64UrlDecode(payloadPart))
    signature = base64UrlDecode(signaturePart)
  } catch {
    return null
  }

  let payload: { v?: number; email?: string; exp?: number; scope?: string } | null = null
  try {
    payload = JSON.parse(payloadText)
  } catch {
    return null
  }

  if (
    !payload ||
    payload.v !== 1 ||
    !payload.email ||
    !Number.isSafeInteger(payload.exp) ||
    payload.scope !== ADMIN_SCOPE
  ) {
    return null
  }

  if (payload.exp! < Date.now()) {
    return null
  }

  try {
    if (!(await verifyHmac(secret, payloadText, signature))) {
      return null
    }
  } catch {
    return null
  }

  return payload
}
