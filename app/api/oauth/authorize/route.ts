import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { safeRelativeCallbackPath } from "@/app/lib/safe-relative-callback"
import { authOptions } from "@/lib/auth"
import { customerPrincipalFromSession } from "@/lib/server/customer-api-auth"
import {
  createOvermindAuthorizationCode,
  OVERMIND_OAUTH_ISSUER,
  validateOvermindAuthorizationRequest,
} from "@/lib/server/overmind-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type AuthInput = {
  response_type: string
  client_id: string
  redirect_uri: string
  scope?: string
  state: string
  code_challenge: string
  code_challenge_method: string
  resource: string
}

function inputFromSearch(params: URLSearchParams): AuthInput {
  return {
    response_type: params.get("response_type") ?? "",
    client_id: params.get("client_id") ?? "",
    redirect_uri: params.get("redirect_uri") ?? "",
    scope: params.get("scope") ?? undefined,
    state: params.get("state") ?? "",
    code_challenge: params.get("code_challenge") ?? "",
    code_challenge_method: params.get("code_challenge_method") ?? "",
    resource: params.get("resource") ?? "",
  }
}

function inputFromForm(form: FormData): AuthInput {
  const value = (key: string) => {
    const item = form.get(key)
    return typeof item === "string" ? item : ""
  }
  return {
    response_type: value("response_type"),
    client_id: value("client_id"),
    redirect_uri: value("redirect_uri"),
    scope: value("scope") || undefined,
    state: value("state"),
    code_challenge: value("code_challenge"),
    code_challenge_method: value("code_challenge_method"),
    resource: value("resource"),
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function html(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

async function ownerPrincipal() {
  const session = await getServerSession(authOptions).catch(() => null)
  const principal = customerPrincipalFromSession(session)
  if (!principal) return { kind: "missing" as const }
  const ownerEmail = process.env.AMS_OWNER_EMAIL?.trim().toLowerCase() ?? ""
  if (!ownerEmail || principal.billingEmail !== ownerEmail) return { kind: "forbidden" as const }
  return { kind: "owner" as const, principal }
}

function loginRedirect(request: NextRequest) {
  const relative = safeRelativeCallbackPath(`${request.nextUrl.pathname}${request.nextUrl.search}`, "/")
  const url = new URL("/login", request.url)
  url.searchParams.set("callbackUrl", relative)
  return NextResponse.redirect(url, 303)
}

function invalidRequest(message: string) {
  return html(`<!doctype html><html><body><h1>Authorization request rejected</h1><p>${escapeHtml(message)}</p></body></html>`, 400)
}

export async function GET(request: NextRequest) {
  const raw = inputFromSearch(request.nextUrl.searchParams)
  let validated: Awaited<ReturnType<typeof validateOvermindAuthorizationRequest>>
  try {
    validated = await validateOvermindAuthorizationRequest(raw)
  } catch (error) {
    return invalidRequest(error instanceof Error ? error.message : "INVALID_AUTHORIZATION_REQUEST")
  }

  const owner = await ownerPrincipal()
  if (owner.kind === "missing") return loginRedirect(request)
  if (owner.kind === "forbidden") {
    return html("<!doctype html><html><body><h1>Owner account required</h1><p>Sign out of AMS and sign back in with the configured owner account.</p></body></html>", 403)
  }

  const authorizeFields: Record<string, string> = {
    response_type: validated.request.response_type,
    client_id: validated.request.client_id,
    redirect_uri: validated.request.redirect_uri,
    scope: validated.request.scope ?? "",
    state: validated.request.state,
    code_challenge: validated.request.code_challenge,
    code_challenge_method: validated.request.code_challenge_method,
    resource: validated.request.resource,
  }
  const hidden = Object.entries(authorizeFields)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
    .join("")

  const deny = new URL(validated.request.redirect_uri)
  deny.searchParams.set("error", "access_denied")
  deny.searchParams.set("state", validated.request.state)
  deny.searchParams.set("iss", OVERMIND_OAUTH_ISSUER)

  return html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize Aspect Overmind Owner</title>
<style>body{font-family:system-ui;background:#09090b;color:#fafafa;margin:0;padding:32px}.card{max-width:640px;margin:8vh auto;background:#18181b;border:1px solid #3f3f46;border-radius:16px;padding:28px}h1{margin-top:0}.muted{color:#a1a1aa}.warn{background:#27272a;border-radius:10px;padding:14px;margin:18px 0}button,a{display:inline-block;padding:12px 18px;border-radius:10px;text-decoration:none}button{border:0;background:#fafafa;color:#09090b;font-weight:700;cursor:pointer}a{color:#d4d4d8;margin-left:8px}</style></head>
<body><main class="card"><h1>Authorize Aspect Overmind Owner</h1><p><strong>${escapeHtml(validated.client.clientName)}</strong> is requesting owner access to the AMS Overmind task-control plane.</p><p class="muted">Scopes: ${escapeHtml(validated.request.scopes.join(" "))}</p><div class="warn"><strong>No external execution is enabled.</strong> This connection can create durable task records, inspect them, approve exact action digests, and cancel tasks. It cannot publish, message, bill, delete, or run an external executor.</div><form method="post" action="/api/oauth/authorize">${hidden}<button type="submit">Authorize owner controls</button><a href="${escapeHtml(deny.toString())}">Deny</a></form></main></body></html>`)
}

export async function POST(request: NextRequest) {
  const owner = await ownerPrincipal()
  if (owner.kind === "missing") return html("<!doctype html><html><body><h1>Owner session required</h1><p>Restart authorization and sign in to AMS.</p></body></html>", 401)
  if (owner.kind === "forbidden") return html("<!doctype html><html><body><h1>Owner account required</h1></body></html>", 403)

  try {
    const result = await createOvermindAuthorizationCode(inputFromForm(await request.formData()), {
      subject: owner.principal.subject,
      email: owner.principal.billingEmail,
    })
    const redirect = new URL(result.request.redirect_uri)
    redirect.searchParams.set("code", result.code)
    redirect.searchParams.set("state", result.request.state)
    redirect.searchParams.set("iss", OVERMIND_OAUTH_ISSUER)
    return NextResponse.redirect(redirect, 303)
  } catch (error) {
    return invalidRequest(error instanceof Error ? error.message : "AUTHORIZATION_FAILED")
  }
}
