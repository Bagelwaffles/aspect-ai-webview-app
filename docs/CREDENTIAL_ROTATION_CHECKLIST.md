# Credential Exposure Audit and Rotation Checklist

## Scope and method

- Worktree: `C:\AMS_Vault\_reconciliation_pr14`
- Branch: `feat/ams-controlled-reconciliation`
- Current-tree scope: all tracked files plus the intended untracked files in this reconciliation worktree.
- Historical scope: metadata-only classification of credential assignments in the branch `HEAD` version of `README.md`.
- Local `.env` files were not read. Ignore rules were verified for `.env`, `.env.local`, `.env.production`, and `.env.development.local`.
- Checks emitted credential type and file path only. No credential value was printed.

## Result

The current working tree is clean under the value-blind credential scan. References in `.env.example`, tests, CI, and documentation are placeholders, fixtures, environment-variable names, or secret-store references.

The branch history is not clean. The previous `README.md` revision contains both of these credential types:

- `RELEVANCE_API_KEY`
- `RELEVANCE_AUTH_TOKEN`

The working copy of `README.md` is redacted, but redaction does not revoke a credential or remove it from Git history. Provider-side rotation is required before merge.

## Required before merge

- [ ] Revoke and replace `RELEVANCE_API_KEY` in the provider account and each authorized runtime secret store.
- [ ] Revoke and replace `RELEVANCE_AUTH_TOKEN` in the provider account and each authorized runtime secret store.
- [ ] Confirm whether the duplicated opaque token was also used for OpenAI. If so, revoke and replace the applicable `OPENAI_API_KEY` or `API_KEY_OPENAI` credential.
- [x] Replace the two credential values in the current `README.md` with non-secret setup instructions.
- [ ] Verify provider-side revocation without printing or copying the old value.
- [ ] Decide whether repository-history rewriting is required. Do not rewrite shared history without repository-owner approval and a coordinated force-push plan.

## Storage checks

Verify these names in authorized secret stores only. Their absence from Git does not prove that deployment configuration exists.

- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Google/NextAuth: `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`
- AI: `XAI_API_KEY`, `OPENAI_API_KEY`, `API_KEY_OPENAI`
- Upstash/KV: `UPSTASH_REDIS_REST_TOKEN`, `KV_REST_API_TOKEN`
- Internal API: `AMS_INTERNAL_API_KEY`, `AMS_STRIPE_FULFILLMENT_SECRET`
- n8n: `N8N_WEBHOOK_SECRET`, `N8N_API_KEY`, `N8N_ENCRYPTION_KEY`
- Deployment: `VERCEL_TOKEN`, `VERCEL_ACCESS_TOKEN`, `RAILWAY_TOKEN`, `RAILWAY_API_TOKEN`

Do not copy values into source, reports, tickets, chat, or command output.
