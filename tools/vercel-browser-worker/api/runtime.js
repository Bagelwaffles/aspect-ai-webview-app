export default function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET")
    return response.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" })
  }

  if (process.env.VERCEL_ENV !== "preview") {
    return response.status(404).json({ ok: false, code: "PREVIEW_ONLY" })
  }

  return response.status(200).json({
    ok: true,
    environment: "preview",
    nodeVersion: process.version,
  })
}
