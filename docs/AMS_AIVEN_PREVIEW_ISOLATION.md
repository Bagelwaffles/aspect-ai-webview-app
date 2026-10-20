# Owner Gmail Aiven Preview preparation — NOT DEPLOYED

Branch: feat/owner-gmail-aiven-preview-20261020, based on PR #262 at 429ed420.
Existing Upstash grants, task states, customer auth and YouTube remain unchanged.

## Deployment template (new development branch only)

- VERCEL_ENV=preview (platform supplied)
- AMS_OWNER_PREVIEW_STORE=aiven
- AMS_OWNER_VALKEY_URL=<new Free Valkey TLS URI; Vercel Secret>
- AMS_OWNER_VALKEY_CA=<only if Aiven requires its project CA>
- AMS_CONNECTION_ENCRYPTION_KEY=<new random 32-byte base64 key; Vercel Secret>
- AMS_GMAIL_SEND_ENABLED=false
- AMS_GMAIL_AUTOREPLY_ENABLED=false
- AMS_SCHEDULED_TASKS_ENABLED=false
- PUBLIC_APP_URL and NEXTAUTH_URL must match the new branch's verified Preview origin.
- Do not change GOOGLE_CLIENT_*, AMS_YOUTUBE_*, Upstash credentials or PR #262 overrides.

No real Gmail credentials or old grants should be copied into the test datastore.
Keep the owner IDs fixed and use a physically distinct Aiven endpoint. Do not use
an alternate Redis database number on the existing Upstash service as isolation.
The adapter only replaces owner Gmail/task storage; other app components retain
the existing transport. Review other components before granting a Preview login.

## Recovery and cutover gates

Before generating a deployment key, establish an owner-controlled password manager
or encrypted recovery destination. Save the exact key there, verify recovery with
a synthetic AES-GCM round trip, then transfer securely to branch-scoped Vercel
Secrets. Never print the key or commit it. Do not rotate the old encryption key.
Do not generate a key whose only durable copy is an unreadable Vercel Secret.

After Aiven sign-in: verify Free/$0, no trial, no payment details; create an empty
independent Valkey service; verify endpoint differs from Upstash. Run synthetic
TLS integration tests: GET/SET JSON, SET NX EX contention, expiration, Lua state
consume, conditional claim replacement, lease-fenced write/release, INCR+EXPIRE,
and scheduled result persistence/replay from a second connection. Use only
random synthetic keys and clean only those keys. Verify TLS rejects an untrusted
certificate. Confirm original grant/evidence hashes and task states unchanged.
Local transport tests do not replace this hosted-service acceptance.

The old client/grants remain on the original deployment. New OAuth grants require
separate owner consent after all isolation gates pass. Preserve the two prior
refresh records as historical evidence; do not treat them as new-client proof.
Rollback is to the original deployment/config/storage, never overwrite old keys.
This branch does not incorporate or replace main's seven newer commits; any later
integration must preserve the OAuth disclosure and Twitch/YouTube repairs.
