# AMS Webview-Native Staging Runbook

Date: 2026-08-03

## Architecture contract

This stack is for isolated, test-mode staging only.

| Service | Exact version | Host exposure | Purpose |
|---|---|---|---|
| Web | `node:22.22.1-alpine3.23` at pinned multi-platform digest | Loopback web port only | Next.js application |
| Redis | `redis:7.4.10-alpine3.21` | None | Persistent AMS state |
| Redis REST | `hiett/serverless-redis-http:0.0.10` | None | Existing `@upstash/redis` compatibility |

PostgreSQL and Neon wsproxy are not included. No relational schema has been approved.

## Prepare

1. Create an isolated staging host or VM that does not share production credentials or data.
2. Copy `.env.staging.example` to `.env.staging`.
3. Replace every placeholder with dedicated staging/test values.
4. Keep Relevance and n8n unset until their credentials and flows are independently approved.
5. Configure a host reverse proxy only after the stack is healthy. Forward it to the loopback-only web port; never expose Redis or Redis REST.

Validate configuration without starting containers:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml config
```

Start the stack:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml up --build -d
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
```

## Required infrastructure evidence

Readiness must return HTTP 200 and report Redis as `ready`:

```bash
curl --fail --silent http://127.0.0.1:3000/api/health
```

Prove fail-closed behavior:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml stop redis
curl --silent --output /tmp/ams-health-down.json --write-out '%{http_code}\n' http://127.0.0.1:3000/api/health
docker compose --env-file .env.staging -f docker-compose.staging.yml start redis
```

The outage request must return HTTP 503. After Redis recovers, readiness must return HTTP 200 again.

Prove persistence without publishing a Redis port:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml exec redis redis-cli SET ams:staging:persistence-check verified
docker compose --env-file .env.staging -f docker-compose.staging.yml restart redis
docker compose --env-file .env.staging -f docker-compose.staging.yml exec redis redis-cli GET ams:staging:persistence-check
docker compose --env-file .env.staging -f docker-compose.staging.yml exec redis redis-cli DEL ams:staging:persistence-check
```

The value after restart must be `verified`.

## Paid Content Agent evidence

Record timestamps, test account identity, Stripe test object IDs, HTTP results, and redacted application logs for every step. Never include secrets.

| Step | Required proof |
|---|---|
| 1. Authentication | Dedicated staging user signs in with the staging Google OAuth client |
| 2. Checkout | Authenticated user starts an approved recurring Stripe test checkout |
| 3. Entitlement | A verified, signed webhook grants the matching subscription and plan credits once |
| 4. Reservation | Content Agent request atomically reserves credits before provider execution |
| 5. Execution | Configured test AI provider returns schema-valid Content Agent output |
| 6. Saved run | Completed run appears only in the authenticated account's history |
| 7. Failure refund | Forced provider failure returns the reservation exactly once |
| 8. Reconciliation | Retry with the same idempotency key produces no duplicate provider call or debit |
| 9. Cancellation | Stripe test cancellation removes paid access |
| 10. Failed payment | Stripe test failed-payment lifecycle removes access and does not reset credits |

PR #14 is not ready to merge until all ten steps pass in this deployed stack.

## Content Agent reconciliation repair

The Content Agent can intentionally quarantine a run as `reconciliation` when credit state and run persistence cannot be proven consistent. Treat this as a financial hold, not a normal application error.

Required operator actions:

1. Pause production merge and keep the affected environment in test mode.
2. Capture the redacted account subject, run idempotency key, ledger idempotency key, Stripe test object IDs, HTTP status, response code, and timestamp.
3. Inspect the Redis run record and credit reservation record from inside the private staging network. Do not expose Redis or copy secrets into logs.
4. If the reservation is `reserved` and no output was released, refund the reservation once and mark the run `refunded`.
5. If the reservation is `committed` and staged output exists, release the staged output once and mark the run `succeeded`.
6. If the reservation is `committed` and no recoverable output exists, do not invent output. Record the loss, add a compensating credit top-up, and keep the run failed.
7. If the reservation and run disagree in any other way, keep the account blocked from automated repair and escalate before merge.
8. Add a regression test for the exact failure mode before retrying the ten-step staging sequence.

PR #14 is not merge-ready while any reconciliation state lacks a documented resolution and regression test.

## Stop without deleting persistent data

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down
```

Do not add `--volumes` unless explicit deletion of staging Redis data is intended and approved.

## Hold points

- Do not merge PR #14.
- Do not deploy this branch to production.
- Do not use live Stripe keys, products, customers, or webhooks.
- Do not change DNS, production Vercel settings, Supabase production, or Google Play production.
- Do not add PostgreSQL/wsproxy until a relational schema is reviewed and approved.
