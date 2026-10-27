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
4. Confirm a **disposable limited Upstash ACL write credential** can be created, installed into the Worker as an encrypted Secret, and revoked **without rotating the shared credentials already used by Vercel**. If that is not possible, use a wholly separate disposable Redis database whose deletion is also verifiable. Do NOT place the existing shared Upstash standard token into Cloudflare.
5. Owner verifies the fresh Stripe endpoint signing secret can be pasted **directly from Stripe Dashboard into Cloudflare's encrypted Secret field**, without ChatGPT reading/displaying/copying the value into its own tool results, screenshots, prompts, logs, GitHub or files. Pause recording/automation during manual owner-only secret transfer; resume after secret is masked. If this cannot be done, STOP.
6. Confirm the proposed Worker has **no custom domain, custom routes, cron trigger, linked SaaS services, production Redis, traffic mirroring or external permissions**. Worker logging of headers and raw bodies must remain OFF.
7. Confirm the **supported provider-origin resend action** (Stripe Workbench delivery attempt resend or Stripe CLI `events resend`) can target the same new TEST destination and same event ID. Do not rely on manually replaying JSON or Stripe Dashboard's “Send test event” if it creates a NEW event ID.
8. Document resource names/IDs, expected URL, pre-test state, owner ability to delete, and exact reverse-order cleanup steps **privately, without secrets**. **No-GO** if any precondition cannot be independently verified.

No new Vercel project is needed. Existing Vercel SSO protection and unrelated shareable links must remain unchanged.

## 1. Deploy disabled, then securely arm

1. Choose a unique NEW Worker name `ams-pr295-replay-<random-suffix>`; paste the source from the committed file into the new Worker. Disable serving on custom domains. Deploy with `RECEIVER_ENABLED=false`. No existing Worker may be replaced.
2. Configure **plaintext environment variables** `UPSTASH_REST_URL=https://pretty-crab-239388.upstash.io/`, `RECEIVER_ENABLED=false`, `RECEIVER_UNTIL_UTC=<UTC ISO time>`. Initially choose a past timestamp to enforce denial.
3. Configure **encrypted Worker Secrets** `STRIPE_TEST_SIGNING_SECRET` and `UPSTASH_RECEIPT_WRITE_TOKEN`. The former must come from a brand-new test destination, and the latter must be a disposable ACL credential restricted to the dedicated Redis, **not a shared account token**. Do not disclose either value to the assistant.
4. New Stripe TEST webhook destination subscribes **ONLY** to `test_helpers.test_clock.created` at `https://<unique-worker>.<your-subdomain>.workers.dev/webhook`. Confirm the type is supported in this Stripe account before proceeding. Record its ID without the signing secret. Do not copy old endpoint settings.
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

## Implementation notes

- No Stripe API key is used by this Worker: the fresh destination's `whsec_` Secret authenticates webhook payloads; the code rejects live-mode events and non-test-clock event types.
- Signing verification uses Stripe's `t=...` and `v1=...` header with a five-minute timestamp tolerance and Web Crypto HMAC-SHA256; only the raw body is verified.
- Redis `EVAL` executes as an atomic event-id receipt update through Upstash REST. No customer records, checkout data, email or fulfillment calls are included.
- This procedure deliberately avoids the Vercel Preview SSO bypass problem by creating a standalone temporary receiver on a different provider. It does **not** relax AMS authentication.

Useful technical references: Cloudflare Worker secrets and delete-worker documentation; Upstash Redis REST/EVAL documentation; Stripe webhook endpoint API and authenticated retry/resend controls.

**STOP/GO checkpoint as of authoring:** Source and runbook can be reviewed and tested offline. No Cloudflare account deletion permissions, restricted Upstash credential lifecycle or Stripe dashboard resend controls were independently verified in this chat. Therefore DO NOT deploy automatically.
