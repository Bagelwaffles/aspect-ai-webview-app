# AMS Control Plane

Date: 2026-08-21

## Decision

The Vercel-hosted Next.js application in `Bagelwaffles/aspect-ai-webview-app` is the source-controlled AMS control plane for the current production launch.

The historical external `ams-api-gateway` / Cloudflare Worker is not part of this repository, has no Wrangler configuration here, and is not an approved dependency of the current production architecture. It must be treated as retired/orphaned infrastructure unless it is deliberately reintroduced later with source-controlled code, authenticated routes, persistence, tests, observability, and an explicit production approval.

This repository must not route production features through an undocumented external gateway.

## Supported production control-plane paths

The native Next.js API owns the current supported server responsibilities, including:

- Quick Marketing Audit checkout, result verification, Stripe webhook handling, launch-state checks, and native fulfillment.
- Customer authentication, Stripe entitlement reconciliation, credits, and billing-portal access where enabled.
- Protected internal n8n and Fiverr bridge routes.
- Protected browser-control coordination where its worker is paired and available.
- Content Agent execution only through its persisted, gated route when the provider launch gate is enabled.
- Internal administration, rate limits, health checks, and fail-closed security controls.

## Quarantined or unavailable surfaces

The following are not production agent backends and must not claim successful execution or persistence:

- Generic `/api/agents` create/update/delete operations until a tenant-scoped persistent agent store exists.
- `/api/agents/deploy` until deployment infrastructure is implemented and persisted.
- Generic deployment mutation/embed generation until a durable deployment store exists.
- Legacy `/api/ai/chat` and `/api/grok/chat`; paid execution belongs on the controlled Content Agent route.
- Relevance agent/workflow management until credentials are rotated, the provider is deliberately enabled, and end-to-end production validation passes.
- Static Grok agent metadata. It is a read-only launch catalog, not a database and not a provider execution engine.

## Persistence rule

Process-local memory, module-level Maps, hard-coded counters, generated IDs, or static arrays may be used only as clearly labeled metadata/test fixtures. They must never be presented as durable customer, agent, deployment, entitlement, payment, fulfillment, analytics, or execution state.

Any customer-visible or operational state that survives a request must use an approved persistent store and must have account/tenant isolation where applicable.

## Live-route acceptance rule

A route may be described as live only when all applicable controls are present and verified:

1. Authentication/authorization appropriate to the caller.
2. Durable persistence or a real upstream provider, not simulated state.
3. Fail-closed behavior when required dependencies are unavailable.
4. Idempotency for money movement, fulfillment, or other retry-sensitive operations.
5. Rate limiting and input validation where exposed to untrusted callers.
6. Automated tests for success, unauthorized access, dependency failure, and replay/retry behavior.
7. Observable health/error evidence sufficient to distinguish a real success from a placeholder response.
8. Production configuration is explicitly enabled rather than inferred from development defaults.

## External gateway retirement

No Cloudflare Worker source or Wrangler configuration exists in this repository as of this decision. Therefore AMS production code must not assume `ams-api-gateway` exists or is authoritative.

If an old Worker still exists in a Cloudflare account, it is an external cleanup item only. It should be disabled or deleted after confirming no external consumer still calls it. Removing that external resource is separate from this repository change and must not be claimed until verified in Cloudflare itself.

## Architecture principle

Prefer one auditable control plane over multiple partially configured gateways. Add a separate gateway only when a concrete requirement cannot be safely met by the native Next.js control plane and the new component has an owner, source-controlled configuration, tests, monitoring, and a documented failure model.
