import { createHash, randomBytes } from "node:crypto"
import { Redis } from "@upstash/redis"
import { z } from "zod"
import { encryptConnectionPayload, decryptConnectionPayload, resolveConnectionEncryptionKey } from "./customer-connections"

export const gmailSlots = ["primary", "secondary"] as const
export type GmailSlot = typeof gmailSlots[number]
export const READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
export const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
export interface GmailRedis { get<T>(key: string): Promise<T | null>; set(key: string, value: string, options?: { ex?: number; nx?: boolean }): Promise<unknown>; eval(script: string, keys: string[], args: string[]): Promise<unknown> }
export type GmailContext = { env?: NodeJS.ProcessEnv; redis?: GmailRedis; fetcher?: typeof fetch; now?: number }
const recordSchema = z.object({ email: z.string().email(), scopes: z.array(z.string()), connectedAt: z.string(), updatedAt: z.string(), grantExpiresAt: z.string().nullable(), mode: z.enum(["testing", "approved-owner-use"]), cipherText: z.string(), iv: z.string(), authTag: z.string() })
type Record = z.infer<typeof recordSchema>
const attemptSchema = z.object({ owner: z.string(), slot: z.enum(gmailSlots), verifier: z.string(), expires: z.number() })
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), expires_in: z.number().positive().default(3600), scope: z.string().optional() })
const consume = "local v=redis.call('get',KEYS[1]); if v then redis.call('del',KEYS[1]) end return v"
export function gmailConfig(slot: GmailSlot, env = process.env) {
  const email = env[slot === "primary" ? "AMS_GMAIL_PRIMARY_EMAIL" : "AMS_GMAIL_SECONDARY_EMAIL"]?.trim().toLowerCase()
  const primary = env.AMS_GMAIL_PRIMARY_EMAIL?.trim().toLowerCase()
  const secondary = env.AMS_GMAIL_SECONDARY_EMAIL?.trim().toLowerCase()
  const origin = new URL(env.PUBLIC_APP_URL || env.NEXTAUTH_URL || "https://invalid.local")
  const mode: "testing" | "approved-owner-use" | null = env.AMS_GMAIL_CONSENT_MODE === "testing" ? "testing" : env.AMS_GMAIL_CONSENT_MODE === "approved-owner-use" && env.AMS_GMAIL_POLICY_APPROVED === "true" ? "approved-owner-use" : null
  if (!email || !primary || !secondary || primary === secondary || !z.string().email().safeParse(email).success || origin.protocol !== "https:" || origin.origin === "https://invalid.local" || origin.username || origin.password || !env.AMS_GMAIL_CLIENT_ID || !env.AMS_GMAIL_CLIENT_SECRET || !mode) throw new Error("GMAIL_CONFIG_REQUIRED")
  if (env.VERCEL_ENV === "production" && mode === "testing") throw new Error("GMAIL_PRODUCTION_CONSENT_REQUIRED")
  return { email, primary, clientId: env.AMS_GMAIL_CLIENT_ID, clientSecret: env.AMS_GMAIL_CLIENT_SECRET, redirect: `${origin.origin}/api/owner/gmail/${slot}/callback`, mode, scopes: ["openid", "email", READ_SCOPE, ...(slot === "primary" ? [SEND_SCOPE] : [])] }
}
export function ownerGmailContext(input: GmailContext = {}) {
  const env = input.env ?? process.env
  const key = resolveConnectionEncryptionKey(env)
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN
  const redis = input.redis ?? (url && token ? new Redis({ url, token }) : null)
  if (!key || !redis || !env.AMS_OWNER_EMAIL) throw new Error("GMAIL_VAULT_REQUIRED")
  const owner = createHash("sha256").update(env.AMS_OWNER_EMAIL.trim().toLowerCase()).digest("hex")
  return { env, key, redis, owner, prefix: `ams:owner-gmail:v1:${owner}:`, fetcher: input.fetcher ?? fetch, now: input.now ?? Date.now() }
}
export async function beginGmailConnection(slot: GmailSlot, subject: string, input: GmailContext = {}) {
  const c = ownerGmailContext(input), config = gmailConfig(slot, c.env)
  const state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url")
  const attempt = { owner: createHash("sha256").update(subject).digest("hex"), slot, verifier, expires: c.now + 600_000 }
  // PKCE verifier is encrypted with the existing vault key; Redis state is single-use.
  const sealed = encryptConnectionPayload({ accessToken: JSON.stringify(attempt) }, c.key)
  await c.redis.set(`${c.prefix}oauth:${state}`, JSON.stringify(sealed), { ex: 600 })
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  for (const [key, value] of Object.entries({ client_id: config.clientId, redirect_uri: config.redirect, response_type: "code", scope: config.scopes.join(" "), access_type: "offline", include_granted_scopes: "false", prompt: "consent select_account", login_hint: config.email, state, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") })) url.searchParams.set(key, value)
  return { url: url.toString(), state }
}
async function tokenResponse(response: Response) {
  if (!response.ok) throw new Error(response.status === 400 ? "GMAIL_REAUTHORIZE_REQUIRED" : "GMAIL_TOKEN_UNAVAILABLE")
  return tokenSchema.parse(await response.json())
}
async function request(c: ReturnType<typeof ownerGmailContext>, url: string, init: RequestInit = {}) {
  return c.fetcher(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) })
}
async function save(slot: GmailSlot, record: Omit<Record, "cipherText" | "iv" | "authTag">, secret: Parameters<typeof encryptConnectionPayload>[0], c: ReturnType<typeof ownerGmailContext>) {
  await c.redis.set(`${c.prefix}${slot}`, JSON.stringify({ ...record, ...encryptConnectionPayload(secret, c.key) }))
}
export async function completeGmailConnection(slot: GmailSlot, subject: string, state: string, code: string, cookieState: string | undefined, input: GmailContext = {}) {
  const c = ownerGmailContext(input), config = gmailConfig(slot, c.env)
  if (!/^[A-Za-z0-9_-]{43}$/u.test(state) || cookieState !== state || !code || code.length > 4096) throw new Error("GMAIL_STATE_INVALID")
  const raw = await c.redis.eval(consume, [`${c.prefix}oauth:${state}`], [])
  if (!raw) throw new Error("GMAIL_STATE_INVALID")
  const sealed = z.object({ cipherText: z.string(), iv: z.string(), authTag: z.string() }).parse(typeof raw === "string" ? JSON.parse(raw) : raw)
  const attempt = attemptSchema.parse(JSON.parse(decryptConnectionPayload(sealed, c.key).accessToken))
  if (attempt.slot !== slot || attempt.owner !== createHash("sha256").update(subject).digest("hex") || attempt.expires <= c.now) throw new Error("GMAIL_STATE_INVALID")
  const token = await tokenResponse(await request(c, "https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirect, code, code_verifier: attempt.verifier, grant_type: "authorization_code" }) }))
  const scopes = (token.scope ?? "").split(/\s+/u)
  if (!scopes.includes(READ_SCOPE) || slot === "primary" && !scopes.includes(SEND_SCOPE) || scopes.some(scope => ![...config.scopes, "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"].includes(scope))) throw new Error("GMAIL_SCOPE_INVALID")
  if (!token.refresh_token) throw new Error("GMAIL_OFFLINE_GRANT_REQUIRED")
  const identity = await request(c, "https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } })
  if (!identity.ok) throw new Error("GMAIL_IDENTITY_UNVERIFIED")
  const user = z.object({ email: z.string().email(), email_verified: z.literal(true) }).parse(await identity.json())
  if (user.email.toLowerCase() !== config.email) throw new Error("GMAIL_ACCOUNT_MISMATCH")
  const now = new Date(c.now).toISOString()
  await save(slot, { email: config.email, scopes, connectedAt: now, updatedAt: now, mode: config.mode, grantExpiresAt: config.mode === "testing" ? new Date(c.now + 7 * 86400_000).toISOString() : null }, { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: new Date(c.now + token.expires_in * 1000).toISOString() }, c)
}
export async function gmailConnectionStatus(slot: GmailSlot, input: GmailContext = {}) {
  const c = ownerGmailContext(input), config = gmailConfig(slot, c.env)
  const raw = await c.redis.get<string>(`${c.prefix}${slot}`)
  if (!raw) return { slot, connected: false, status: "not-connected" }
  const record = recordSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw)
  const matchesConfiguration = record.email === config.email && record.mode === config.mode
  const grantExpired = record.grantExpiresAt !== null && !(Date.parse(record.grantExpiresAt) > c.now)
  const connected = matchesConfiguration && !grantExpired
  return { slot, connected, status: !matchesConfiguration ? "configuration-changed" : grantExpired ? "reauthorize" : "connected", connectedAt: record.connectedAt, grantExpiresAt: record.grantExpiresAt, testing: record.mode === "testing" }
}
export async function gmailAccessToken(slot: GmailSlot, input: GmailContext = {}) {
  const c = ownerGmailContext(input), config = gmailConfig(slot, c.env)
  const raw = await c.redis.get<string>(`${c.prefix}${slot}`)
  if (!raw) throw new Error("GMAIL_CONNECTION_REQUIRED")
  const record = recordSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw)
  if (record.email !== config.email || record.mode !== config.mode || record.grantExpiresAt && Date.parse(record.grantExpiresAt) <= c.now) throw new Error("GMAIL_REAUTHORIZE_REQUIRED")
  const secret = decryptConnectionPayload(record, c.key)
  if (secret.expiresAt && Date.parse(secret.expiresAt) > c.now + 60_000) return secret.accessToken
  if (!secret.refreshToken) throw new Error("GMAIL_REAUTHORIZE_REQUIRED")
  const token = await tokenResponse(await request(c, "https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: secret.refreshToken, grant_type: "refresh_token" }) }))
  if (token.scope && (token.scope.split(/\s+/u).some(scope => !record.scopes.includes(scope)) || !token.scope.split(/\s+/u).includes(READ_SCOPE) || slot === "primary" && !token.scope.split(/\s+/u).includes(SEND_SCOPE))) throw new Error("GMAIL_SCOPE_INVALID")
  await save(slot, { ...record, updatedAt: new Date(c.now).toISOString() }, { accessToken: token.access_token, refreshToken: token.refresh_token ?? secret.refreshToken, expiresAt: new Date(c.now + token.expires_in * 1000).toISOString() }, c)
  return token.access_token
}
