import { authorizeDispatch } from "../lib/auth.js"
import {
  cloudBrowserSandboxStatus,
  getCloudBrowserSandbox,
} from "../lib/sandbox.js"

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET")
    return response.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" })
  }
  if (!authorizeDispatch(request)) {
    return response.status(401).json({ ok: false, code: "CLOUD_BROWSER_UNAUTHORIZED" })
  }

  try {
    const sandbox = await getCloudBrowserSandbox()
    const status = await cloudBrowserSandboxStatus(sandbox)
    return response.status(200).json({
      ok: true,
      sandbox: sandbox.name ?? sandbox.sandboxId ?? "ams-browser-worker",
      ...status,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "CLOUD_BROWSER_STATUS_FAILED"
    return response.status(503).json({ ok: false, code })
  }
}
