import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

import { z } from "zod"

import {
  getCustomerConnectionSecret,
  isConnectionVaultConfigured,
  saveCustomerConnection,
} from "@/lib/server/customer-connections"
import { customerWorkspaceSubjectHash } from "@/lib/server/customer-workspace"

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
const GOOGLE_IDENTITY_SCOPES = ["openid", "email"] as const
export const GOOGLE_DRIVE_SCOPES = [...GOOGLE_IDENTITY_SCOPES, GOOGLE_DRIVE_SCOPE] as const

export const GOOGLE_DRIVE_OAUTH_COOKIE = "ams_google_drive_oauth"
const OAUTH_ATTEMPT_TTL_SECONDS = 10 * 60

const googleTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
})

const googleUserInfoSchema = z.object({
  email: z.string().email().optional(),
})

const oauthAttemptSchema = z.object({
  state: z.string().min(32).max(200),
  codeVerifier: z.string().min(43).max(128),
  subjectHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
})

type GoogleDriveOauthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function appOrigin(env: NodeJS.ProcessEnv = process.env) {
  const raw = clean(env.PUBLIC_APP_URL) ?? clean(env.NEXTAUTH_URL)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" && env.NODE_ENV === "production") return null
    return url.origin
  } catch {
    return null
  }
}

export function resolveGoogleDriveOauthConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleDriveOauthConfig | null {
  const clientId = clean(env.AMS_GOOGLE_DRIVE_CLIENT_ID)
  const clientSecret = clean(env.AMS_GOOGLE_DRIVE_CLIENT_SECRET)
  const origin = appOrigin(env)
  if (!clientId || !clientSecret || !origin) return null

  return {
    clientId,
    clientSecret,
    redirectUri: `${origin}/api/customer/connections/google-drive/callback`,
  }
}

export function isGoogleDriveConnectorConfigured(env: NodeJS.ProcessEnv = process.env) {
  return resolveGoogleDriveOauthConfig(env) !== null && isConnectionVaultConfigured(env)
}

function oauthSigningSecret(env: NodeJS.ProcessEnv = process.env) {
  return clean(env.NEXTAUTH_SECRET) ?? clean(env.AMS_CONNECTION_ENCRYPTION_KEY)
}

function base64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url")
}

function signPayload(encodedPayload: string, env: NodeJS.ProcessEnv = process.env) {
  const secret = oauthSigningSecret(env)
  if (!secret) throw new Error("GOOGLE_DRIVE_OAUTH_NOT_CONFIGURED")
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url")
}

export function createGoogleDriveOauthAttempt(
  subject: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
) {
  if (!isGoogleDriveConnectorConfigured(env)) {
    throw new Error("GOOGLE_DRIVE_OAUTH_NOT_CONFIGURED")
  }

  const state = randomBytes(32).toString("base64url")
  const codeVerifier = randomBytes(48).toString("base64url")
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url")
  const payload = oauthAttemptSchema.parse({
    state,
    codeVerifier,
    subjectHash: customerWorkspaceSubjectHash(subject),
    expiresAt: now + OAUTH_ATTEMPT_TTL_SECONDS * 1000,
  })
  const encoded = base64url(JSON.stringify(payload))
  const signature = signPayload(encoded, env)

  return {
    state,
    codeChallenge,
    cookieValue: `${encoded}.${signature}`,
    maxAgeSeconds: OAUTH_ATTEMPT_TTL_SECONDS,
  }
}

export function readGoogleDriveOauthAttempt(
  cookieValue: string | undefined,
  subject: string,
  expectedState: string | null,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
) {
  if (!cookieValue || !expectedState) throw new Error("GOOGLE_DRIVE_OAUTH_STATE_INVALID")
  const [encoded, signature, ...rest] = cookieValue.split(".")
  if (!encoded || !signature || rest.length) throw new Error("GOOGLE_DRIVE_OAUTH_STATE_INVALID")

  const expectedSignature = signPayload(encoded, env)
  const actualBytes = Uint8Array.from(Buffer.from(signature, "utf8"))
  const expectedBytes = Uint8Array.from(Buffer.from(expectedSignature, "utf8"))
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw new Error("GOOGLE_DRIVE_OAUTH_STATE_INVALID")
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  } catch {
    throw new Error("GOOGLE_DRIVE_OAUTH_STATE_INVALID")
  }

  const attempt = oauthAttemptSchema.parse(decoded)
  if (attempt.expiresAt < now) throw new Error("GOOGLE_DRIVE_OAUTH_STATE_EXPIRED")
  if (attempt.state !== expectedState) throw new Error("GOOGLE_DRIVE_OAUTH_STATE_INVALID")
  if (attempt.subjectHash !== customerWorkspaceSubjectHash(subject)) {
    throw new Error("GOOGLE_DRIVE_OAUTH_STATE_INVALID")
  }
  return attempt
}

export function buildGoogleDriveAuthorizationUrl(
  attempt: { state: string; codeChallenge: string },
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = resolveGoogleDriveOauthConfig(env)
  if (!config) throw new Error("GOOGLE_DRIVE_OAUTH_NOT_CONFIGURED")

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", GOOGLE_DRIVE_SCOPES.join(" "))
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("include_granted_scopes", "true")
  url.searchParams.set("prompt", "consent")
  url.searchParams.set("state", attempt.state)
  url.searchParams.set("code_challenge", attempt.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url
}

function expirationIso(expiresInSeconds: number | undefined, now = Date.now()) {
  const seconds = Math.max(60, expiresInSeconds ?? 3600)
  return new Date(now + seconds * 1000).toISOString()
}

function scopeList(scope: string | undefined) {
  return [...new Set((scope ?? GOOGLE_DRIVE_SCOPES.join(" ")).split(/\s+/).filter(Boolean))]
}

async function parseTokenResponse(response: Response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error("GOOGLE_DRIVE_TOKEN_EXCHANGE_FAILED")
  const parsed = googleTokenSchema.safeParse(body)
  if (!parsed.success) throw new Error("GOOGLE_DRIVE_TOKEN_RESPONSE_INVALID")
  return parsed.data
}

async function accountLabel(accessToken: string, fetcher: typeof fetch) {
  try {
    const response = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return "Google Drive"
    const parsed = googleUserInfoSchema.safeParse(await response.json().catch(() => null))
    return parsed.success && parsed.data.email ? parsed.data.email : "Google Drive"
  } catch {
    return "Google Drive"
  }
}

export async function exchangeGoogleDriveAuthorizationCode(
  subject: string,
  code: string,
  codeVerifier: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const config = resolveGoogleDriveOauthConfig(env)
  if (!config || !isConnectionVaultConfigured(env)) {
    throw new Error("GOOGLE_DRIVE_OAUTH_NOT_CONFIGURED")
  }

  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })

  const token = await parseTokenResponse(response)
  const grantedScopes = scopeList(token.scope)
  if (!grantedScopes.includes(GOOGLE_DRIVE_SCOPE)) {
    throw new Error("GOOGLE_DRIVE_REQUIRED_SCOPE_MISSING")
  }

  const existing = await getCustomerConnectionSecret(subject, "google-drive", { env })
  const refreshToken = token.refresh_token ?? existing?.secret.refreshToken ?? null
  if (!refreshToken) throw new Error("GOOGLE_DRIVE_REFRESH_TOKEN_MISSING")

  const label = await accountLabel(token.access_token, fetcher)
  return saveCustomerConnection(
    subject,
    {
      provider: "google-drive",
      accountLabel: label,
      scopes: grantedScopes,
      status: "active",
      accessToken: token.access_token,
      refreshToken,
      expiresAt: expirationIso(token.expires_in),
    },
    { env },
  )
}

export async function getValidGoogleDriveAccessToken(
  subject: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  const config = resolveGoogleDriveOauthConfig(env)
  if (!config || !isConnectionVaultConfigured(env)) {
    throw new Error("GOOGLE_DRIVE_OAUTH_NOT_CONFIGURED")
  }

  const existing = await getCustomerConnectionSecret(subject, "google-drive", { env })
  if (!existing || existing.connection.status !== "active") {
    throw new Error("GOOGLE_DRIVE_CONNECTION_REQUIRED")
  }

  const expiry = existing.secret.expiresAt ? Date.parse(existing.secret.expiresAt) : Number.NaN
  if (Number.isFinite(expiry) && expiry > now + 60_000) {
    return existing.secret.accessToken
  }
  if (!existing.secret.refreshToken) throw new Error("GOOGLE_DRIVE_REAUTH_REQUIRED")

  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: existing.secret.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  const token = await parseTokenResponse(response)

  await saveCustomerConnection(
    subject,
    {
      provider: "google-drive",
      accountLabel: existing.connection.accountLabel,
      scopes: token.scope ? scopeList(token.scope) : existing.connection.scopes,
      status: "active",
      accessToken: token.access_token,
      refreshToken: existing.secret.refreshToken,
      expiresAt: expirationIso(token.expires_in, now),
    },
    { env },
  )
  return token.access_token
}

export async function revokeGoogleDriveConnection(
  subject: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const existing = await getCustomerConnectionSecret(subject, "google-drive", { env })
  if (!existing) return { alreadyDisconnected: true }

  const token = existing.secret.refreshToken ?? existing.secret.accessToken
  const response = await fetcher("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })

  if (!response.ok && response.status !== 400) {
    throw new Error("GOOGLE_DRIVE_REVOKE_FAILED")
  }
  return { alreadyDisconnected: false }
}
