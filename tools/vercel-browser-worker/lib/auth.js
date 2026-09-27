import { timingSafeEqual } from "node:crypto"

function clean(value) {
  const result = typeof value === "string" ? value.trim() : ""
  return result || null
}

export function cloudDispatchConfigured(env = process.env) {
  const key = clean(env.AMS_CLOUD_BROWSER_DISPATCH_KEY)
  return Boolean(
    key &&
    key.length >= 32 &&
    !/(?:replace|placeholder|changeme|your)[-_ ]/iu.test(key),
  )
}

export function authorizeDispatch(request, env = process.env) {
  if (!cloudDispatchConfigured(env)) return false
  const configured = clean(env.AMS_CLOUD_BROWSER_DISPATCH_KEY)
  const raw = clean(request.headers.authorization)
  if (!configured || !raw?.startsWith("Bearer ")) return false
  const supplied = raw.slice("Bearer ".length).trim()
  const left = Buffer.from(configured, "utf8")
  const right = Buffer.from(supplied, "utf8")
  return left.length === right.length && timingSafeEqual(left, right)
}
