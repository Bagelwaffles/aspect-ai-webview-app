# n8n Header Auth diagnostic

Verified on 2026-08-05 for PR #17.

## Proven working

- Vercel Preview builds and deploys successfully.
- The authoritative n8n production webhook URL is reachable.
- Invalid Header Auth is rejected with HTTP 403.
- A direct authenticated request reaches `AMS Orchestrator - v1` and executes `status.ping`.
- `sendAmsN8nWebhook()` sends header `x-ams-internal-key` from `AMS_N8N_INTERNAL_KEY` after trimming surrounding whitespace.

## Remaining blocker

The Vercel Preview value pulled into `.vercel/.env.preview.local` is not the same value accepted by the n8n `AMS Internal Gateway` credential. The application code is not changing or replacing the secret.

The likely cause is overlapping or stale Vercel environment-variable definitions for `AMS_N8N_INTERNAL_KEY`.

## Required correction

1. Rotate the secret because it was visible during troubleshooting.
2. In Vercel, delete every existing `AMS_N8N_INTERNAL_KEY` definition.
3. Create exactly one sensitive variable named `AMS_N8N_INTERNAL_KEY` scoped to Production and Preview, with no custom branch.
4. Put the exact same newly generated value in the n8n `AMS Internal Gateway` Header Auth credential.
5. Save and republish `AMS Orchestrator - v1`.
6. Create a fresh Preview deployment from `restore/ams-n8n-cloud-webhook-client`.
7. Re-run the authenticated Preview workflow.

Do not merge PR #17 until the valid `status.ping` request returns structured JSON with `ok: true`, `status: accepted`, and `action: status.ping`.
