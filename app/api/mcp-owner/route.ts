import { NextRequest, NextResponse } from "next/server"

import {
  OWNER_OVERMIND_TOOLS,
  handleOwnerOvermindTool,
  ownerToolDefinition,
} from "@/lib/server/overmind-owner-mcp"
import {
  accessTokenHasScope,
  bearerTokenFromAuthorizationHeader,
  OVERMIND_OAUTH_PROTECTED_RESOURCE_METADATA,
  OVERMIND_OAUTH_SCOPES,
  verifyOvermindAccessToken,
} from "@/lib/server/overmind-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MODERN_PROTOCOL = "2026-07-28"
const LEGACY_PROTOCOL = "2025-11-25"
const SERVER_INFO = {
  name: "ams-overmind-owner",
  title: "Aspect Overmind Owner Control",
  version: "1.0.0",
  description: "OAuth-protected AMS owner task and approval control plane. No generic executor is registered.",
  websiteUrl: "https://www.aspectmarketingsolutions.app/overmind",
} as const

const INSTRUCTIONS =
  "This owner-only AMS Overmind MCP server controls durable task records and approvals. It does not execute external actions. Creating, approving, or cancelling a task never proves that publishing, messaging, billing, deletion, or any other external mutation occurred."

type JsonRpcRequest = {
  jsonrpc?: unknown
  id?: unknown
  method?: unknown
  params?: unknown
}

function headers() {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  }
}

function serverMeta() {
  return { "io.modelcontextprotocol/serverInfo": SERVER_INFO }
}

function rpcResult(id: unknown, result: Record<string, unknown>) {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      result: {
        ...result,
        _meta: {
          ...(typeof result._meta === "object" && result._meta ? result._meta : {}),
          ...serverMeta(),
        },
      },
    },
    { status: 200, headers: headers() },
  )
}

function rpcError(id: unknown, code: number, message: string, httpStatus = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status: httpStatus, headers: { ...headers(), ...(extraHeaders ?? {}) } },
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function toolResult(value: Record<string, unknown>) {
  const isError = value.ok !== true
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError,
  }
}

function publicToolDefinitions() {
  return OWNER_OVERMIND_TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  }))
}

function authChallenge() {
  return `Bearer resource_metadata="${OVERMIND_OAUTH_PROTECTED_RESOURCE_METADATA}", scope="${OVERMIND_OAUTH_SCOPES.join(" ")}"`
}

async function authenticate(request: NextRequest) {
  const raw = bearerTokenFromAuthorizationHeader(request.headers.get("authorization"))
  if (!raw) return null
  return verifyOvermindAccessToken(raw)
}

function modernDiscovery(id: unknown) {
  return rpcResult(id, {
    supportedVersions: [MODERN_PROTOCOL, LEGACY_PROTOCOL],
    capabilities: { tools: { listChanged: false } },
    instructions: INSTRUCTIONS,
    ttlMs: 60_000,
    cacheScope: "private",
  })
}

function legacyInitialize(id: unknown, params: unknown) {
  const requested = isObject(params) && typeof params.protocolVersion === "string" ? params.protocolVersion : LEGACY_PROTOCOL
  const protocolVersion = requested === MODERN_PROTOCOL ? LEGACY_PROTOCOL : requested
  return rpcResult(id, {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  })
}

export async function POST(request: NextRequest) {
  let body: JsonRpcRequest
  try {
    body = (await request.json()) as JsonRpcRequest
  } catch {
    return rpcError(null, -32700, "Parse error", 400)
  }

  const principal = await authenticate(request).catch(() => null)
  if (!principal) {
    return rpcError(body.id, -32001, "OAuth authorization required", 401, {
      "WWW-Authenticate": authChallenge(),
    })
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(body.id, -32600, "Invalid Request", 400)
  }

  if (body.method === "notifications/initialized" || body.method === "notifications/cancelled") {
    return new NextResponse(null, { status: 202, headers: { "Cache-Control": "no-store" } })
  }

  if (body.method === "server/discover") return modernDiscovery(body.id)
  if (body.method === "initialize") return legacyInitialize(body.id, body.params)
  if (body.method === "ping") return rpcResult(body.id, {})

  if (body.method === "tools/list") {
    return rpcResult(body.id, {
      tools: publicToolDefinitions(),
      ttlMs: 60_000,
      cacheScope: "private",
    })
  }

  if (body.method === "tools/call") {
    if (!isObject(body.params) || typeof body.params.name !== "string") {
      return rpcError(body.id, -32602, "Invalid params")
    }
    const definition = ownerToolDefinition(body.params.name)
    if (!definition) return rpcResult(body.id, toolResult({ ok: false, error: "UNKNOWN_OWNER_TOOL", executionPerformed: false }))
    if (!accessTokenHasScope(principal, definition.requiredScope)) {
      return rpcResult(
        body.id,
        toolResult({ ok: false, error: "INSUFFICIENT_OAUTH_SCOPE", requiredScope: definition.requiredScope, executionPerformed: false }),
      )
    }
    const result = await handleOwnerOvermindTool(body.params.name, body.params.arguments, principal.ownerSubject)
    return rpcResult(body.id, toolResult(result))
  }

  return rpcError(body.id, -32601, "Method not found")
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: SERVER_INFO.name,
      mode: "owner-control-no-executor",
      endpoint: "/api/mcp-owner",
      authorization: "OAuth 2.1 bearer token required for MCP POST requests",
      protectedResourceMetadata: OVERMIND_OAUTH_PROTECTED_RESOURCE_METADATA,
      executionPerformed: false,
    },
    { status: 200, headers: headers() },
  )
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
      "Access-Control-Allow-Origin": "https://chatgpt.com",
      "Cache-Control": "no-store",
    },
  })
}
