import { Redis } from "@upstash/redis"

const KILL_SWITCH_KEY = "ams:browser-control:v1:kill-switch"

function getRedis(): Redis {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) throw new Error("BROWSER_CONTROL_STORAGE_UNAVAILABLE")
  return new Redis({ url, token })
}

export function browserKillSwitchValueIsEnabled(value: unknown): boolean {
  return value === "1" || value === 1 || value === true || value === "true"
}

export async function browserKillSwitchEnabled(): Promise<boolean> {
  const value = await getRedis().get<unknown>(KILL_SWITCH_KEY)
  return browserKillSwitchValueIsEnabled(value)
}

export async function setVerifiedBrowserKillSwitch(disabled: boolean): Promise<boolean> {
  const redis = getRedis()
  if (disabled) await redis.set(KILL_SWITCH_KEY, 1)
  else await redis.del(KILL_SWITCH_KEY)

  const persisted = browserKillSwitchValueIsEnabled(await redis.get<unknown>(KILL_SWITCH_KEY))
  if (persisted !== disabled) throw new Error("BROWSER_KILL_SWITCH_PERSISTENCE_FAILED")
  return persisted
}
