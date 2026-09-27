import { authorizeDispatch } from "../lib/auth.js"
import {
  getCloudBrowserSandbox,
  pairCloudBrowserSandbox,
  startCloudBrowserDaemon,
} from "../lib/sandbox.js"

function validCode(value) {
  return typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 80 &&
    /^[A-Za-z0-9-]+$/u.test(value)
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    return response.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" })
  }
  if (!authorizeDispatch(request)) {
    return response.status(401).json({ ok: false, code: "CLOUD_BROWSER_UNAUTHORIZED" })
  }

  const code = request.body?.code
  const baseUrl = request.body?.baseUrl || process.env.AMS_BASE_URL || "https://www.aspectmarketingsolutions.app"
  if (!validCode(code) || typeof baseUrl !== "string") {
    return response.status(400).json({ ok: false, code: "CLOUD_BROWSER_PAIR_INPUT_INVALID" })
  }

  try {
    const sandbox = await getCloudBrowserSandbox()
    const paired = await pairCloudBrowserSandbox(sandbox, { code, baseUrl })
    await startCloudBrowserDaemon(sandbox)
    return response.status(200).json({ ok: true, ...paired })
  } catch (error) {
    const raw = error instanceof Error ? error.message : "CLOUD_BROWSER_PAIR_FAILED"
    const codeValue = /pair|code|credential/iu.test(raw) ? "CLOUD_BROWSER_PAIR_FAILED" : raw.slice(0, 200)
    return response.status(503).json({ ok: false, code: codeValue })
  }
}
