import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { Redis } from "@upstash/redis"
import { z } from "zod"

export const YOUTUBE_OWNER_ATTEMPT_COOKIE = "ams-youtube-owner-attempt"
export const YOUTUBE_OWNER_ATTEMPT_TTL = 10 * 60

type AttemptRedis = {
  set(key: string, value: string, options: { ex: number }): Promise<unknown>
  getdel<T = unknown>(key: string): Promise<T | null>
}
type Options = { env?: NodeJS.ProcessEnv; redis?: AttemptRedis | null; now?: () => number }
const attemptSchema = z.object({
  nonce: z.string().regex(/^[a-f0-9]{64}$/u),
  email: z.string().email(),
  providerSubject: z.string().min(1).max(500),
  expiresAt: z.number().int().positive(),
}).strict()

function settings(options: Options) {
  const env = options.env ?? process.env
  const secret = env.NEXTAUTH_SECRET?.trim()
  const ownerEmail = env.AMS_OWNER_EMAIL?.trim().toLowerCase()
  const url = env.UPSTASH_REDIS_REST_URL?.trim() || env.KV_REST_API_URL?.trim()
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() || env.KV_REST_API_TOKEN?.trim()
  const redis = Object.prototype.hasOwnProperty.call(options, "redis")
    ? options.redis
    : url && token ? new Redis({ url, token }) : null
  if (!secret || !ownerEmail || !redis) throw new Error("YOUTUBE_OWNER_ATTEMPT_UNAVAILABLE")
  return { secret, ownerEmail, redis, now: options.now ?? Date.now }
}
function signature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update("ams-youtube-owner-attempt-v1\u0000").update(payload).digest("hex")
}
function nonceKey(nonce: string) { return `ams:youtube-owner:v1:attempt:${nonce}` }

/** Inputs are taken only from the authenticated, signed owner JWT by the route. */
export async function createYouTubeOwnerAttempt(
  identity: { email: string; providerSubject: string },
  options: Options = {},
) {
  const { secret, ownerEmail, redis, now } = settings(options)
  if (identity.email.trim().toLowerCase() !== ownerEmail) throw new Error("YOUTUBE_OWNER_REQUIRED")
  const attempt = attemptSchema.parse({
    nonce: randomBytes(32).toString("hex"),
    email: ownerEmail,
    providerSubject: identity.providerSubject,
    expiresAt: now() + YOUTUBE_OWNER_ATTEMPT_TTL * 1000,
  })
  await redis.set(nonceKey(attempt.nonce), attempt.nonce, { ex: YOUTUBE_OWNER_ATTEMPT_TTL })
  const payload = Buffer.from(JSON.stringify(attempt)).toString("base64url")
  return `${payload}.${signature(payload, secret)}`
}

/** NextAuth has already validated OAuth state/PKCE; consume the owner proof exactly once. */
export async function consumeYouTubeOwnerAttempt(value: string | undefined, options: Options = {}) {
  if (!value || value.length > 4000) throw new Error("YOUTUBE_OWNER_ATTEMPT_REQUIRED")
  const { secret, ownerEmail, redis, now } = settings(options)
  const [payload, mac, extra] = value.split(".")
  if (!payload || !mac || extra || !/^[a-f0-9]{64}$/u.test(mac)) {
    throw new Error("YOUTUBE_OWNER_ATTEMPT_INVALID")
  }
  if (!timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(payload, secret), "hex"))) {
    throw new Error("YOUTUBE_OWNER_ATTEMPT_INVALID")
  }
  let attempt: z.infer<typeof attemptSchema>
  try { attempt = attemptSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))) }
  catch { throw new Error("YOUTUBE_OWNER_ATTEMPT_INVALID") }
  if (attempt.email !== ownerEmail) throw new Error("YOUTUBE_OWNER_REQUIRED")
  if (attempt.expiresAt <= now() || attempt.expiresAt > now() + YOUTUBE_OWNER_ATTEMPT_TTL * 1000) {
    throw new Error("YOUTUBE_OWNER_ATTEMPT_EXPIRED")
  }
  if (await redis.getdel<string>(nonceKey(attempt.nonce)) !== attempt.nonce) {
    throw new Error("YOUTUBE_OWNER_ATTEMPT_REPLAYED")
  }
  return { email: attempt.email, providerSubject: attempt.providerSubject }
}
