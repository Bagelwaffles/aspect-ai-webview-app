import { NextRequest, NextResponse } from "next/server"

import { getAgentContract, listAgentContracts } from "@/lib/agent-contract-registry"
import { createOvermindPlan, overmindControlState } from "@/lib/server/overmind-control-plane"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MODERN_PROTOCOL = "2026-07-28"
const LEGACY_PROTOCOL = "2025-11-25"
const SERVER_INFO = {
  name: "ams-overmind",
  title: "Aspect Marketing Solutions Overmind",
  version: "1.0.0",
  description: "Read-only AMS control-plane bridge for ChatGPT Business developer-mode validation.",
  websiteUrl: "https://www.aspectmarketingsolutions.app/overmind",
} as const

const INSTRUCTIONS =
  "This AMS Overmind MCP bridge is read-only. It may inspect the public agent contract registry and create deterministic plans. It cannot publish, message, bill, delete, mutate customer systems, access customer files, or expose provider credentials."

type JsonRpcRequest = {
  jsonrpc?: unknown
  id?: unknown
  method?: unknown
  params?: unknown
}

type ToolDefinition = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: {
    readOnlyHint: true
    destructiveHint: false
    idempotentHint: true
    openWorldHint: false
  }
}

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const TOOLS: ToolDefinition[] = [
  {
    name: "ams_platform_status",
    title: "AMS platform status",
    description:
      "Return the current Aspect Overmind control state and high-level counts for AMS agent lifecycle statuses. Read-only and safe for health checks.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "ams_list_agents",
    title: "List AMS agents",
    description:
      "List AMS agent contracts, deliverable classes, lifecycle status, approval policy, runtime kind, required connections, and production-proof state. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          type: "string",
          enum: ["live", "beta", "setup-required", "blocked", "planned"],
          description: "Optional lifecycle status filter.",
        },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "ams_get_agent",
    title: "Get AMS agent contract",
    description:
      "Return one AMS agent contract by slug, including its deliverable class, permissions, required connections, and production-proof state. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["slug"],
      properties: {
        slug: {
          type: "string",
          minLength: 1,
          maxLength: 120,
          description: "Canonical AMS agent slug.",
        },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: "ams_plan_objective",
    title: "Plan an AMS objective",
    description:
      "Create a deterministic, planning-only AMS routing plan from the registered agent contracts. This tool never executes the plan.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["objective"],
      properties: {
        objective: {
          type: "string",
          minLength: 10,
          maxLength: 2000,
          description: "Business objective to route across AMS agents.",
        },
        requestedAgentSlugs: {
          type: "array",
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 120 },
          description: "Optional explicit agent slugs to evaluate for the plan.",
        },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
]

function responseHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  }
}

function serverMeta() {
  return {
    "io.modelcontextprotocol/serverInfo": SERVER_INFO,
  }
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
    { status: 200, headers: responseHeaders() },
  )
}

function rpcError(id: unknown, code: number, message: string, data?: Record<string, unknown>, httpStatus = 200) {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code,
        message,
        ...(data ? { data } : {}),
      },
    },
    { status: httpStatus, headers: responseHeaders() },
  )
}

function toolText(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function toolResult(value: Record<string, unknown>) {
  return {
    content: [{ type: "text", text: toolText(value) }],
    structuredContent: value,
    isError: false,
  }
}

function toolError(message: string, details?: Record<string, unknown>) {
  const value = { ok: false, error: message, ...(details ?? {}) }
  return {
    content: [{ type: "text", text: toolText(value) }],
    structuredContent: value,
    isError: true,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeStatus(value: unknown) {
  return typeof value === "string" && ["live", "beta", "setup-required", "blocked", "planned"].includes(value)
    ? value
    : null
}

function handleTool(name: string, rawArguments: unknown) {
  const args = isObject(rawArguments) ? rawArguments : {}

  if (name === "ams_platform_status") {
    const contracts = listAgentContracts()
    const counts = contracts.reduce<Record<string, number>>((result, contract) => {
      result[contract.status] = (result[contract.status] ?? 0) + 1
      return result
    }, {})
    return toolResult({
      ok: true,
      bridgeMode: "read-only",
      executionPerformed: false,
      control: overmindControlState(),
      agentCounts: counts,
      agentTotal: contracts.length,
    })
  }

  if (name === "ams_list_agents") {
    const status = normalizeStatus(args.status)
    if (args.status !== undefined && !status) {
      return toolError("INVALID_STATUS_FILTER")
    }
    const contracts = listAgentContracts().filter((contract) => !status || contract.status === status)
    return toolResult({
      ok: true,
      count: contracts.length,
      agents: contracts,
    })
  }

  if (name === "ams_get_agent") {
    const slug = typeof args.slug === "string" ? args.slug.trim() : ""
    if (!slug || slug.length > 120) return toolError("INVALID_AGENT_SLUG")
    const contract = getAgentContract(slug)
    if (!contract) return toolError("AGENT_NOT_FOUND", { slug })
    return toolResult({ ok: true, agent: contract })
  }

  if (name === "ams_plan_objective") {
    try {
      const plan = createOvermindPlan({
        objective: args.objective,
        ...(Array.isArray(args.requestedAgentSlugs)
          ? { requestedAgentSlugs: args.requestedAgentSlugs }
          : {}),
      })
      return toolResult({
        ok: true,
        plan,
        executionPerformed: false,
      })
    } catch {
      return toolError("INVALID_PLAN_REQUEST")
    }
  }

  return toolError("UNKNOWN_TOOL", { name })
}

function modernDiscovery(id: unknown) {
  return rpcResult(id, {
    supportedVersions: [MODERN_PROTOCOL, LEGACY_PROTOCOL],
    capabilities: { tools: { listChanged: false } },
    instructions: INSTRUCTIONS,
    ttlMs: 60_000,
    cacheScope: "public",
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
    return rpcError(null, -32700, "Parse error", undefined, 400)
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(body.id, -32600, "Invalid Request", undefined, 400)
  }

  if (body.method === "notifications/initialized" || body.method === "notifications/cancelled") {
    return new NextResponse(null, { status: 202, headers: { "Cache-Control": "no-store" } })
  }

  if (body.method === "server/discover") return modernDiscovery(body.id)
  if (body.method === "initialize") return legacyInitialize(body.id, body.params)
  if (body.method === "ping") return rpcResult(body.id, {})

  if (body.method === "tools/list") {
    return rpcResult(body.id, {
      tools: TOOLS,
      ttlMs: 60_000,
      cacheScope: "public",
    })
  }

  if (body.method === "tools/call") {
    if (!isObject(body.params) || typeof body.params.name !== "string") {
      return rpcError(body.id, -32602, "Invalid params")
    }
    return rpcResult(body.id, handleTool(body.params.name, body.params.arguments))
  }

  return rpcError(body.id, -32601, "Method not found")
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: SERVER_INFO.name,
      mode: "read-only",
      endpoint: "/api/mcp",
      supportedProtocols: [MODERN_PROTOCOL, LEGACY_PROTOCOL],
      note: "Use MCP Streamable HTTP POST requests. No mutation tools are exposed in this validation release.",
    },
    { status: 200, headers: responseHeaders() },
  )
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
      "Access-Control-Allow-Origin": "https://chatgpt.com",
      "Cache-Control": "no-store",
    },
  })
}
