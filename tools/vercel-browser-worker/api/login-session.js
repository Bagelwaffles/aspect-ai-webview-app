import { authorizeDispatch } from "../lib/auth.js"
import {
  getCloudBrowserSandbox,
  startCloudBrowserLoginSession,
} from "../lib/sandbox.js"

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    return response.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" })
  }
  if (!authorizeDispatch(request)) {
    return response.status(401).json({ ok: false, code: "CLOUD_BROWSER_UNAUTHORIZED" })
  }

  const body = typeof request.body === "object" && request.body ? request.body : {}
  const targetUrl = typeof body.targetUrl === "string" ? body.targetUrl : undefined

  try {
    const sandbox = await getCloudBrowserSandbox()
    const session = await startCloudBrowserLoginSession(sandbox, { targetUrl })
    return response.status(200).json({
      ok: true,
      sandbox: sandbox.name ?? sandbox.sandboxId ?? "ams-browser-worker",
      ...session,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "CLOUD_LOGIN_SESSION_FAILED"
    return response.status(503).json({ ok: false, code })
  }
}
