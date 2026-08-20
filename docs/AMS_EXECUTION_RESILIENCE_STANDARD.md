# AMS Execution Resilience Standard

## Purpose

Aspect Marketing Solutions must remain operable when an external automation service, AI provider, marketplace, social platform, or vendor account is unavailable. External services may improve execution, but they must not silently become the system of record for paid orders, customer results, approvals, or critical business state.

## Core rule

**AMS owns the state. External services are replaceable workers.**

The normal shape for a customer-facing product or agent is:

`request -> AMS durable record -> validation/entitlement/payment -> execution adapter -> AMS durable result -> customer/operator view`

For external write actions, add an approval boundary before the adapter:

`request -> AMS durable record -> validation -> approval -> external write adapter -> AMS delivery proof`

## Required controls

### 1. Durable AMS-owned state

Before consequential work begins, AMS records enough state to recover safely. Depending on the feature this includes:

- stable request/run/order identifier;
- validated input fingerprint;
- customer or operator subject when applicable;
- entitlement/payment state;
- execution status;
- provider/destination status without storing provider secrets;
- staged output when needed for recovery;
- final output or delivery proof;
- timestamps and bounded retention;
- reconciliation state for ambiguous failures.

### 2. Idempotency and replay safety

Money, credits, publishing, account changes, order handling, and other consequential operations must have stable idempotency semantics. A retry must either return the existing result or resume a safe recovery path. It must not create a duplicate charge, duplicate credit deduction, duplicate publish, or duplicate fulfillment.

### 3. Fail closed around money and external writes

If payment fulfillment, authorization, durable storage, approval state, or destination verification is unavailable, AMS must stop before the consequential action. Marketing pages may remain visible, but checkout or write execution must not proceed on an unverified path.

### 4. Provider boundaries

AI models, n8n, social APIs, marketplaces, rendering systems, email providers, and other vendors are adapters. Product logic must not depend on vendor-specific state when an AMS-owned representation can be used instead.

Provider replacement should require changing the adapter, not redesigning customer order state or the public product.

### 5. Human approval for consequential public actions

Public posting, message sending, marketplace actions, payments, account changes, destructive changes, and unusual actions remain owner-approved unless a narrowly scoped action has separately passed production verification for safe automation.

Read-only inspection can be automated more freely when authentication and target controls are in place.

### 6. Customer result access

Customer results must be tied to independently verified authorization, entitlement, or paid-order state. A result page must never create a second charge or invent a completed result because fulfillment is delayed.

### 7. No false availability claims

Catalog status is evidence-based:

- **Live**: authenticated production run passed and intended users can use it.
- **Beta**: controlled production testing is working with restrictions and monitoring.
- **Setup Required**: implementation exists, but a required integration, owner setup, or final production proof remains.
- **Planned**: roadmap only; no customer execution route is presented as working.
- **Blocked**: a named dependency or owner action currently prevents progress.

A provider subscription ending, credential loss, or unavailable destination must update the catalog truth instead of leaving stale “online” language.

## Standard lifecycle

Not every feature must use identical database fields, but consequential executions should map to this conceptual lifecycle:

- `queued`: accepted into AMS-owned state;
- `running`: execution has a current lease/claim;
- `succeeded`: durable final result/delivery proof exists;
- `failed`: terminal failure with no ambiguous financial/write state;
- `refunded` when a reserved customer credit/payment unit is explicitly reversed;
- `reconciliation`: state is ambiguous and must not be treated as success.

Products with Stripe payments may use payment-specific names, but must preserve the same safety properties.

## Migration priority

1. **Paid revenue products.** No customer money may depend on a single optional automation vendor.
2. **Beta customer-facing agents.** Preserve existing durable state and isolate provider-specific execution.
3. **Setup-required publishing/commerce agents.** Build AMS-owned draft/job/approval/delivery state before reconnecting external write access.
4. **Internal operational agents.** Migrate where vendor loss would materially disrupt operations.
5. **Planned agents.** Do not build them merely to satisfy the standard. Apply the standard when they are promoted toward beta.

## Current migration map

### Quick Marketing Audit

State: native fulfillment deployed; live public checkout intentionally paused pending controlled end-to-end proof.

AMS now owns deterministic audit generation, durable result storage, Stripe-verified result access, replay safety, and customer result rendering. n8n is no longer required for the core fulfillment path.

Next gate: controlled Stripe test-mode purchase -> signed webhook -> durable native result -> verified customer retrieval -> replay check. Only then consider re-enabling live checkout.

### Content Agent

State: beta and already strongly aligned with this standard.

Existing protections include durable AMS run history, input fingerprinting, idempotency, customer authorization, entitlement checks, credit reservation/commit/refund, staged output, leases, and reconciliation handling.

Remaining dependency: generation is currently xAI-specific. The next resilience work should isolate provider selection behind a replaceable adapter without weakening output validation or silently downgrading paid output quality.

### AMS Fiverr Bridge / Browser Control

State: beta/read-only controlled phase.

AMS owns browser jobs, target allowlisting, risk classification, approvals, worker heartbeat, screenshots/evidence, and the audit trail. Fiverr credentials stay in the dedicated browser profile rather than AMS code or chat.

Next gate: prove one permitted real Fiverr session inspection and evidence cycle before expanding actions.

### Social Publisher / YouTube Uploader

State: setup required.

Before reconnecting authenticated publishing, AMS should own the draft, approval, publish job, destination identifier, provider response, and delivery proof. A provider outage must leave a retryable AMS job rather than losing the work.

### n8n Automation Agent

State: blocked while the prior n8n Cloud trial is unavailable.

n8n remains an acceptable optional or self-hosted worker. It is not a required foundation for AMS website uptime or paid fulfillment. Workflows that provide unique value can be restored on self-hosted Community Edition or migrated into native AMS routes when they become operational priorities.

## Cost rule

A paid provider may be used when its value justifies the cost, but AMS core business continuity should not require an unplanned subscription payment. If a paid provider is the only acceptable quality path for a feature, that feature must fail transparently and safely rather than charge a customer and hope the provider returns.

## Release gate

Before a product or agent is promoted toward Live, record evidence for:

- authentication/authorization;
- validated input;
- durable state creation;
- idempotent replay;
- provider/destination failure;
- storage failure;
- timeout/retry behavior;
- secret non-exposure;
- consequential-action approval where applicable;
- customer/operator result retrieval;
- production build/runtime security;
- one controlled authenticated production execution.
