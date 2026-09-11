# Aspect Overmind Control Plane v1

## Goal

Aspect Overmind is the coordination layer for AMS. It should know which agents exist, what each one is allowed to do, what proof exists, which connectors are available, and which actions require an owner or customer approval.

Overmind is not a root credential and is not allowed to bypass the agent contracts.

## v1 scope

The first release is deliberately **planning-only**:

- owner-only registry inspection;
- deterministic routing plans against the canonical agent catalog;
- explicit blockers for Planned, Setup Required, Beta, or Blocked work;
- explicit approval requirements for action-native agents;
- no generic external executor;
- no hidden publishing, messaging, billing, deletion, store mutation, account mutation, or provider administration.

A plan response must report that execution did not occur.

## Target architecture

1. **Owner/tenant identity** — signed AMS sessions and stable customer subjects.
2. **Agent registry** — one versioned contract per catalog agent.
3. **Workspace context** — tenant-scoped business profile and customer assets.
4. **Connection vault** — encrypted provider tokens with least-privilege scopes and disconnect/revoke support.
5. **Planner** — chooses eligible agent contracts and reports blockers/approvals.
6. **Approval service** — immutable approval intent for consequential steps, with actor, scope, expiration and target.
7. **Executor adapters** — provider-specific code, never a universal shell/root token. Each adapter exposes only named operations.
8. **Audit/event log** — append-oriented run state, external identifiers, failure state and compensation/rollback result.
9. **Policy engine** — tenant budget, rate, data, permission, publication and billing rules.
10. **Observability** — executor health, provider latency/errors, spend/credits, retries, circuit breakers and incident state.
11. **Kill switches** — global and provider/agent scoped.

## Approval tiers

- **Read/draft:** may run within authenticated customer scope when the agent is Live and entitled.
- **Private artifact creation:** may create/persist customer-only artifacts within quota; export/public delivery remains separate.
- **Reversible mutation:** requires explicit approval until the exact mutation path is production-proven and policy permits delegation.
- **Publish/send/external side effect:** human approval required with exact target/content/action.
- **Billing, destructive changes, credential/security administration:** owner approval; no model-only authorization.

## ChatGPT/Work bridge

The safest way to make ChatGPT act as the AMS Overmind is to expose this control plane through a custom AMS plugin/integration whose tools map to narrow Overmind operations such as:

- list agent contracts/status;
- create a plan;
- inspect a task/run;
- request an approval;
- execute one already-approved adapter operation;
- read telemetry;
- stop/cancel an executor;
- revoke a customer connection.

The plugin should never receive raw provider secrets. The AMS server keeps secrets and performs provider calls. ChatGPT receives scoped tool results and structured errors.

## Before execution can be enabled

- persistent task/run store with idempotency;
- approval records bound to exact action payloads;
- executor adapter interface and allowlist;
- per-agent/provider kill switches;
- rate/cost budgets;
- structured audit events;
- provider-specific rollback/compensation where available;
- prompt-injection and untrusted-content tests;
- production proof for each adapter operation;
- incident-response and credential-rotation procedure;
- explicit owner decision on which low-risk actions may ever become delegated without per-action approval.

Until those gates pass, Overmind remains a planner and operator console rather than an autonomous root controller.
