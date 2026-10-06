import { createPublicKey, verify } from "node:crypto"
const ISSUER = "https://token.actions.githubusercontent.com"
const AUDIENCE = "ams-scheduled-tasks"
type Claims = { iss?: unknown; aud?: unknown; sub?: unknown; exp?: unknown; nbf?: unknown; iat?: unknown; repository?: unknown; repository_id?: unknown; ref?: unknown; workflow_ref?: unknown; event_name?: unknown; environment?: unknown; runner_environment?: unknown }
export function validScheduledWorkerClaims(claims: Claims, now = Date.now()) {
  const seconds = Math.floor(now / 1000)
  return claims.iss === ISSUER && (claims.aud === AUDIENCE || (Array.isArray(claims.aud) && claims.aud.includes(AUDIENCE))) &&
    claims.sub === "repo:Bagelwaffles/aspect-ai-webview-app:environment:production" &&
    claims.repository === "Bagelwaffles/aspect-ai-webview-app" && claims.repository_id === "1026496028" &&
    claims.ref === "refs/heads/main" && claims.environment === "production" &&
    claims.workflow_ref === "Bagelwaffles/aspect-ai-webview-app/.github/workflows/scheduled-tasks-worker.yml@refs/heads/main" &&
    ["schedule", "workflow_dispatch"].includes(String(claims.event_name)) && claims.runner_environment === "github-hosted" &&
    typeof claims.exp === "number" && claims.exp > seconds && typeof claims.iat === "number" && claims.iat <= seconds + 30 && claims.iat >= seconds - 900 &&
    (claims.nbf === undefined || (typeof claims.nbf === "number" && claims.nbf <= seconds + 30))
}
export async function authorizeScheduledWorker(authorization: string | null, fetcher: typeof fetch = fetch): Promise<{ independentSchedule: boolean } | null> {
  if (!authorization?.startsWith("Bearer ") || authorization.length > 20_000) return null
  try {
    const parts = authorization.slice(7).trim().split(".")
    if (parts.length !== 3) return null
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string; kid?: string; typ?: string }
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Claims
    if (header.alg !== "RS256" || !header.kid || (header.typ !== undefined && header.typ !== "JWT") || !validScheduledWorkerClaims(claims)) return null
    const response = await fetcher(`${ISSUER}/.well-known/jwks`, { cache: "no-store", signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return null
    const jwks = await response.json() as { keys?: Array<JsonWebKey & { kid?: string; alg?: string }> }
    const jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === "RSA" && (!key.alg || key.alg === "RS256"))
    if (!jwk) return null
    const key = createPublicKey({ key: jwk as unknown as Record<string, string>, format: "jwk" })
    if (!verify("RSA-SHA256", new TextEncoder().encode(`${parts[0]}.${parts[1]}`), key, Uint8Array.from(Buffer.from(parts[2], "base64url")))) return null
    return { independentSchedule: claims.event_name === "schedule" }
  } catch { return null }
}
