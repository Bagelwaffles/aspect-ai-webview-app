# Credential Exposure Audit and Rotation Checklist

## Current repository state

- Security branch: `security/api-key-cleanup-20260805`
- Base commit: `36d7ca8cf69773da3f045aa5e43895aa6431b2cd`
- Real environment files and private-key formats are ignored by Git and Docker.
- `.env.example` and `.env.staging.example` contain placeholders only.
- A value-blind tracked-file scanner runs in `.github/workflows/secret-scan.yml`.
- The scanner reports only file path, line number, and detector type; it never prints a suspected value.

## Known historical exposure

Repository history previously contained credentials assigned to:

- `RELEVANCE_API_KEY`
- `RELEVANCE_AUTH_TOKEN`

The current tree is redacted, but deleting a value from the current tree does not revoke it or remove it from Git history. Provider-side revocation remains mandatory.

## Required provider-side rotations

These operations cannot be proven by a source-code change. Complete them in the provider dashboards without pasting values into GitHub, chat, tickets, logs, or screenshots.

- [ ] Revoke and replace the historical `RELEVANCE_API_KEY`.
- [ ] Revoke and replace the historical `RELEVANCE_AUTH_TOKEN`.
- [ ] Confirm whether any historically duplicated opaque token was also used as `OPENAI_API_KEY` or `API_KEY_OPENAI`; revoke it if applicable.
- [ ] Rotate any Stripe secret or webhook secret ever pasted outside an approved secret store.
- [ ] Rotate any Vercel access token ever pasted into source, chat, or logs.
- [ ] Rotate any Upstash/Vercel KV token ever pasted outside Vercel or the provider dashboard.

## n8n and Vercel cleanup

Use only the current server-side names:

- `AMS_N8N_URL`
- `AMS_N8N_ORCHESTRATOR_WEBHOOK_URL`
- `AMS_N8N_INTERNAL_KEY`
- `AMS_APP_URL`

Delete obsolete or duplicate runtime entries unless another audited component still requires them:

- `N8N_BASE_URL`
- `N8N_WEBHOOK_SECRET`
- `N8N_API_KEY`

For `AMS_N8N_INTERNAL_KEY`:

1. Generate one new high-entropy secret outside chat.
2. Save it in the n8n Header Auth credential used by `AMS Orchestrator - v1`.
3. Header name must be `x-ams-internal-key`.
4. Save the exact same value in Vercel Preview and Production.
5. Remove branch-specific or duplicate Vercel entries that override the intended value.
6. Create a new Preview build and require the authenticated `status.ping` test to pass before merge or production promotion.

## Authorized secret stores

Store runtime values only in the relevant provider secret store:

- Vercel: application, Stripe, OAuth, Redis, internal API, AI, and n8n runtime secrets.
- GitHub Actions: deployment automation token only when a workflow requires it.
- n8n Credentials: n8n Header Auth value and provider credentials used inside workflows.
- Provider dashboards: the authoritative source for generating, revoking, and rotating credentials.

## Repository-history decision

- [ ] Decide whether history rewriting is required for the historical Relevance credentials.
- [ ] Do not rewrite shared history without repository-owner approval, coordinated force-push instructions, and immediate revocation of the exposed credentials.

## Verification gates

- [ ] `Secret scan` GitHub Action passes.
- [ ] No real `.env`, private key, credential JSON, or service-account file is tracked.
- [ ] Vercel Preview and Production contain one intentional entry per required secret.
- [ ] The n8n valid Header Auth probe succeeds; an invalid value remains rejected.
- [ ] No secret value appears in build output, runtime logs, PR comments, or browser bundles.
