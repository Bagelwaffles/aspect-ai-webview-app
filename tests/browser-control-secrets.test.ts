import assert from "node:assert/strict"
import test from "node:test"

import {
  isBrowserSecretHandle,
  riskForBrowserAction,
  validateBrowserJobInput,
} from "../lib/browser-control-policy"
import {
  __setBrowserControlRedisForTests,
  approveBrowserJob,
  claimBrowserJob,
  createBrowserJob,
  createBrowserPairingCode,
  pairBrowserWorker,
} from "../lib/server/browser-control"

class MemoryRedis {
  store = new Map<string, unknown>()
  lists = new Map<string, unknown[]>()

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null
  }

  async set(key: string, value: unknown): Promise<"OK"> {
    this.store.set(key, value)
    return "OK"
  }

  async del(key: string): Promise<number> {
    const deleted = this.store.delete(key) ? 1 : 0
    this.lists.delete(key)
    return deleted
  }

  async lpush(key: string, value: unknown): Promise<number> {
    const list = this.lists.get(key) ?? []
    list.unshift(value)
    this.lists.set(key, list)
    return list.length
  }

  async rpush(key: string, value: unknown): Promise<number> {
    const list = this.lists.get(key) ?? []
    list.push(value)
    this.lists.set(key, list)
    return list.length
  }

  async lpop<T>(key: string): Promise<T | null> {
    const list = this.lists.get(key) ?? []
    const value = list.shift()
    this.lists.set(key, list)
    return (value as T | undefined) ?? null
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const list = this.lists.get(key) ?? []
    const normalizedStop = stop < 0 ? list.length + stop : stop
    return list.slice(start, normalizedStop + 1) as T[]
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK"> {
    const list = this.lists.get(key) ?? []
    const normalizedStop = stop < 0 ? list.length + stop : stop
    this.lists.set(key, list.slice(start, normalizedStop + 1))
    return "OK"
  }
}

function useMemoryRedis() {
  const redis = new MemoryRedis()
  __setBrowserControlRedisForTests(redis as never)
  return redis
}

async function pairWorker() {
  const { code } = await createBrowserPairingCode()
  return pairBrowserWorker({ code, name: "Windows workstation", version: "1.2.0", platform: "win32", browser: "Edge" })
}

test("browser credential actions are approval gated", () => {
  assert.equal(riskForBrowserAction("capture_secret"), "red")
  assert.equal(riskForBrowserAction("fill"), "red")
})

test("capture_secret requires a selector, current-page mode, and never accepts a secret value", () => {
  const valid = validateBrowserJobInput({
    action: "capture_secret",
    url: "https://www.linkedin.com/developers/apps/123/auth",
    selector: "label=Client Secret",
    useCurrentPage: true,
  })
  assert.equal(valid.ok, true)

  assert.equal(
    validateBrowserJobInput({
      action: "capture_secret",
      url: "https://www.linkedin.com/developers/apps/123/auth",
      useCurrentPage: true,
    }).ok,
    false,
  )

  assert.equal(
    validateBrowserJobInput({
      action: "capture_secret",
      url: "https://www.linkedin.com/developers/apps/123/auth",
      selector: "label=Client Secret",
      value: "do-not-send-secrets-through-ams",
      useCurrentPage: true,
    }).ok,
    false,
  )
})

test("opaque AMS secret handles are strictly validated", () => {
  const handle = "ams-secret-00000000-0000-4000-8000-000000000001"
  assert.equal(isBrowserSecretHandle(handle), true)
  assert.equal(isBrowserSecretHandle("ams-secret-not-a-uuid"), false)

  assert.equal(
    validateBrowserJobInput({
      action: "fill",
      url: "https://vercel.com/example/project/settings/environment-variables",
      selector: "input[name='value']",
      value: handle,
      useCurrentPage: true,
    }).ok,
    true,
  )

  assert.equal(
    validateBrowserJobInput({
      action: "fill",
      url: "https://vercel.com/example/project/settings/environment-variables",
      selector: "input[name='value']",
      value: "ams-secret-not-a-uuid",
      useCurrentPage: true,
    }).ok,
    false,
  )
})

test("secret capture and secret-handle fill remain blocked until explicit approval", async () => {
  useMemoryRedis()
  try {
    const { workerId } = await pairWorker()
    const capture = await createBrowserJob({
      action: "capture_secret",
      url: "https://www.linkedin.com/developers/apps/123/auth",
      selector: "label=Client Secret",
      useCurrentPage: true,
    })
    assert.equal(capture.risk, "red")
    assert.equal(capture.status, "awaiting_approval")
    assert.equal((await claimBrowserJob(workerId)).job, null)

    await approveBrowserJob(capture.id)
    assert.equal((await claimBrowserJob(workerId)).job?.id, capture.id)

    const fill = await createBrowserJob({
      action: "fill",
      url: "https://vercel.com/example/project/settings/environment-variables",
      selector: "input[name='value']",
      value: "ams-secret-00000000-0000-4000-8000-000000000001",
      useCurrentPage: true,
    })
    assert.equal(fill.risk, "red")
    assert.equal(fill.status, "awaiting_approval")
  } finally {
    __setBrowserControlRedisForTests(null)
  }
})
