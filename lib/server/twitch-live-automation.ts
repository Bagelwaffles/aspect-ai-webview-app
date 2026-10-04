import { Redis } from "@upstash/redis"
import { getOwnedTwitchMetadata, getTwitchPilotStatus, updateOwnedTwitchMetadata, type TwitchStreamSession } from "./twitch-pilot"

const PREFIX = "ams:twitch-live-metadata:v1:"
const LATEST = PREFIX + "latest"
const TTL = 180 * 24 * 3600
type Channel = Awaited<ReturnType<typeof getOwnedTwitchMetadata>>
type Record = { streamId: string; sourceTitle: string; category: string; title: string; tags: string[];
  status: "pending" | "verified" | "skipped" | "failed"; code: string | null; updatedAt: string }
type Store = Pick<Redis, "get" | "set" | "del">
type Options = { env?: NodeJS.ProcessEnv; redis?: Store;
  getStatus?: () => Promise<{ connected: boolean; connection: { login: string } | null; session: TwitchStreamSession | null }>;
  getChannel?: () => Promise<Channel>;
  updateChannel?: (patch: { title: string; tags: string[] }, expected: { streamId: string; title: string; category: string }) => Promise<Channel> }
function db(options: Options) {
  if (options.redis) return options.redis
  const env = options.env ?? process.env
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN
  if (!url || !token) throw new Error("TWITCH_AUTOMATION_STORE_UNAVAILABLE")
  return new Redis({ url, token })
}
async function read(redis: Store, key: string): Promise<Record | null> {
  const raw = await redis.get<unknown>(key)
  return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) as Record : null
}
function sameTags(a: string[], b: string[]) { return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()) }
export function buildAutomaticTwitchMetadata(channel: Channel) {
  const original = channel.title.replace(/\s*\|?\s*SmokyBanana03\s*\|?\s*/gi, " ").trim()
  const game = channel.category.trim()
  const stem = game && !original.toLowerCase().includes(game.toLowerCase()) ? `${game} | ${original}` : original
  const suffix = " | SmokyBanana03"
  const title = `${(stem || "Gaming").slice(0, 140 - suffix.length).trim()}${suffix}`
  const tags = [...new Set(["SmokyBanana03", game.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 25), ...channel.tags, "Gaming"]
    .filter(tag => /^[\p{L}\p{N}]{1,25}$/u.test(tag)))].slice(0, 10)
  return { title, tags }
}
export async function getAutomaticTwitchMetadataStatus(options: Options = {}) {
  return read(db(options), LATEST)
}
// Only the go-live event and scheduled recovery call this. channel.update never
// applies metadata, preventing our own save from creating an EventSub write loop.
export async function runAutomaticTwitchMetadata(expectedStreamId?: string, options: Options = {}) {
  const redis = db(options)
  const status = options.getStatus ? await options.getStatus() : await getTwitchPilotStatus({ env: options.env, redis: redis as never })
  const session = status.session as TwitchStreamSession | null
  if (!status.connected || status.connection?.login.toLowerCase() !== "smokybanana03" || session?.broadcasterLogin.toLowerCase() !== "smokybanana03") return { skipped: "TWITCH_AUTOMATION_CHANNEL_MISMATCH" }
  if (session.endedAt || expectedStreamId && session.streamId !== expectedStreamId) return { skipped: "TWITCH_AUTOMATION_NOT_LIVE" }
  const key = PREFIX + session.streamId
  if (!await redis.set(key + ":lock", "locked", { nx: true, ex: 120 })) return { skipped: "TWITCH_AUTOMATION_BUSY" }
  let record: Record | null = null
  async function save() {
    record!.updatedAt = new Date().toISOString()
    await redis.set(key, JSON.stringify(record), { ex: TTL })
    await redis.set(LATEST, JSON.stringify(record), { ex: TTL })
    return record!
  }
  try {
    record = await read(redis, key)
    if (record?.status === "verified" || record?.status === "skipped") return record
    const channel = options.getChannel ? await options.getChannel() : await getOwnedTwitchMetadata({ env: options.env, redis: redis as never })
    if (channel.login.toLowerCase() !== "smokybanana03" || !channel.canEdit) return { skipped: "TWITCH_METADATA_SCOPE_REQUIRED" }
    record ??= { streamId: session.streamId, sourceTitle: session.title, category: session.categoryName,
      ...buildAutomaticTwitchMetadata(channel), status: "pending", code: null, updatedAt: "" }
    if (channel.title === record.title && sameTags(channel.tags, record.tags)) { record.status = "verified"; record.code = null; return save() }
    if (channel.title !== record.sourceTitle || channel.category !== record.category) {
      record.status = "skipped"; record.code = "TWITCH_METADATA_MANUAL_CHANGE"; return save()
    }
    // Persist the exact target before PATCH so a lost response is reconciled by
    // readback, without generating new wording or overwriting subsequent edits.
    await save()
    const expected = { streamId: session.streamId, title: record.sourceTitle, category: record.category }
    const patch = { title: record.title, tags: record.tags }
    const result = options.updateChannel ? await options.updateChannel(patch, expected) : await updateOwnedTwitchMetadata(patch, { env: options.env, redis: redis as never }, expected)
    if (result.login.toLowerCase() !== "smokybanana03" || result.title !== record.title || !sameTags(result.tags, record.tags)) throw new Error("TWITCH_METADATA_READBACK_FAILED")
    record.status = "verified"; record.code = null
    return save()
  } catch (error) {
    if (record) {
      record.status = "failed"
      record.code = error instanceof Error && /^TWITCH_[A-Z_]+$/.test(error.message) ? error.message : "TWITCH_AUTOMATION_FAILED"
      await save()
    }
    throw error
  } finally { await redis.del(key + ":lock") }
}
