type CloudBrowserOptions = {
  env?: NodeJS.ProcessEnv
  fetcher?: typeof fetch
}

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function realSecret(value: string | null) {
  return Boolean(
    value &&
    value.length >= 32 &&
    !/(?:replace|placeholder|changeme|your)[-_ ]/iu.test(value),
  )
}

function workerOrigin(env: NodeJS.ProcessEnv) {
  const raw = clean(env.AMS_CLOUD_BROWSER_WORKER_URL)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

export function getCloudBrowserConfiguration(
  env: NodeJS.ProcessEnv = process.env,
) {
  const url = workerOrigin(env)
  const key = clean(env.AMS_CLOUD_BROWSER_DISPATCH_KEY)
  const enabled = clean(env.AMS_CLOUD_BROWSER_ENABLED)?.toLowerCase() === "true"
  return {
    enabled,
    url,
    configured: Boolean(url && realSecret(key)),
    key,
  }
}

async function callCloudWorker(
  path: string,
  init: RequestInit,
  options: CloudBrowserOptions = {},
) {
  const env = options.env ?? process.env
  const fetcher = options.fetcher ?? fetch
  const config = getCloudBrowserConfiguration(env)
  if (!config.configured || !config.url || !config.key) {
    throw new Error("CLOUD_BROWSER_NOT_CONFIGURED")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetcher(new URL(path, config.url), {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok || body.ok === false) {
      const code = typeof body.code === "string" ? body.code : `CLOUD_BROWSER_HTTP_${response.status}`
      throw new Error(code)
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

export async function dispatchCloudBrowserWorker(
  options: CloudBrowserOptions & { force?: boolean } = {},
) {
  const env = options.env ?? process.env
  const config = getCloudBrowserConfiguration(env)
  if (!options.force && !config.enabled) {
    return { status: "disabled" as const }
  }
  if (!config.configured) {
    return { status: "not_configured" as const }
  }

  try {
    const result = await callCloudWorker("/api/run", {
      method: "POST",
      body: "{}",
    }, options)
    return { status: "dispatched" as const, result }
  } catch (error) {
    return {
      status: "failed" as const,
      code: error instanceof Error ? error.message.slice(0, 200) : "CLOUD_BROWSER_DISPATCH_FAILED",
    }
  }
}

export async function pairCloudBrowserWorker(
  code: string,
  options: CloudBrowserOptions = {},
) {
  if (!/^AMS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/u.test(code)) {
    throw new Error("CLOUD_BROWSER_PAIR_CODE_INVALID")
  }
  return callCloudWorker("/api/pair", {
    method: "POST",
    body: JSON.stringify({
      code,
      baseUrl:
        clean((options.env ?? process.env).PUBLIC_APP_URL) ??
        clean((options.env ?? process.env).NEXTAUTH_URL) ??
        "https://www.aspectmarketingsolutions.app",
    }),
  }, options)
}

export async function getCloudBrowserWorkerStatus(
  options: CloudBrowserOptions = {},
) {
  return callCloudWorker("/api/status", { method: "GET" }, options)
}
