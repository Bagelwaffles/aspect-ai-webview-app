import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import {
  isAllowedBrowserUrl,
  riskForBrowserAction,
  validateBrowserJobInput,
} from "../lib/browser-control-policy"
import {
  __setBrowserControlRedisForTests,
  approveBrowserJob,
  authenticateBrowserWorker,
  claimBrowserJob,
  completeBrowserJob,
  createBrowserJob,
  createBrowserPairingCode,
  getBrowserControlSnapshot,
  pairBrowserWorker,
  setBrowserKillSwitch,
  type BrowserJob,
} from "../lib/server/browser-control"
import { POST as postBrowserWorkerResult } from "../app/api/browser-control/worker/result/route"

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
  return pairBrowserWorker({ code, name: "Windows workstation", version: "test", platform: "win32", browser: "Edge" })
}

test("browser control classifies read-only and write actions by risk", () => {
  assert.equal(riskForBrowserAction("open"), "green")
  assert.equal(riskForBrowserAction("inspect"), "green")
  assert.equal(riskForBrowserAction("screenshot"), "green")
  assert.equal(riskForBrowserAction("click"), "yellow")
  assert.equal(riskForBrowserAction("fill"), "yellow")
  assert.equal(riskForBrowserAction("upload"), "red")
  assert.equal(riskForBrowserAction("submit"), "red")
})

test("browser control accepts AMS provider domains while blocking lookalikes and shared-hosting wildcards", () => {
  assert.equal(isAllowedBrowserUrl("https://www.aspectmarketingsolutions.app/collaborate"), true)
  assert.equal(isAllowedBrowserUrl("https://github.com/Bagelwaffles"), true)
  assert.equal(isAllowedBrowserUrl("https://docs.github.com/en/rest"), true)
  assert.equal(isAllowedBrowserUrl("https://www.fiverr.com/"), true)
  assert.equal(isAllowedBrowserUrl("https://www.linkedin.com/developers/apps"), true)
  assert.equal(isAllowedBrowserUrl("https://developer.linkedin.com"), true)
  assert.equal(isAllowedBrowserUrl("https://learn.microsoft.com/en-us/linkedin/"), true)
  assert.equal(isAllowedBrowserUrl("https://developers.facebook.com/apps/"), true)
  assert.equal(isAllowedBrowserUrl("https://business.facebook.com/"), true)
  assert.equal(isAllowedBrowserUrl("https://developers.pinterest.com/apps/"), true)
  assert.equal(isAllowedBrowserUrl("https://console.cloud.google.com/apis/credentials"), true)
  assert.equal(isAllowedBrowserUrl("https://accounts.google.com/"), true)
  assert.equal(isAllowedBrowserUrl("https://play.google.com/console/"), true)
  assert.equal(isAllowedBrowserUrl("https://studio.youtube.com/"), true)
  assert.equal(isAllowedBrowserUrl("https://vercel.com/kimberleyaversbiz-4131s-projects"), true)
  assert.equal(isAllowedBrowserUrl("https://dashboard.stripe.com/"), true)
  assert.equal(isAllowedBrowserUrl("https://api.slack.com/apps"), true)
  assert.equal(isAllowedBrowserUrl("https://www.reddit.com/prefs/apps"), true)
  assert.equal(isAllowedBrowserUrl("https://developers.tiktok.com/"), true)
  assert.equal(isAllowedBrowserUrl("https://aspect-ai-overlord-git-main-kimberleyaversbiz-4131s-projects.vercel.app/"), true)

  assert.equal(isAllowedBrowserUrl("https://evil.example/"), false)
  assert.equal(isAllowedBrowserUrl("https://github.com.evil.example/"), false)
  assert.equal(isAllowedBrowserUrl("https://linkedin.com.evil.example/"), false)
  assert.equal(isAllowedBrowserUrl("https://evil-linkedin.com/"), false)
  assert.equal(isAllowedBrowserUrl("https://random-customer-project.vercel.app/"), false)
  assert.equal(isAllowedBrowserUrl("https://user:pass@github.com/"), false)
})

test("configured browser domains extend defaults and include their subdomains", () => {
  assert.equal(isAllowedBrowserUrl("https://portal.example-ams-vendor.com/path", "example-ams-vendor.com"), true)
  assert.equal(isAllowedBrowserUrl("https://deep.portal.example-ams-vendor.com/path", "example-ams-vendor.com"), true)
  assert.equal(isAllowedBrowserUrl("https://example-ams-vendor.com.evil.example/", "example-ams-vendor.com"), false)
  assert.equal(isAllowedBrowserUrl("https://dashboard.stripe.com/", "example-ams-vendor.com"), true)
})

test("browser control validates selectors, values, current-page mode, and safe upload filenames", () => {
  assert.equal(
    validateBrowserJobInput({ action: "click", url: "https://www.aspectmarketingsolutions.app/", selector: "a[href='/collaborate']" }).ok,
    true,
  )
  assert.equal(
    validateBrowserJobInput({ action: "click", url: "https://www.aspectmarketingsolutions.app/" }).ok,
    false,
  )
  const fill = validateBrowserJobInput({
    action: "fill",
    url: "https://www.linkedin.com/developers/apps/new",
    selector: "label=App name",
    value: "Aspect Marketing Solutions",
    useCurrentPage: true,
  })
  assert.equal(fill.ok, true)
  if (fill.ok) assert.equal(fill.value.useCurrentPage, true)

  assert.equal(
    validateBrowserJobInput({ action: "fill", url: "https://www.aspectmarketingsolutions.app/", selector: "input" }).ok,
    false,
  )

  assert.equal(
    validateBrowserJobInput({
      action: "upload",
      url: "https://www.linkedin.com/developers/apps/new",
      selector: "input[type='file']",
      value: "ams-logo.png",
      useCurrentPage: true,
    }).ok,
    true,
  )
  assert.equal(
    validateBrowserJobInput({
      action: "upload",
      url: "https://www.linkedin.com/developers/apps/new",
      selector: "input[type='file']",
      value: "../credentials.json",
      useCurrentPage: true,
    }).ok,
    false,
  )
  assert.equal(
    validateBrowserJobInput({
      action: "upload",
      url: "https://www.linkedin.com/developers/apps/new",
      selector: "input[type='file']",
      value: "secret.env",
      useCurrentPage: true,
    }).ok,
    false,
  )
  assert.equal(
    validateBrowserJobInput({
      action: "inspect",
      url: "https://www.linkedin.com/developers/apps/new",
      useCurrentPage: true,
    }).ok,
    false,
  )

  const parsed = validateBrowserJobInput({
    action: "inspect",
    url: "https://www.aspectmarketingsolutions.app/",
    idempotencyKey: "proof-test:2026-08-27",
  })
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.value.idempotencyKey, "proof-test:2026-08-27")
  assert.equal(
    validateBrowserJobInput({
      action: "inspect",
      url: "https://www.aspectmarketingsolutions.app/",
      idempotencyKey: "not safe!",
    }).ok,
    false,
  )
})

test("browser control pairs a worker with one-time code and authenticates bearer token", async () => {
  useMemoryRedis()
  try {
    const { code } = await createBrowserPairingCode()
    const paired = await pairBrowserWorker({ code, name: "AMS Worker" })
    assert.ok(paired.workerId)
    assert.ok(paired.token)
    await assert.rejects(() => pairBrowserWorker({ code }), /INVALID_OR_EXPIRED_PAIRING_CODE/)

    const request = new NextRequest("https://www.aspectmarketingsolutions.app/api/browser-control/worker/claim", {
      headers: {
        authorization: `Bearer ${paired.token}`,
        "x-ams-worker-id": paired.workerId,
      },
    })
    assert.equal(await authenticateBrowserWorker(request), paired.workerId)
  } finally {
    __setBrowserControlRedisForTests(null)
  }
})

test("browser control approval gates and kill switch block new browser work", async () => {
  useMemoryRedis()
  try {
    const { workerId } = await pairWorker()
    const clickJob = await createBrowserJob({
      action: "click",
      url: "https://www.aspectmarketingsolutions.app/",
      selector: "text=Pricing",
    })
    assert.equal(clickJob.status, "awaiting_approval")
    assert.equal((await claimBrowserJob(workerId)).job, null)

    const approved = await approveBrowserJob(clickJob.id)
    assert.equal(approved.status, "queued")

    await setBrowserKillSwitch(true)
    assert.deepEqual(await claimBrowserJob(workerId), { disabled: true, job: null })
    await assert.rejects(
      () => createBrowserJob({ action: "inspect", url: "https://www.aspectmarketingsolutions.app/" }),
      /BROWSER_CONTROL_DISABLED/,
    )

    await setBrowserKillSwitch(false)
    const claimed = await claimBrowserJob(workerId)
    assert.equal(claimed.disabled, false)
    assert.equal(claimed.job?.id, clickJob.id)
    assert.equal(claimed.job?.attemptCount, 1)
  } finally {
    __setBrowserControlRedisForTests(null)
  }
})

test("browser control upload jobs are red and preserve current-page intent after approval", async () => {
  useMemoryRedis()
  try {
    const { workerId } = await pairWorker()
    const uploadJob = await createBrowserJob({
      action: "upload",
      url: "https://www.linkedin.com/developers/apps/new",
      selector: "input[type='file']",
      value: "ams-logo.png",
      useCurrentPage: true,
    })
    assert.equal(uploadJob.risk, "red")
    assert.equal(uploadJob.status, "awaiting_approval")
    assert.equal(uploadJob.useCurrentPage, true)
    assert.equal((await claimBrowserJob(workerId)).job, null)

    await approveBrowserJob(uploadJob.id)
    const claimed = await claimBrowserJob(workerId)
    assert.equal(claimed.job?.id, uploadJob.id)
    assert.equal(claimed.job?.value, "ams-logo.png")
    assert.equal(claimed.job?.useCurrentPage, true)
  } finally {
    __setBrowserControlRedisForTests(null)
  }
})

test("browser control idempotency keys and result replay are duplicate safe", async () => {
  useMemoryRedis()
  try {
    const { workerId } = await pairWorker()
    const first = await createBrowserJob({
      action: "inspect",
      url: "https://www.aspectmarketingsolutions.app/",
      idempotencyKey: "browser-proof:one",
    })
    const second = await createBrowserJob({
      action: "inspect",
      url: "https://www.aspectmarketingsolutions.app/",
      idempotencyKey: "browser-proof:one",
    })
    assert.equal(second.id, first.id)

    const claimed = await claimBrowserJob(workerId)
    assert.equal(claimed.job?.id, first.id)

    const completed = await completeBrowserJob(workerId, {
      jobId: first.id,
      ok: true,
      title: "Aspect Marketing Solutions",
      finalUrl: "https://www.aspectmarketingsolutions.app/",
      text: "Aspect Marketing Solutions dashboard",
    })
    assert.equal(completed.status, "succeeded")

    const replayed = await completeBrowserJob(workerId, {
      jobId: first.id,
      ok: true,
      title: "Replay",
    })
    assert.equal(replayed.id, first.id)
    assert.equal(replayed.result?.title, "Aspect Marketing Solutions")
  } finally {
    __setBrowserControlRedisForTests(null)
  }
})

test("browser control recovers expired running jobs for worker restart safety", async () => {
  const redis = useMemoryRedis()
  try {
    const { workerId } = await pairWorker()
    const job = await createBrowserJob({ action: "inspect", url: "https://www.aspectmarketingsolutions.app/" })
    const claimed = await claimBrowserJob(workerId)
    assert.equal(claimed.job?.id, job.id)

    const jobStorageKey = [...redis.store.keys()].find((key) => key.endsWith(`:job:${job.id}`))
    assert.ok(jobStorageKey)
    const staleJob = redis.store.get(jobStorageKey) as BrowserJob
    redis.store.set(jobStorageKey, {
      ...staleJob,
      leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
    })

    const recovered = await claimBrowserJob(workerId)
    assert.equal(recovered.job?.id, job.id)
    assert.equal(recovered.job?.attemptCount, 2)
  } finally {
    __setBrowserControlRedisForTests(null)
  }
})

test("browser control stores owner-action-required results without marking success", async () => {
  useMemoryRedis()
  try {
    const { workerId } = await pairWorker()
    const job = await createBrowserJob({ action: "inspect", url: "https://play.google.com/console/" })
    const claimed = await claimBrowserJob(workerId)
    assert.equal(claimed.job?.id, job.id)

    const completed = await completeBrowserJob(workerId, {
      jobId: job.id,
      ok: false,
      ownerAction: "mfa_required",
      error: "Owner action required: mfa_required",
    })
    assert.equal(completed.status, "owner_action_required")
    assert.equal(completed.result?.ownerAction, "mfa_required")

    const snapshot = await getBrowserControlSnapshot()
    assert.equal(snapshot.jobs[0]?.status, "owner_action_required")
  } finally {
    __setBrowserControlRedisForTests(null)
  }
})

test("browser control worker result route preserves structured owner action", async () => {
  useMemoryRedis()
  try {
    const { workerId, token } = await pairWorker()
    const job = await createBrowserJob({ action: "inspect", url: "https://play.google.com/console/" })
    const claimed = await claimBrowserJob(workerId)
    assert.equal(claimed.job?.id, job.id)

    const request = new NextRequest("https://www.aspectmarketingsolutions.app/api/browser-control/worker/result", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-ams-worker-id": workerId,
      },
      body: JSON.stringify({
        jobId: job.id,
        ok: false,
        ownerAction: "captcha_required",
        error: "Owner action required: captcha_required",
      }),
    })
    const response = await postBrowserWorkerResult(request)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.job.status, "owner_action_required")
    assert.equal(body.job.result.ownerAction, "captcha_required")
  } finally {
    __setBrowserControlRedisForTests(null)
  }
})
