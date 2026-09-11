# AMS Agent Template v1

Every AMS agent must fit the same operating contract before it is promoted through Planned → Setup Required/Beta → Live.

## Required contract fields

- **Identity:** stable slug, customer-facing name, category and status.
- **Deliverable class:** text-native, artifact-native, or action-native.
- **Runtime:** shared content runtime, native workflow, connected tool, internal control plane, or explicitly unconfigured.
- **Billing:** shared generation credit, one-time checkout, subscription, internal, or explicitly unconfigured.
- **Context:** customer input, workspace profile, private assets, connected accounts, and/or public web sources.
- **Permissions:** every read, draft, write, publish, or billing capability must be declared.
- **Connections:** provider dependencies must be named; missing credentials fail closed.
- **Approval:** action-native work requires human approval; owner-level billing/control mutations require owner approval.
- **Isolation:** authorization and ownership use the stable signed customer subject, never email.
- **Untrusted data:** customer files, websites, account content, research results and model output never become system/tool instructions.
- **Idempotency:** external mutations require an idempotency key or equivalent provider-safe replay boundary.
- **Limits:** timeout, retry count, tool-call ceiling and external-mutation ceiling are explicit.
- **Audit state:** runs must record enough state to distinguish planned, attempted, succeeded, failed, refunded/rolled back, and externally delivered work.
- **Live proof:** Live requires evidence for the actual promised deliverable/action, not merely a model response or HTTP 200.

## Default safety posture

1. Fail closed when a credential, entitlement, connector, policy check, storage dependency, or external provider is unavailable.
2. Keep draft generation separate from external execution.
3. Never interpret a plan as proof that work happened.
4. Never let one customer subject read or mutate another customer's state.
5. Never place provider secrets in browser-visible state, logs, prompts, or model context.
6. Keep consequential actions approval-first until that exact action path is production-proven.
7. Prefer least-privilege scopes and reversible mutations.
8. Preserve a kill switch for executor families and a provider-specific disconnect/revoke path.
9. Use canary/beta proof before widening availability.
10. Keep billing and credit accounting independent from model success claims.

## Template release checklist

- Contract validates in CI.
- Secret scan passes.
- TypeScript, lint, application tests, production build and runtime/security smoke tests pass.
- Authentication and trusted-origin rules are verified.
- Tenant isolation is tested.
- Retry/idempotency behavior is tested.
- Failure state cannot render as success.
- Required connected account scopes are documented and minimized.
- Customer-visible copy accurately states whether the agent drafts, creates an artifact, or performs an external action.
- Live promotion occurs only after authenticated production proof of the named job.

## Operational controls to add before broad autonomous execution

The Overmind/executor layer should eventually enforce per-tenant budgets, provider rate limits, circuit breakers, egress allowlists, credential-rotation checks, retention/deletion policy, provenance/citation requirements, canary rollout, incident/audit export, backup/restore tests, executor health checks, and explicit rollback/compensation logic where providers support it.
