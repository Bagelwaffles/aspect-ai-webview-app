import { authorizeDispatch } from "../lib/auth.js"
import {
  getCloudBrowserSandbox,
  stopCloudBrowserSandbox,
} from "../lib/sandbox.js"

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    return response.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" })
  }
  if (!authorizeDispatch(request)) {
    return response.status(401).json({ ok: false, code: "CLOUD_BROWSER_UNAUTHORIZED" })
  }

  try {
    const sandbox = await getCloudBrowserSandbox()
    const sandboxName = sandbox.name ?? sandbox.sandboxId ?? "ams-browser-worker"
    await stopCloudBrowserSandbox(sandbox)
    return response.status(200).json({
      ok: true,
      sandbox: sandboxName,
      stopped: true,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "CLOUD_BROWSER_STOP_FAILED"
    return response.status(503).json({ ok: false, code })
  }
}
