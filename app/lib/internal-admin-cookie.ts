const encoder = new TextEncoder();
const ADMIN_SCOPE = "admin,ethical-agent-farm-requests";

function base64UrlEncode(input: string | Uint8Array | ArrayBuffer) {
  const bytes =
    typeof input === "string"
      ? encoder.encode(input)
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : input;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(signature);
}

export async function createInternalAdminCookie(email: string, secret: string, maxAgeSeconds = 60 * 60 * 8) {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const payload = JSON.stringify({ v: 1, email, exp: expiresAt, scope: ADMIN_SCOPE });
  const signature = await hmac(secret, payload);
  return `v1.${base64UrlEncode(payload)}.${signature}`;
}

export async function verifyInternalAdminCookie(token: string | undefined, secret: string) {
  if (!token) {
    return null;
  }

  const [version, payloadPart, signaturePart] = token.split(".");
  if (version !== "v1" || !payloadPart || !signaturePart) {
    return null;
  }

  let payloadText = "";
  try {
    payloadText = new TextDecoder().decode(base64UrlDecode(payloadPart));
  } catch {
    return null;
  }

  let payload: { v?: number; email?: string; exp?: number; scope?: string } | null = null;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return null;
  }

  if (!payload || payload.v !== 1 || !payload.email || !payload.exp || payload.scope !== ADMIN_SCOPE) {
    return null;
  }

  if (payload.exp < Date.now()) {
    return null;
  }

  const expectedSignature = await hmac(secret, payloadText);
  if (expectedSignature !== signaturePart) {
    return null;
  }

  return payload;
}

