# PR #295: Stripe-origin NON-PAYMENT replay acceptance — rollback-first runbook

**Status:** Prepared source only. **NOT DEPLOYED. NOT ACCEPTED.**
**GitHub PR:** https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/295 (must remain Draft).
**No paid Checkout, fulfillment, live Stripe, mail, Vercel bypass, Production changes or merges.**

## What this tests — and what it does not

A disposable **Cloudflare Worker** receives only a signed `test_helpers.test_clock.created` event from Stripe TEST account `acct_1Smr2bGloGM6sjzB`. It atomically stores a single processing record in the existing isolated test Redis database, increasing `deliveryCount` whenever that **same** Stripe event ID is delivered again while `processingCount` remains 1.

This demonstrates **provider-origin HTTP transport replay detection** at a separate receipt-only endpoint. It **does not exercise** the application's paid `checkout.session.completed` fulfillment handler, audit generation or exactly-once delivery side effects. Do not mark paid-pilot E2E accepted.

Source: `tools/pr295-acceptance/stripe-replay-worker.mjs`. Local synthetic tests: `tests/pr295-disposable-stripe-receiver.test.mjs`. Use the script only as a **standalone new Worker**: do not add it as a route to AMS, PR #295's Vercel project, or any existing Worker.

## 0. Preflight: prove rollback BEFORE creating resources

1. Confirm ChatGPT Work has usable authenticated Chrome **and** owner access to Cloudflare Workers & Pages, Stripe account `acct_1Smr2bGloGM6sjzB` in **TEST** mode, and the separate Upstash test database `ams-main-test-audit-pilot-preview` (endpoint `pretty-crab-239388.upstash.io`). Do not print or read private key values.
2. Confirm **Cloudflare Workers Admin** capability, including a visible permanent **Delete Worker** control or documented authenticated deletion method. Cloudflare Worker *Editor* permission alone does **not** ensure deletion.
3. Confirm Stripe TEST dashboard can **disable AND permanently delete one new webhook destination** and independently re-list destinations. Prove the intended UI route to both controls before creation. Preserve the original endpoint `we_1U47cRGloGM6sjzBqvsquYWw` unchanged.
4. Confirm a **disposable limited Upstash ACL write credential** can be created, installed into the Worker as an encrypted Secret, and revoked **without rotating the shared credentials already used by Vercel**. Its key pattern must be confined to `ams:pr295:acceptance-v2:receipt:*` and permitted commands must be only those essential to the receipt EVAL script (including EVAL, HINCRBY, HSET, HGET, and EXPIRE). Test the exact ACL REST token against a disposable matching key, and verify that it cannot read/write an unrelated test key. Do not assume Upstash's ACL restrictions or token revocation work until these account-specific checks pass. If that is not possible, use a wholly separate disposable Redis database whose deletion is also verifiable. Do NOT place the existing shared Upstash standard token into Cloudflare.
5. Owner verifies the fresh Stripe endpoint signing secret can be pasted **directly from Stripe Dashboard into Cloudflare's encrypted Secret field**, without ChatGPT reading/displaying/copying the value into its own tool results, screenshots, prompts, logs, GitHub or files. Pause recording/automation during manual owner-only secret transfer; resume after secret is masked. If this cannot be done, STOP.
6. Confirm the proposed Worker has **no custom domain, custom routes, cron trigger, linked SaaS services, production Redis, traffic mirroring or external permissions**. Worker logging of headers and raw bodies must remain OFF.
7. Confirm the **supported provider-origin resend action** (Stripe Workbench delivery attempt resend or Stripe CLI `events resend`) can target the same new TEST destination and same event ID. Do not rely on manually replaying JSON or Stripe Dashboard's “Send test event” if it creates a NEW event ID.
8. Document resource names/IDs, expected URL, pre-test state, owner ability to delete, and exact reverse-order cleanup steps **privately, without secrets**. **No-GO** if any precondition cannot be independently verified.

No new Vercel project is needed. Existing Vercel SSO protection and unrelated shareable links must remain unchanged.

**Format requirement:** A Stripe **thin** event does not carry the full `data.object` snapshot required by `stripe-replay-worker.mjs` and is intentionally rejected. A thin destination receiving the event is a **configuration FAIL**, not evidence that replay suppression failed. The older real TEST event `evt_1UV254GloGM6sjzBKX3FWKG7` uses the snapshot format and was confirmed to have `data.object.object = test_helpers.test_clock`; it must NOT be resent or reused. Select snapshot explicitly when creating the NEW destination.

## 1. Deploy disabled, then securely arm

1. Choose a unique NEW Worker name `ams-pr295-replay-<random-suffix>`; paste the source from the committed file into the new Worker. Disable serving on custom domains. Deploy with `RECEIVER_ENABLED=false`. No existing Worker may be replaced.
2. Configure **plaintext environment variables** `UPSTASH_REST_URL=https://pretty-crab-239388.upstash.io/`, `RECEIVER_ENABLED=false`, `RECEIVER_UNTIL_UTC=<UTC ISO time>`. Initially choose a past timestamp to enforce denial.
3. Configure **encrypted Worker Secrets** `STRIPE_TEST_SIGNING_SECRET` and `UPSTASH_RECEIPT_WRITE_TOKEN`. The former must come from a brand-new test destination, and the latter must be a disposable ACL credential restricted to the dedicated Redis, **not a shared account token**. Do not disclose either value to the assistant.
4. In Stripe Workbench choose **Your account → Snapshot event payload** (NOT Thin), then create a new TEST webhook destination subscribing **ONLY** to `test_helpers.test_clock.created` at `https://<unique-worker>.<your-subdomain>.workers.dev/webhook`. Confirm the type is supported in this Stripe account before proceeding. Record its ID without the signing secret. Do not copy old endpoint settings.
5. Before opening intake, prove worker rejects disabled requests (HTTP 503), other routes (404), and invalid signatures (HTTP 400 after arming), without writing a Redis receipt. This is a *signed-only transport receiver*, not a private URL; protection depends on signature verification and the time gate.
6. When Stripe and cleanup controls are ready, set **`RECEIVER_UNTIL_UTC` to no more than 10 minutes ahead** and `RECEIVER_ENABLED=true`; deploy the changes. Verify the limited window and independent TEST account context. No clock extension without a new owner-approved attempt.

## 2. Two genuine Stripe-origin deliveries

1. Create **one** new NON-PAYMENT Stripe test-clock object in the TEST account. Identify its single `evt_...` event ID. Do not create a Checkout Session, PaymentIntent, or charge.
2. In Stripe's delivery history, verify **provider-origin** attempt #1 targeted the new destination, passed signature verification and produced HTTP 200 `FIRST_DELIVERY`. Record Stripe event ID, endpoint ID, attempt time and HTTP status.
3. Resend that **same event ID** from Stripe to that **same destination** via the supported Stripe Dashboard/CLI mechanism. Do not send a synthetic locally signed request as evidence. Verify provider-origin attempt #2, HTTP 200 `DUPLICATE_DELIVERY`, and the exact same event ID.
4. Independently read only the new Redis key `ams:pr295:acceptance-v2:receipt:<event-id>` via Upstash, checking `deliveryCount >= 2`, `processingCount = 1`, `status = completed` and event type. Preserve the evidence in a sanitized PR comment. This key has a 24-hour TTL. If the Worker emits HTTP 503 or the same-event redelivery cannot be proven from Stripe, mark FAIL/BLOCKED; do not interpret a test-only fixture as acceptance.

## 3. Same-session shutdown, deletion and proof

In this order, with no handoff to another session:

1. Change Worker `RECEIVER_ENABLED=false` and deploy or delete the Worker immediately; its ten-minute `RECEIVER_UNTIL_UTC` also fails closed.
2. Disable the **new** Stripe TEST destination, then **delete that destination**. Re-list destinations: verify it is absent and original endpoint `we_1U47cRGloGM6sjzBqvsquYWw` is still present, unmodified, enabled for `checkout.session.completed`.
3. **Delete the entire temporary Cloudflare Worker** (not just a previous deployment version), then independently verify the Worker is absent in Cloudflare and its former webhook URL does not serve a successful receipt response.
4. **Revoke the disposable Upstash ACL user/token**, or delete the fully disposable database if that alternate design was approved. Do not rotate shared database credentials. Verify the old disposable credential no longer works without exposing it to the assistant.
5. Confirm AMS Vercel's `Require Log In` protection remains enabled and no preview bypass was introduced. PR #295 must remain Draft and unmerged.
6. Publish sanitized evidence: TEST account, event ID, new destination ID, worker name, both Stripe delivery attempt timestamps/status codes, Redis deliveryCount and processingCount, final deletion/revocation checks, preserved original endpoint and Vercel SSO. **No secret text or raw event payload**.

If any setup, provider resend, deletion or secret revocation becomes uncertain, **stop the test immediately**. If resources already exist, prioritize disabling the Worker and the temporary Stripe destination, then complete deletion as authorized. Never claim SUCCESS until all acceptance **and cleanup** checks are independently verified.

## 4. Mandatory STOP-AND-REPORT format

**Use this exact format in the final Work response AND a sanitized PR #295 acceptance comment whenever a gate fails, the owner-only secret handoff is needed, a test fails, or cleanup cannot be independently verified.** Do not just say "blocked" or "please proceed." Report once at the stop point; do not repeat previously completed CI, engineering, synthetic, or Redis tests.

```text
PR #295 ACCEPTANCE REPORT
RESULT: BLOCKED / FAILED / PAUSED_FOR_OWNER / PASSED
PHASE: PRE-CREATION / CREDENTIAL-PREFLIGHT / RECEIVER-SETUP / STRIPE-DELIVERY / CLEANUP / FINAL-VERIFICATION
REPLAY ACCEPTANCE: NOT VERIFIED / VERIFIED (only with genuine same-event Stripe delivery evidence AND cleanup)
STOP TRIGGER: [one precise cause, with observed error or unavailable control; NO secrets]
LAST VERIFIED CHECKPOINT: [PR Draft state, head SHA, TEST account, and last verified safety gate]
GATES:
  Stripe CLI account and targeted same-event resend: PASS / FAIL / NOT VERIFIED
  Cloudflare create, delete and encrypted Secret controls: PASS / FAIL / NOT VERIFIED
  Restricted Redis ACL issuance and out-of-scope denial: PASS / FAIL / NOT VERIFIED
  Exact issued Redis REST token rejected after DELUSER: PASS / FAIL / NOT VERIFIED
  Owner-only secret transfer (automation paused, masked): COMPLETE / REQUIRED / NOT APPLICABLE
  Two provider-origin deliveries of the SAME event ID: PASS / FAIL / NOT ATTEMPTED
  Durable Redis duplicate suppression: PASS / FAIL / NOT ATTEMPTED
RESOURCE LEDGER:
  Cloudflare Worker: NOT CREATED / [name, status: disabled|deleted|still active]
  New Stripe TEST destination: NOT CREATED / [we_id, status: disabled|deleted|still active]
  Temporary Redis ACL user/token: NOT CREATED / [username only, revoked? YES|NO|NOT VERIFIED]
  Stripe non-payment event: NOT CREATED / [evt_id, attempts observed]
  Receipt key: NOT CREATED / [nonsecret key identifier, status]
CLEANUP:
  Temporary Worker and endpoint unreachable: NOT NEEDED / VERIFIED / INCOMPLETE
  New Stripe destination absent: NOT NEEDED / VERIFIED / INCOMPLETE
  Issued temporary Redis token rejected: NOT NEEDED / VERIFIED / INCOMPLETE
  Original we_1U47cRGloGM6sjzBqvsquYWw unchanged: VERIFIED / NOT VERIFIED
  AMS Vercel Require Log In unchanged: VERIFIED / NOT VERIFIED
  Production, payment, email, merge: NONE / [describe any exception immediately]
NEXT SAFE ACTION: [one specific action and actor, or "none until owner-only handoff"]
EVIDENCE: [nonsecret dashboard observations, API IDs, timestamp/status, GitHub PR comment URL]
```

**Decision rule:** `PASSED` is forbidden if any replay or mandatory teardown field is `NOT VERIFIED` or `INCOMPLETE`. A `200` from a simulated request, a Redis EVAL test, or a disabled old event's Resend button is not Stripe-origin acceptance. Never turn `NOT VERIFIED` into `PASS` based on a documented capability alone.

**If stopped before creation:** Keep every resource field `NOT CREATED` and cleanup `NOT NEEDED`; explicitly name the one remaining gate, not a vague recap. **If a temporary resource exists:** First fail-close intake and disable any new destination, then attempt the authorized deletion/revocation sequence in the SAME session. Record each resource ID and independent post-deletion observation; if removal fails, use `CLEANUP INCOMPLETE`, identify the exact residual resource, and stop without exposing credentials. Never hide a teardown failure.

**Owner-only handoff:** Use `PAUSED_FOR_OWNER` and identify the exact manual step (for example, issuing/revoking a disposable Upstash ACL REST token with credential masking and automation paused); do not ask the owner to paste passwords, signing secrets or tokens into ChatGPT. Resume only after the owner confirms the private handoff/revocation check succeeded, and independently recheck nonsecret status.

**Current known checkpoint — 27 October 2026:** Stripe Workbench browser Shell authenticated to TEST account `acct_1Smr2bGloGM6sjzB` and displayed `events resend --webhook-endpoint` targeting syntax; Cloudflare Worker create/delete and Secret controls and Stripe destination Add/Disable/Delete controls observed in Chrome. **Unverified blocker:** the exact issued restricted Upstash REST token being rejected after its ACL user is deleted; owner-only credential lifecycle not executed. No disposable Worker, destination, ACL user/token, new event, or receipt created at this checkpoint. Do not infer later state without fresh evidence.

## Implementation notes

- No Stripe API key is used by this Worker: the fresh destination's `whsec_` Secret authenticates webhook payloads; the code rejects live-mode events and non-test-clock event types.
- Signing verification uses Stripe's `t=...` and `v1=...` header with a five-minute timestamp tolerance and Web Crypto HMAC-SHA256; only the raw body is verified.
- Redis `EVAL` executes as an atomic event-id receipt update through Upstash REST. No customer records, checkout data, email or fulfillment calls are included.
- This procedure deliberately avoids the Vercel Preview SSO bypass problem by creating a standalone temporary receiver on a different provider. It does **not** relax AMS authentication.

Useful technical references: Cloudflare Worker secrets and delete-worker documentation; Upstash Redis REST/EVAL documentation; Stripe webhook endpoint API and authenticated retry/resend controls.

**STOP/GO checkpoint:** Read the mandatory report format above and latest PR #295 acceptance comment before acting. Browser-based Stripe CLI account identity and targeted resend syntax were verified at comment #6435483325; **restricted Upstash token invalidation after ACL user deletion and owner-only handoff remain NOT VERIFIED**. Keep the receiver uncreated and intake OFF until the rollback-first gate is independently met. Do not deploy automatically.
