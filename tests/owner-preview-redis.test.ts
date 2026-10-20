import test from "node:test"
import assert from "node:assert/strict"
import { adaptOwnerValkey, aivenPreviewOptions, type ValkeyTransport } from "../lib/server/owner-preview-redis"

const env: NodeJS.ProcessEnv = { NODE_ENV: "test", VERCEL_ENV: "preview", AMS_OWNER_PREVIEW_STORE: "aiven", AMS_OWNER_VALKEY_URL: "valkeys://default:synthetic@synthetic.aivencloud.com:12345" }
test("Aiven requires TLS, Preview, and disabled automation without URL option injection", () => {
  const options = aivenPreviewOptions(env)
  assert.equal(options.tls.rejectUnauthorized, true)
  assert.equal(options.tls.servername, "synthetic.aivencloud.com")
  assert.equal(options.autoResendUnfulfilledCommands, false)
  assert.equal(options.maxRetriesPerRequest, 0)
  for (const override of [
    { VERCEL_ENV: "production" }, { AMS_GMAIL_SEND_ENABLED: "true" },
    { AMS_GMAIL_AUTOREPLY_ENABLED: "true" }, { AMS_SCHEDULED_TASKS_ENABLED: "true" },
    { AMS_OWNER_VALKEY_URL: "redis://default:synthetic@synthetic.aivencloud.com:12345" },
    { AMS_OWNER_VALKEY_URL: env.AMS_OWNER_VALKEY_URL + "?tls=false" },
    { AMS_OWNER_VALKEY_URL: "rediss://default:synthetic@upstash.io:12345" },
  ]) assert.throws(() => aivenPreviewOptions({ ...env, ...override }))
})
test("adapter preserves raw values for Lua, serializes NX/EX correctly and connects once", async () => {
  const calls: unknown[][] = []
  let connections = 0
  const client = {
    on: () => client, connect: async () => { connections++ }, disconnect: () => {},
    get: async () => '{"checkpoint":123,"enabled":false}',
    set: async (...args: unknown[]) => { calls.push(args); return "OK" },
    eval: async (...args: unknown[]) => { calls.push(args); return 1 },
  } as unknown as ValkeyTransport
  const redis = adaptOwnerValkey(client)
  assert.deepEqual(await redis.get("state"), { checkpoint: 123, enabled: false })
  await redis.set("lock", "lease", { nx: true, ex: 180 })
  await redis.eval("atomic-script", ["lock", "state"], ["lease", '{"enabled":false}'])
  assert.deepEqual(calls, [["lock", "lease", "EX", 180, "NX"], ["atomic-script", 2, "lock", "state", "lease", '{"enabled":false}']])
  assert.equal(connections, 1)
})
test("ambiguous failures are sanitized and never retried by adapter", async () => {
  let writes = 0
  const client = { on: () => client, connect: async () => {}, disconnect: () => {},
    set: async () => { writes++; throw new Error("secret synthetic password") },
  } as unknown as ValkeyTransport
  await assert.rejects(adaptOwnerValkey(client).set("key", "value"), /^Error: OWNER_STORE_UNAVAILABLE$/)
  assert.equal(writes, 1)
})
