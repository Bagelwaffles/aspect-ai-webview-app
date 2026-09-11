import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  createOvermindAuthorizationCode,
  OVERMIND_OWNER_ISSUER,
  OVERMIND_OWNER_RESOURCE,
  validateOvermindOAuthClient,
} from "@/lib/server/overmind-mcp-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clean(value: FormDataEntryValue | string | null) {
  return typeof value === "string" ? value.trim() : ""
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function invalid(message: string, status = 400) {
  return NextResponse.json(
    { error: "invalid_request", error_description: message },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  )
}

function authorizationFields(source: URLSearchParams | FormData) {
  const read = (name: string) => source instanceof URLSearchParams ? source.get(name) : source.get(name)
  return {
    responseType: clean(read("response_type")),
    clientId: clean(read("client_id")),
    redirectUri: clean(read("redirect_uri")),
    state: clean(read("state")),
    scope: clean(read("scope")),
    resource: clean(read("resource")) || OVERMIND_OWNER_RESOURCE,
    codeChallenge: clean(read("code_challenge")),
    codeChallengeMethod: clean(read("code_challenge_method")),
  }
}

async function validateFields(fields: ReturnType<typeof authorizationFields>) {
  if (fields.responseType !== "code") throw new Error("response_type must be code")
  if (!fields.clientId || !fields.redirectUri || !fields.state) throw new Error("client_id, redirect_uri, and state are required")
  if (fields.resource !== OVERMIND_OWNER_RESOURCE) throw new Error("resource is not the owner-control MCP resource")
  if (fields.codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(fields.codeChallenge)) {
    throw new Error("PKCE S256 is required")
  }
  await validateOvermindOAuthClient(fields.clientId, fields.redirectUri)
}

export async function GET(request: NextRequest) {
  const fields = authorizationFields(request.nextUrl.searchParams)
  try {
    await validateFields(fields)
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "Invalid authorization request")
  }

  const owner = await authorizeOwnerApiRequest(request)
  if (!owner.ok) {
    const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`
    const login = new URL("/login", request.nextUrl.origin)
    login.searchParams.set("callbackUrl", callbackUrl)
    return NextResponse.redirect(login, 302)
  }

  const hidden = Object.entries({
    response_type: fields.responseType,
    client_id: fields.clientId,
    redirect_uri: fields.redirectUri,
    state: fields.state,
    scope: fields.scope,
    resource: fields.resource,
    code_challenge: fields.codeChallenge,
    code_challenge_method: fields.codeChallengeMethod,
  })
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}" />`)
    .join("")

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize Aspect Overmind Control</title><style>body{font-family:system-ui,sans-serif;background:#09090b;color:#fafafa;margin:0;display:grid;min-height:100vh;place-items:center;padding:24px}.card{max-width:640px;border:1px solid #3f3f46;background:#18181b;border-radius:16px;padding:28px;box-shadow:0 20px 60px #0008}h1{margin-top:0}p,li{color:#d4d4d8;line-height:1.55}.scope{font-family:monospace;background:#27272a;border-radius:8px;padding:10px;overflow-wrap:anywhere}.actions{display:flex;gap:12px;margin-top:24px}.approve{border:0;border-radius:10px;background:#7c3aed;color:white;font-weight:700;padding:12px 18px;cursor:pointer}.deny{color:#d4d4d8;padding:12px}</style></head><body><main class="card"><h1>Authorize Aspect Overmind Control</h1><p>ChatGPT Business is requesting access to the AMS owner task-control ledger.</p><ul><li>Create and inspect AMS tasks.</li><li>Approve, reject, or cancel exact task records.</li><li>Read immutable task audit history.</li></ul><p><strong>This authorization does not execute agents or external actions.</strong> It cannot publish, message, bill, delete, deploy, or modify provider accounts.</p><p class="scope">Requested scope: ${escapeHtml(fields.scope || "overmind.tasks.read overmind.tasks.write")}</p><form method="post" action="/api/mcp/oauth/authorize">${hidden}<input type="hidden" name="confirmation" value="AUTHORIZE_ASPECT_OVERMIND_CONTROL"/><div class="actions"><button class="approve" type="submit">Authorize owner control</button><a class="deny" href="/overmind">Cancel</a></div></form></main></body></html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  })
}

export async function POST(request: NextRequest) {
  const owner = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!owner.ok) return invalid(owner.code, owner.status)

  const form = await request.formData().catch(() => null)
  if (!form || clean(form.get("confirmation")) !== "AUTHORIZE_ASPECT_OVERMIND_CONTROL") {
    return invalid("Explicit owner confirmation is required")
  }
  const fields = authorizationFields(form)
  try {
    await validateFields(fields)
    const code = await createOvermindAuthorizationCode({
      clientId: fields.clientId,
      redirectUri: fields.redirectUri,
      actorSubject: owner.principal.subject,
      scope: fields.scope,
      resource: fields.resource,
      codeChallenge: fields.codeChallenge,
    })
    const redirect = new URL(fields.redirectUri)
    redirect.searchParams.set("code", code)
    redirect.searchParams.set("state", fields.state)
    redirect.searchParams.set("iss", OVERMIND_OWNER_ISSUER)
    return NextResponse.redirect(redirect, 303)
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "Authorization failed")
  }
}
