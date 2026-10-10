# AMS owner Gmail manual deletion procedure

Status: executable operator runbook; no live deletion was performed during PR #270 validation.

This procedure applies only to the owner-only Gmail implementation prepared in draft PR #262. It is intentionally manual because AMS does not currently expose an in-product Gmail disconnect or deletion control.

## Required authorization and identity verification

Do not begin from an ordinary support email alone. The operator must record one deletion request ID (UUID) and verify all of the following:

1. The requester has an active, owner-authenticated AMS session whose signed principal is the configured `AMS_OWNER_EMAIL`.
2. A confirmation reply is received from that same configured owner mailbox and names exactly one slot, `primary` or `secondary`.
3. The requested mailbox equals the configured `AMS_GMAIL_PRIMARY_EMAIL` or `AMS_GMAIL_SECONDARY_EMAIL` for that slot. Never accept a mailbox address supplied only in the deletion request.
4. The owner confirms this exact consequence: the selected connection will stop working, its encrypted OAuth grant and Gmail-derived monitoring state will be deleted, and reauthorization will be required to reconnect it.

Record only the request UUID, UTC timestamps, verified slot, owner-hash prefix, verification methods, operator, result counts, and completion status. Do not copy email addresses, tokens, Redis values, message identifiers, subjects, senders, or fingerprints into the deletion record.

## Preconditions

- Automatic replies and Gmail sending are disabled.
- The selected `gmail-<slot>-monitor` task is paused.
- No authorization, refresh verification, checkpoint initialization, or task run is in progress for the selected slot.
- Use the production Redis/KV endpoint only after separate production approval. Load its URL and token through the existing secret manager; never paste them into a command, document, shell history, or ticket.
- Do not revoke either Google grant until the AMS-side deletion and isolation checks below succeed.

Compute the same lowercase owner hash used by the application without printing the address:

```powershell
$ownerAddress = $env:AMS_OWNER_EMAIL.Trim().ToLowerInvariant()
$ownerHash = [Convert]::ToHexString(
  [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($ownerAddress))
).ToLowerInvariant()
Remove-Variable ownerAddress
```

The two record namespaces are:

```text
ams:owner-gmail:v1:<ownerHash>:
ams:scheduled-tasks:v1:<ownerHash>:
```

## Precise deletion scope

For either slot, delete:

- `ams:owner-gmail:v1:<ownerHash>:<slot>` — encrypted access/refresh credentials and connection metadata.
- `ams:owner-gmail:v1:<ownerHash>:refresh-verification:<slot>:*` — Preview refresh evidence, which otherwise expires after 30 days.
- `ams:scheduled-tasks:v1:<ownerHash>:gmail-<slot>-monitor` — the selected monitor's checkpoints, bounded execution history, alert metadata, delivery receipt references, and deduplication fingerprints.

Before deletion, block new authorization attempts and wait at least 10 minutes so every encrypted `ams:owner-gmail:v1:<ownerHash>:oauth:*` attempt expires naturally. Confirm none remain. Do not delete an OAuth-attempt key whose slot cannot be established.

For the primary slot only, also delete:

- `ams:owner-gmail:v1:<ownerHash>:test:*` — owner test evidence, normally retained for 30 days.
- `ams:owner-gmail:v1:<ownerHash>:delivery:*` — owner-alert delivery/idempotency receipts.
- `ams:owner-gmail:v1:<ownerHash>:autoreply:*` — message-derived automatic-reply claims, normally retained for 90 days.
- `ams:owner-gmail:v1:<ownerHash>:autoreply-count:*` — daily rate-limit counters, normally retained for two days.

Do not delete the other slot's grant, refresh evidence, or scheduled-task record. Do not delete unrelated scheduled-task records. Scheduled-task definitions are code and are outside Redis deletion scope.

## Safe deletion execution

1. Read the selected task record and the other slot's grant and task record. Confirm the selected task has `enabled: false`. Calculate SHA-256 hashes of the raw other-slot records for later isolation comparison; do not log their values.
2. Acquire `ams:scheduled-tasks:v1:<ownerHash>:gmail-<slot>-monitor:lock` with a random UUID using `SET key value NX EX 180`. Stop if the result is not `OK`.
3. Enumerate the exact keys in scope with cursor-based `SCAN`, never `KEYS`. Review the category and count only. Stop if an unexpected key matches.
4. Execute one Redis Lua operation that first confirms the lock contains the operator's UUID and then deletes only the reviewed explicit key list. The lock key must be the first `KEYS` entry. Do not use a wildcard in `DEL`.

```lua
if redis.call('get', KEYS[1]) ~= ARGV[1] then return -1 end
local deleted = 0
for i = 2, #KEYS do deleted = deleted + redis.call('del', KEYS[i]) end
redis.call('del', KEYS[1])
return deleted
```

5. If Lua returns `-1`, treat the operation as not executed. Do not retry until the entire precondition and inventory sequence is repeated.
6. If the request also asks to terminate Google-side access, instruct the owner to revoke Aspect Marketing Solutions from that selected Google account only after AMS deletion succeeds. Revocation at Google is not evidence that AMS records were deleted.

## Completion evidence

The deletion is complete only when all checks pass:

- `EXISTS` is `0` for the selected encrypted grant and selected Gmail task record.
- Cursor-based `SCAN` returns no selected-slot refresh-verification keys and, for primary deletion, no primary-only test, delivery, autoreply, or counter keys.
- No owner OAuth-attempt keys remain after the ten-minute expiry window.
- The other slot's grant and task records still exist and their SHA-256 hashes match the pre-deletion hashes.
- A read-only scheduled-task listing reports the same complete definition count observed before deletion and unchanged states for every task except the intentionally deleted selected Gmail state. The selected definition must resolve to its standard disabled initial state if read again; do not resume it.
- Automatic replies remain disabled and no message or notification was sent.

Provide the owner a completion notice containing the request UUID, slot, UTC completion time, counts by record category, isolation checks, and any narrowly defined legal/security record retained. Never include Redis values or Gmail-derived content.

## Failure handling

If any precondition, lock, deletion count, or isolation check is unexpected, stop and mark the request `BLOCKED`. Preserve no data copy for rollback: retaining a backup would defeat the deletion request. Investigate from key names, counts, hashes, and application logs that contain no credentials or Gmail content.
