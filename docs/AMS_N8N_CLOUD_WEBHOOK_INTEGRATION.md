# AMS n8n Cloud gateway integration

## Phase

AMS n8n Cloud activation without `N8N_API_KEY`, n8n upgrade, External Secrets, or Project Variables.

## Architecture

```text
Browser/user
  -> authenticated AMS Vercel API route
  -> strict payload validation
  -> distributed rate limit
  -> idempotency reservation in existing Redis
  -> n8n production webhook using Header Auth credential
  -> structured n8n response
  -> safe customer response
```

The n8n webhook is never called from browser JavaScript. The only approved caller is the server-side AMS Vercel route.

## Required environment

```env
AMS_N8N_URL=https://aspectmarketingsolutions.app.n8n.cloud
AMS_N8N_ORCHESTRATOR_WEBHOOK_URL=https://aspectmarketingsolutions.app.n8n.cloud/webhook/ams-orchestrator
AMS_N8N_INTERNAL_KEY=<same newly rotated value stored in the n8n Header Auth credential>
AMS_APP_URL=https://aspectmarketingsolutions.app
```

`N8N_API_KEY` is not required and must not be part of startup readiness checks while the n8n Cloud trial blocks API access.

## Security note

The previously exposed webhook secret is compromised. Do not use, store, log, or commit that value.

Use a new high-entropy secret only in:

1. Vercel environment variable `AMS_N8N_INTERNAL_KEY`
2. n8n Header Auth credential for `AMS Orchestrator - v1`

Do not store the secret in source code, workflow JSON, n8n Project Variables, logs, or browser JavaScript.

## n8n workflow configuration

Workflow:

```text
AMS Orchestrator - v1
```

Production webhook:

```text
https://aspectmarketingsolutions.app.n8n.cloud/webhook/ams-orchestrator
```

Authentication:

```text
Header Auth
```

Header name:

```text
x-ams-internal-key
```

The owner must manually create the Header Auth credential in n8n and store the newly rotated secret there. This avoids External Secrets and Project Variables on the trial account.

## Gateway guard requirements

The AMS Vercel gateway must:

- reject unauthenticated website requests before calling n8n
- validate action and payload with a strict schema
- generate `x-request-id` and `idempotency-key` server-side
- reserve the idempotency key in Redis before calling n8n
- avoid duplicate downstream execution
- apply distributed rate limiting before n8n
- enforce payload-size and request-timeout limits
- fail closed when `AMS_N8N_INTERNAL_KEY` is missing or unsafe
- redact headers, secrets, tokens, keys, authorization data, and private fields from logs
- return structured JSON only

## Activation order

After the owner creates the n8n Header Auth credential, stores the same rotated value in Vercel, and controlled tests pass:

1. `AMS Orchestrator - v1`
2. `AMS Content Engine - Launch v1`

All other 14 workflows remain inactive.

## Paid services

Do not call xAI, OpenAI, Relevance AI, or any other paid provider during controlled tests. Do not enable Stripe checkout.
