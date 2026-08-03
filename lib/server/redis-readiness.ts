import { Redis } from "@upstash/redis"

export type RedisReadinessState = "ready" | "missing" | "unavailable"

export type RedisReadinessResult = {
  state: RedisReadinessState
  configured: boolean
  checked: boolean
  latencyMs: number | null
}

type RedisPingClient = Pick<Redis, "ping">

const DEFAULT_TIMEOUT_MS = 2_000

function redisConfiguration(): { url: string; token: string } | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()

  return url && token ? { url, token } : null
}

export function isRedisPersistenceConfigured(): boolean {
  return redisConfiguration() !== null
}

export function createRedisReadinessClient(): RedisPingClient | null {
  const configuration = redisConfiguration()
  return configuration ? new Redis(configuration) : null
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("REDIS_READINESS_TIMEOUT")), timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

export async function checkRedisReadiness(
  client: RedisPingClient | null = createRedisReadinessClient(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RedisReadinessResult> {
  if (!client) {
    return {
      state: "missing",
      configured: false,
      checked: false,
      latencyMs: null,
    }
  }

  const startedAt = Date.now()

  try {
    const response = await withTimeout(client.ping(), timeoutMs)
    const latencyMs = Date.now() - startedAt

    if (String(response).toUpperCase() !== "PONG") {
      return {
        state: "unavailable",
        configured: true,
        checked: true,
        latencyMs,
      }
    }

    return {
      state: "ready",
      configured: true,
      checked: true,
      latencyMs,
    }
  } catch {
    return {
      state: "unavailable",
      configured: true,
      checked: true,
      latencyMs: Date.now() - startedAt,
    }
  }
}
