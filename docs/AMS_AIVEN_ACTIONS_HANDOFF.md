# Aiven synthetic Actions handoff

Only branch `feat/owner-gmail-aiven-actions-20261020`; PR #262 and main are not modified.
Environment: `ams-aiven-synthetic`. Required reviewer: repository owner `Bagelwaffles`.
Administrator bypass disabled. Self-review must remain allowed because the owner is
both the push actor and the sole approved reviewer; the owner must manually approve.
Allowed ref: Branch `feat/owner-gmail-aiven-actions-20261020`, exact name, no wildcards or tags.

Before saving any credentials, verify these environment settings and the exact
workflow/test/adapter commit. Save existing test Aiven URI only as environment
secret `AMS_AIVEN_SYNTHETIC_URL`, never a repository or organization secret.
Optional `AMS_AIVEN_SYNTHETIC_CA` is only for the Aiven CA if necessary; TLS
verification must remain enabled. Never copy Upstash, Gmail, Vercel or n8n secrets.
No PR/fork event is configured. Job additionally checks repository, push event
and exact branch. A fork has its own environment and cannot inherit this secret.
Ref rules and required review protect against other workflows requesting the
same environment. Review all code at the actual run SHA before approving; a
branch rule is not an immutable code allowlist. Do not approve unexpected runs.

Test record keys use `ams:synthetic:<random-uuid>:` on the exact new Aiven endpoint.
Cleanup deletes only the five generated keys. All test keys expire within 300
seconds even if runner cancellation prevents cleanup. No scans, flushes, old
records, real grants or Google requests are used. Cross-connection persistence
is tested; service-restart/disk-recovery durability is NOT proven by this test.

## Owner Bitwarden recovery (before Vercel)

Use your existing Bitwarden Free vault; sign in/unlock yourself. Do not provide
master passwords or keys in chat. No new paid plan or account is required here.
Prepared helper: `scripts/aiven/owner-key-recovery.mjs`, owner-local operation only.
No deployment key has been generated. Use a private local directory outside any
repository/sync/shared folder, with file permissions restricted to your account.

1. Run `node scripts/aiven/owner-key-recovery.mjs generate <private-key-file> <proof-file>`.
2. Privately save the exact key in a Bitwarden item named `AMS isolated Gmail Preview encryption key`.
3. Lock and unlock Bitwarden; retrieve that saved item into a DIFFERENT private file.
4. Run `node scripts/aiven/owner-key-recovery.mjs verify <recovered-key-file> <proof-file>`.
5. Confirm the recovery PASS and owner vault retrieval; only then transfer the recovered
   value to branch-scoped Vercel `AMS_CONNECTION_ENCRYPTION_KEY`. Never log values.
6. Delete both temporary plaintext files after Vercel and recovery are verified.
   Keep the Bitwarden item; never export an unencrypted vault or use an Actions
   artifact, GitHub secret, chat, or an unreadable Vercel secret as the only backup.

## Cleanup

Keep old datastore/grants/checkpoints/refresh acceptance records and PR #262 unchanged.
After test work is finished, remove only this environment's test URI/CA secrets
and cancel obsolete pending test runs. Keep reviewer and exact-ref restrictions
while any test secret exists. No broad key deletion. No Aiven service deletion
or credential rotation without separately assessing dependent Preview configuration.
Prepare Vercel values only after live acceptance passes; do not deploy or activate.
