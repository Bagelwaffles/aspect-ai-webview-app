import { NextRequest, NextResponse } from "next/server"

import {
  approveOvermindTask,
  cancelOvermindTask,
  createOvermindTask,
  getOvermindTask,
  listOvermindTaskAudit,
  listOvermindTasks,
  rejectOvermindTask,
} from "@/lib/server/overmind-task-store"
import {
  OVERMIND_OWNER_RESOURCE,
  OVERMIND_TASK_READ_SCOPE,
  OVERMIND_TASK_WRITE_SCOPE,
  validateOvermindAccessToken,
  type OvermindOAuthPrincipal,
} from "@/lib/server/overmind-mcp-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MODERN_PROTOCOL = "2026-07-28"
const LEGACY_PROTOCOL = "2025-11-25"
const RESOURCE_METADATA = "https://www.aspectmarketingsolutions.app/.well-known/oauth-protected-resource"
const SERVER_INFO = {
  name: "ams-overmind-owner-control",
  title: "Aspect Overmind Owner Control",
  version: "1.0.0",
  description: "Owner-authenticated AMS task ledger control. No external agent executor is exposed.",
  websiteUrl: "https://www.aspectmarketingsolutions.app/overmind",
} as const

const INSTRUCTIONS =
  "This authenticated control plane may create and inspect AMS task records and approve, reject, or cancel exact task records. It does not execute agents or external actions. Never describe a task-state mutation as external execution."

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
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: false
  }
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const WRITE_SAFE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const WRITE_TERMINAL = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const

const TASK_STATUS = ["planned", "ready", "pending_approval", "approved", "rejected", "cancelled"]

const ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["agentSlug", "mode", "operation", "target", "summary"],
  properties: {
    agentSlug: { type: "string", minLength: 1, maxLength: 120 },
    mode: { type: "string", enum: ["read", "draft", "write", "publish", "billing"] },
    operation: { type: "string", minLength: 1, maxLength: 160 },
    target: { type: "string", minLength: 1, maxLength: 500 },
    summary: { type: "string", minLength: 1, maxLength: 1000 },
    parameters: {
      type: "object",
      maxProperties: 50,
      additionalProperties: { type: ["string", "number", "boolean", "null"] },
      description: "Non-secret scalar task parameters only. Secret/token/password/API-key fields are rejected server-side.",
    },
  },
}

const TOOLS: ToolDefinition[] = [
  {
    name: "ams_list_tasks",
    title: "List AMS Overmind tasks",
    description: "List durable AMS task-ledger records. Read-only; does not run any agent.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { status: { type: "string", enum: TASK_STATUS } },
    },
    annotations: READ_ONLY,
  },
  {
    name: "ams_get_task",
    title: "Get AMS Overmind task",
    description: "Read one exact AMS task record by UUID. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["taskId"],
      properties: { taskId: { type: "string", format: "uuid" } },
    },
    annotations: READ_ONLY,
  },
  {
    name: "ams_get_task_audit",
    title: "Get AMS task audit history",
    description: "Read append-oriented audit events for one task. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["taskId"],
      properties: { taskId: { type: "string", format: "uuid" } },
    },
    annotations: READ_ONLY,
  },
  {
    name: "ams_create_task",
    title: "Create AMS Overmind task",
    description: "Create one durable task record. Mutation tasks enter pending approval; this tool never executes the task. idempotencyKey prevents retry duplicates.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["objective", "action", "idempotencyKey"],
      properties: {
        objective: { type: "string", minLength: 10, maxLength: 2000 },
        action: ACTION_SCHEMA,
        idempotencyKey: { type: "string", minLength: 8, maxLength: 200, pattern: "^[A-Za-z0-9._:-]+$" },
      },
    },
    annotations: WRITE_SAFE,
  },
  {
    name: "ams_approve_task",
    title: "Approve exact AMS task",
    description: "Approve the exact action digest on a Live-agent mutation task for at most 30 minutes. This changes ledger state only and performs no execution.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["taskId", "actionDigest", "confirmation"],
      properties: {
        taskId: { type: "string", format: "uuid" },
        actionDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
        expiresInMinutes: { type: "integer", minimum: 1, maximum: 30 },
        confirmation: { type: "string", enum: ["APPROVE_OVERMIND_TASK"] },
      },
    },
    annotations: WRITE_SAFE,
  },
  {
    name: "ams_reject_task",
    title: "Reject AMS task",
    description: "Permanently reject a task that is awaiting approval. No agent or external action is executed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["taskId", "confirmation"],
      properties: {
        taskId: { type: "string", format: "uuid" },
        confirmation: { type: "string", enum: ["REJECT_OVERMIND_TASK"] },
      },
    },
    annotations: WRITE_TERMINAL,
  },
  {
    name: "ams_cancel_task",
    title: "Cancel AMS task",
    description: "Cancel a task so it cannot be executed later. No external action is performed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["taskId", "confirmation"],
      properties: {
        taskId: { type: "string", format: "uuid" },
        confirmation: { type: "string", enum: ["CANCEL_OVERMIND_TASK"] },
      },
    },
    annotations: WRITE_TERMINAL,
  },
]

const WRITE_TOOLS = new Set(["ams_create_task", "ams_approve_task", "ams_reject_task", "ams_cancel_task"])

function headers() {
  return { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function rpcResult(id: unknown, result: Record<string, unknown>) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    result: {
      ...result,
      _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
    },
  }, { status: 200, headers: headers() })
}

function rpcError(id: unknown, code: number, message: string, httpStatus = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status: httpStatus, headers: headers() })
}

function toolResult(value: Record<string, unknown>) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: false }
}

function toolError(code: string, detail?: string) {
  const value = { ok: false, code, ...(detail ? { detail } : {}), executionPerformed: false }
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: true }
}

function bearer(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? ""
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ""
}

function challenge(status = 401, insufficientScope?: string) {
  const parts = [
    `Bearer resource_metadata="${RESOURCE_METADATA}"`,
    `scope="${insufficientScope ?? `${OVERMIND_TASK_READ_SCOPE} ${OVERMIND_TASK_WRITE_SCOPE}`}"`,
  ]
  if (status === 403) parts.splice(1, 0, 'error="insufficient_scope"')
  return NextResponse.json(
    { ok: false, code: status === 403 ? "INSUFFICIENT_SCOPE" : "OAUTH_AUTHORIZATION_REQUIRED", resource: OVERMIND_OWNER_RESOURCE },
    { status, headers: { ...headers(), "WWW-Authenticate": parts.join(", ") } },
  )
}

async function authorize(request: NextRequest, requiredScope: typeof OVERMIND_TASK_READ_SCOPE | typeof OVERMIND_TASK_WRITE_SCOPE) {
  const token = bearer(request)
  if (!token) return { principal: null as OvermindOAuthPrincipal | null, response: challenge() }
  const principal = await validateOvermindAccessToken(token, requiredScope)
  if (principal) return { principal, response: null }
  if (requiredScope === OVERMIND_TASK_WRITE_SCOPE) {
    const readPrincipal = await validateOvermindAccessToken(token, OVERMIND_TASK_READ_SCOPE)
    if (readPrincipal) return { principal: null, response: challenge(403, OVERMIND_TASK_WRITE_SCOPE) }
  }
  return { principal: null, response: challenge() }
}

async function handleTool(name: string, rawArguments: unknown, principal: OvermindOAuthPrincipal) {
  const args = isObject(rawArguments) ? rawArguments : {}
  try {
    if (name === "ams_list_tasks") {
      const status = typeof args.status === "string" ? args.status : ""
      if (status && !TASK_STATUS.includes(status)) return toolError("INVALID_TASK_STATUS")
      const tasks = (await listOvermindTasks()).filter((task) => !status || task.status === status)
      return toolResult({ ok: true, count: tasks.length, tasks, executionPerformed: false })
    }
    if (name === "ams_get_task") {
      const taskId = typeof args.taskId === "string" ? args.taskId : ""
      const task = taskId ? await getOvermindTask(taskId) : null
      return task ? toolResult({ ok: true, task, executionPerformed: false }) : toolError("OVERMIND_TASK_NOT_FOUND")
    }
    if (name === "ams_get_task_audit") {
      const taskId = typeof args.taskId === "string" ? args.taskId : ""
      if (!taskId) return toolError("INVALID_TASK_ID")
      const task = await getOvermindTask(taskId)
      if (!task) return toolError("OVERMIND_TASK_NOT_FOUND")
      const audit = await listOvermindTaskAudit(taskId)
      return toolResult({ ok: true, taskId, count: audit.length, audit, executionPerformed: false })
    }
    if (name === "ams_create_task") {
      const objective = typeof args.objective === "string" ? args.objective : ""
      const idempotencyKey = typeof args.idempotencyKey === "string" ? args.idempotencyKey : ""
      const task = await createOvermindTask({ objective, action: args.action, idempotencyKey }, principal.actorSubject)
      return toolResult({ ok: true, task, executionPerformed: false })
    }
    if (name === "ams_approve_task") {
      if (args.confirmation !== "APPROVE_OVERMIND_TASK") return toolError("EXPLICIT_APPROVAL_CONFIRMATION_REQUIRED")
      const taskId = typeof args.taskId === "string" ? args.taskId : ""
      const actionDigest = typeof args.actionDigest === "string" ? args.actionDigest : ""
      const expiresInMinutes = typeof args.expiresInMinutes === "number" ? args.expiresInMinutes : undefined
      const task = await approveOvermindTask(taskId, { actionDigest, expiresInMinutes }, principal.actorSubject)
      return toolResult({ ok: true, task, executionPerformed: false })
    }
    if (name === "ams_reject_task") {
      if (args.confirmation !== "REJECT_OVERMIND_TASK") return toolError("EXPLICIT_REJECTION_CONFIRMATION_REQUIRED")
      const taskId = typeof args.taskId === "string" ? args.taskId : ""
      const task = await rejectOvermindTask(taskId, principal.actorSubject)
      return toolResult({ ok: true, task, executionPerformed: false })
    }
    if (name === "ams_cancel_task") {
      if (args.confirmation !== "CANCEL_OVERMIND_TASK") return toolError("EXPLICIT_CANCELLATION_CONFIRMATION_REQUIRED")
      const taskId = typeof args.taskId === "string" ? args.taskId : ""
      const task = await cancelOvermindTask(taskId, principal.actorSubject)
      return toolResult({ ok: true, task, executionPerformed: false })
    }
    return toolError("UNKNOWN_TOOL")
  } catch (error) {
    return toolError(error instanceof Error ? error.message : "OVERMIND_OWNER_CONTROL_FAILED")
  }
}

export async function POST(request: NextRequest) {
  let body: JsonRpcRequest
  try {
    body = (await request.json()) as JsonRpcRequest
  } catch {
    return rpcError(null, -32700, "Parse error", 400)
  }
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") return rpcError(body.id, -32600, "Invalid Request", 400)

  const toolName = body.method === "tools/call" && isObject(body.params) && typeof body.params.name === "string"
    ? body.params.name
    : ""
  const requiredScope = WRITE_TOOLS.has(toolName) ? OVERMIND_TASK_WRITE_SCOPE : OVERMIND_TASK_READ_SCOPE
  const auth = await authorize(request, requiredScope)
  if (!auth.principal) return auth.response!

  if (body.method === "notifications/initialized" || body.method === "notifications/cancelled") {
    return new NextResponse(null, { status: 202, headers: { "Cache-Control": "no-store" } })
  }
  if (body.method === "server/discover") {
    return rpcResult(body.id, {
      supportedVersions: [MODERN_PROTOCOL, LEGACY_PROTOCOL],
      capabilities: { tools: { listChanged: false } },
      instructions: INSTRUCTIONS,
      ttlMs: 60_000,
      cacheScope: "private",
    })
  }
  if (body.method === "initialize") {
    return rpcResult(body.id, {
      protocolVersion: LEGACY_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
    })
  }
  if (body.method === "ping") return rpcResult(body.id, {})
  if (body.method === "tools/list") {
    return rpcResult(body.id, { tools: TOOLS, ttlMs: 60_000, cacheScope: "private" })
  }
  if (body.method === "tools/call") {
    if (!isObject(body.params) || typeof body.params.name !== "string") return rpcError(body.id, -32602, "Invalid params")
    return rpcResult(body.id, await handleTool(body.params.name, body.params.arguments, auth.principal))
  }
  return rpcError(body.id, -32601, "Method not found")
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request, OVERMIND_TASK_READ_SCOPE)
  if (!auth.principal) return auth.response!
  return NextResponse.json({
    ok: true,
    service: SERVER_INFO.name,
    mode: "owner-task-control",
    endpoint: "/api/mcp/owner",
    executionEnabled: false,
    externalMutationEnabled: false,
  }, { status: 200, headers: headers() })
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
