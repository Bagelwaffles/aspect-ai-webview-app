# AMS n8n Dependency Exit Plan

Status date: 2026-08-20

## Goal

AMS core business must remain online and safe when n8n Cloud is unavailable, a trial ends, or a workflow host changes. n8n may remain useful as an optional automation worker, but it must not be the component that keeps the website alive or decides whether AMS can safely accept customer money.

## Current dependency map

### Critical — replace now

#### Quick Marketing Audit fulfillment

Current code path:

- `app/api/quick-marketing-audit/checkout/route.ts`
- `lib/server/quick-audit-checkout.ts`
- Stripe Checkout / Stripe webhook
- `lib/server/quick-audit-fulfillment.ts`
- `AMS_N8N_AUDIT_WEBHOOK_URL`
- n8n audit workflow

Risk: a customer can pay successfully while the downstream audit workflow is unavailable.

Safety action:

- The legacy live Stripe Payment Link is deactivated while fulfillment is unavailable.
- Production checkout now requires both `AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED=true` and `AMS_QUICK_AUDIT_FULFILLMENT_READY=true` before a Stripe Checkout Session can be created.
- The public audit page no longer falls back to a direct Stripe Payment Link when the custom checkout is unavailable.
- `AMS_QUICK_AUDIT_FULFILLMENT_READY` must remain false or unset until an end-to-end replacement delivery path is verified.

Target replacement:

1. Persist the paid order and intake in AMS-owned durable storage.
2. Generate/store the audit result through an AMS server-side fulfillment service rather than calling n8n as the required next hop.
3. Expose an operator-safe recovery/retry path.
4. Deliver the result through an independent delivery channel.
5. Only then set `AMS_QUICK_AUDIT_FULFILLMENT_READY=true` and re-enable public payment.

### Replace / decouple next

#### Internal Fiverr intake key naming

`app/api/internal/fiverr/intake/route.ts` is already app-native and does not require n8n execution, but it currently reuses `AMS_N8N_INTERNAL_KEY` as its internal authentication secret.

Target: migrate to a generic AMS internal gateway credential so Fiverr intake remains independent of n8n naming and lifecycle. Keep the old key only during a controlled compatibility window if required.

#### General AMS orchestrator gateway

Current code:

- `app/api/internal/n8n/orchestrator/route.ts`
- `lib/server/ams-n8n-webhook-client.ts`

Current actions include content and affiliate operations. This gateway is useful, but it is not required for the public website to render or for Browser Control to function.

Target: define an AMS task interface first. Implement critical actions natively or through replaceable providers. n8n can consume that interface as one worker implementation rather than being the interface itself.

### Can self-host

The existing n8n workflow assets under `automation/n8n/` and external workflows such as publishing/uploader automations can run on self-hosted n8n Community Edition when that is operationally useful.

Self-hosting is appropriate for:

- content workflow orchestration
- YouTube/publishing workflows
- affiliate workflow helpers
- non-critical notification and routing automations
- experimental agent chains

Self-hosted n8n must not become the only copy of customer order state or the only path that knows whether a customer paid.

### Optional / diagnostic only

#### n8n health telemetry

- `app/api/internal/n8n/health/route.ts`
- `lib/server/command-center-telemetry.ts`

These probe n8n health for the dashboard. If n8n is offline, AMS can report it as offline without taking down the site.

#### Legacy inbound n8n webhook

`app/api/webhooks/n8n/route.ts` is a legacy inbound route. Several actions are currently not implemented and it uses the obsolete `N8N_WEBHOOK_SECRET` name.

Target: verify no external caller still depends on it, then retire it or migrate the required actions to the generic AMS internal gateway.

## Core-survival architecture

AMS core should consist of:

1. **Vercel / Next.js** — website, customer/API routes, operator control plane.
2. **Stripe** — payment collection, only when fulfillment readiness is explicitly true.
3. **Durable AMS storage** — Redis/database state for orders, idempotency, jobs, and results.
4. **AMS Browser Worker** — optional workstation execution for approved browser tasks; not required for public website uptime.
5. **Replaceable automation workers** — n8n, local workers, provider APIs, or future agents connected behind AMS-owned interfaces.

The rule is: if a replaceable worker disappears, AMS should degrade visibly and safely, not accept money into a broken path and not take the website offline.

## Re-enable checklist for the $49 audit

Do not re-enable public payment until all are true:

- [ ] Paid Checkout Session is verified server-side.
- [ ] Intake is durably stored before generation begins.
- [ ] Fulfillment does not require n8n Cloud.
- [ ] Duplicate Stripe events cannot create duplicate fulfillment.
- [ ] Failed generation can be safely retried.
- [ ] Operator can see pending/failed/completed orders.
- [ ] Customer result is stored and retrievable.
- [ ] Delivery path is verified end-to-end.
- [ ] Production proof payment succeeds once with no duplicate fulfillment.
- [ ] `AMS_QUICK_AUDIT_FULFILLMENT_READY=true` is set only after the proof above.

## Operational rule

Paid third-party automation is an enhancement. AMS core business must survive without it.
