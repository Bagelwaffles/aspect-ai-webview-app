# AMS n8n Cloud webhook integration

## Phase

AMS n8n Cloud integration without `N8N_API_KEY`.

## Required environment

```env
AMS_N8N_URL=https://aspectmarketingsolutions.app.n8n.cloud
AMS_N8N_ORCHESTRATOR_WEBHOOK_URL=https://aspectmarketingsolutions.app.n8n.cloud/webhook/ams-orchestrator
AMS_N8N_WEBHOOK_SECRET=<rotated secret stored securely>
AMS_APP_URL=https://aspectmarketingsolutions.app
```

`N8N_API_KEY` is not required and must not be part of startup readiness checks while the n8n Cloud trial blocks API access.

## Security note

The previous webhook secret was exposed in chat and is treated as compromised. Do not use, store, log, or commit that value. Generate a new high-entropy secret and store it only in Vercel and n8n before activating workflows.

## Request signing

The AMS server-only webhook client signs each outbound request with HMAC-SHA256.

Headers:

- `x-ams-timestamp`
- `x-ams-signature`
- `x-request-id`
- `idempotency-key`

Signature payload:

```text
timestamp + "." + exact raw JSON request body
```

Signature header format:

```text
sha256=<hex digest>
```

## n8n workflow guard requirements

Before publishing `AMS Orchestrator - v1`, the workflow must validate:

- missing signatures are rejected
- invalid signatures are rejected with constant-time comparison
- timestamps older than 5 minutes are rejected
- request schema is validated before action routing
- duplicate idempotency keys do not cause duplicate execution
- errors are structured JSON only
- logs redact authorization data, signatures, secrets, and private payload fields

Keep all workflows inactive until the rotated secret is present in both Vercel and n8n.

## Activation order

1. `AMS Orchestrator - v1`
2. `AMS Content Engine - Launch v1`

All other workflows remain inactive.

## Paid services

Do not call xAI, OpenAI, Relevance AI, or any other paid provider during controlled tests. Do not enable Stripe checkout.
