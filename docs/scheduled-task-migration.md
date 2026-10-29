# AMS scheduled task migration — production cutover gates

## 2026-10-08 verification checkpoint

Resumed from `ca0145d0d16eea0068194a830fdbda76f28ca51f`. That exact
head passed Secret scan, AMS Reconciliation CI (including isolated Redis and
runtime security probes), and both Git-backed Vercel previews. Main preview
deployment: `dpl_2Sk7TbkLCQ6pbcNZoJnMj94disY2`, READY, no alias error.
These are build/security checks, not Gmail integration proof.

Follow-up repairs persist `invalid_grant` refresh rejection for only the affected
slot so the dashboard requests reauthorization. `invalid_client` is a configuration
error; transient provider failures preserve existing grants. Callback feedback
uses a fixed allowlist and never renders Google error bodies, codes or tokens.
Date-only intelligence evidence is parsed in UTC to avoid host-timezone drift.

External blockers observed in this session:

- Google Cloud `https://console.cloud.google.com/auth/clients` rendered
  **Site Unavailable** in the provided cloud browser. No client registration,
  audience setting, Gmail API enablement, or owner consent was verified.
- Vercel protected-preview fetch reported `deployment_authentication_required`.
  It did not establish an authenticated AMS owner session or Gmail grant status.
- The returned Vercel environment metadata did not show preview
  `AMS_GMAIL_CLIENT_ID`, `AMS_GMAIL_CLIENT_SECRET`, `AMS_CONNECTION_ENCRYPTION_KEY`,
  `AMS_MONITOR_ALERT_WEBHOOK_SECRET`, `AMS_GMAIL_SEND_ENABLED`, or `AMS_OWNER_EMAIL`.
  The encryption key shown was production-only. Confirm missing configuration
  using the existing private settings; never paste secrets into chat or this repo.
- Neither live inbox scan nor received owner alert is proven. No receipt ID exists
  from this session. Automatic replies and all original 27 ChatGPT tasks remain
  unchanged; no production configuration or deployment was modified.

Owner continuation: open the existing Cloud project, enable Gmail API if needed,
preserve login redirects and add the exact callbacks below to the appropriate web
client. Add both authorized accounts to External Testing's test-user list. Supply
the missing preview-only configuration securely in Vercel, redeploy that reviewed
branch, sign into the owner dashboard, authorize each slot independently, then run
each Gmail monitor and the owner-alert test. Do not activate production at this step.

Policy review: Google's restricted-scope guidance permits an exception for a
single owner or a small group of personally known users, but it is **not automatic
approval of this project's combined public SaaS and owner-only OAuth client**.
The project audience, other clients/users and actual use must be checked. Testing
mail-scope grants last seven days. Non-exempt restricted data processed on a
third-party server requires verification/security assessment. Keep
`AMS_GMAIL_POLICY_APPROVED` unset until eligibility is established; no paid process
was initiated. Sources checked 2026-10-08:
https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
and https://support.google.com/cloud/answer/15549945.

Tracking: https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/261

This change extends the existing Next.js / Redis / GitHub Actions backend.
It does not rebuild agents or change billing, fulfillment, publishing approval,
OAuth, Android billing, or Windows workers. **Implementation is not production proof.**

## New replacements

| Original workload | Replacement | Desired schedule | Activation |
| --- | --- | --- | --- |
| Two overlapping AI platform intelligence watches | `ai-platform-intelligence` | Daily, 08:00 America/Chicago | Disabled until verified |
| SmokyBanana03 weekly producer brief | `smokybanana03-weekly-brief` | Sunday, 19:00 America/Chicago | Disabled until verified |

The weekly brief preserves Once Human sibling co-op, PS5-direct production,
titles/hooks/Shorts ideas, rituals, safety/licensed music, collaboration watchlist,
vault, branding, growth experiments and evidence-conditioned monetization.
It reads the existing Twitch archive, Stream Intelligence package, and render
queue. Missing YouTube analytics, follower/subscriber metrics and other unavailable
measurements are explicit; queue state is not external publishing verification.
No media is uploaded, edited, or made public by either new worker.

The intelligence watch uses reviewed official origins for v0, Manus, Anthropic,
Vercel, OpenAI, agent frameworks, automation and an emerging builder. Primary
publisher URLs, exact short text evidence and matching publication-date evidence
are required for each alert. New snapshots and publisher/day discoveries are
durable; unchanged snapshots do not call the model. Costs absent in sources are
unavailable. The fixed source list is a bounded watchlist, not exhaustive web search.
Source access and current HTML/date parsing must pass real production proof.

## Existing monitoring coverage and remaining external gaps

| Area | Existing actual data source | Coverage limitation / remaining proof |
| --- | --- | --- |
| Revenue / Quick Audit | Stripe Checkout + failure events; Redis fulfillment receipts | Six-hour lookback versus daily cron can miss sales/failures; bounded first page is not exhaustive; no first-sale draft parity proven |
| Fulfillment duplicates | Existing fulfillment idempotency and durable receipt paths | Must verify unchanged production behavior; monitor is not a replacement fulfillment engine |
| Infrastructure | Redis readiness and runtime configuration checks | Runtime log, deployment API, and third-party outage coverage are not equivalent to configuration checks |
| Workflows | Redis Overmind queue | Stalled stored records; not every external workflow |
| Social | Stored campaign/delivery records | Does not fetch all external platform analytics |
| Twitch | Media queue and render job store | Does not prove full external YouTube analytics / follower growth |
| Fiverr | Existing operations queue | Does not prove ingestion of current inbox, buyer messages, revisions or deadlines |
| Google Play | Runtime readiness / release configuration | Does not read Google Play review state or newly received official notifications |
| Visibility / catalog | Live website and canonical catalog | Does not query search indexing, backlinks or SERP snippets |
| Notifications | Existing signed alert webhook | Existing monitor HTTP acknowledgment lacks durable owner-delivery proof and retries |

Historical paused tasks remain disabled. One-time deployment/notification checks
and expired campaigns must never be replayed automatically. Personal finance and
private mailbox task contents are deliberately excluded from the public repository.
Do not claim these external monitoring gaps are complete based on queue checks.

## Configuration and scheduling

- Keep `vercel.json` and its existing daily monitoring cron unchanged.
- Confirm the intended Vercel team `team_tyt9FpAEguBeBOiFqBMO3Z`, project
  `prj_ovsfsfElhC0eywpVlk3dHSBi4qFZ` (`aspect-ai-overlord`) and actual plan.
  The supplied team ID omitted its final `Cg`; the verified account ID is
  `team_tyt9FpAEguBeBOiFqBMO3ZCg`. This is the same AMS project and domains,
  not a substitute deployment target. The actual plan is Hobby.
- The gated GitHub Actions workflow ticks hourly at minute 5, using the existing
  `production` environment and short-lived GitHub OIDC. This is independent of Windows and
  does not depend on Vercel's cron frequency allowance. GitHub schedule delivery
  is best effort, not an exact-minute guarantee. Due jobs run on the next tick.
- The worker validates the signed issuer, audience, repository ID, main ref,
  exact workflow, production environment and hosted runner. Only a signed
  `schedule` event records independent scheduled proof; workflow dispatch and
  owner/cron-secret requests cannot masquerade as that proof. No additional
  long-lived secret is needed. Set GitHub Actions variable
  `AMS_SCHEDULED_TASKS_ENABLED=true` only after the intended commit is deployed.
- Set production `AMS_SCHEDULED_TASKS_ENABLED=true`. Preserve owner/Redis/auth
  configuration. Explicitly configure `AMS_SCHEDULED_TASK_MODEL` to an approved
  model available in the existing AI Gateway; there is no silent paid fallback.
- Reuse `AMS_MONITOR_ALERT_WEBHOOK_URL` / `AMS_MONITOR_ALERT_WEBHOOK_SECRET`.
  The receiver must authenticate the signature, deduplicate `Idempotency-Key`,
  and return `{ "delivered": true, "deliveryId": "provider-receipt" }` only
  after actual owner-channel delivery. HTTP 200 alone leaves delivery pending.
  Receiver compatibility and a real received test alert are still required.

Owner controls: `/owner/scheduled-tasks`; API: `/api/internal/scheduled-tasks`.
Scheduler API: `/api/internal/scheduled-tasks/run`, protected by workflow-scoped
GitHub OIDC, with existing CRON_SECRET retained for controlled manual probes.
Owner mutations require both the owner session and trusted origin. Run-now calls
carry a UUID request key; repeated requests reuse the durable result.

Redis state is namespaced by an owner hash; it contains enabled state, next due,
attempt/success, separate scheduled proof, errors, backoff, discovery identifiers,
bounded execution history and notification receipts. Lease-protected writes and
compare-and-delete release prevent stale workers from overwriting newer state.
Missed schedules coalesce into one recovery run. Retries are bounded to four
worker attempts; notification retries to five. Owner retry can reopen exhausted
delivery. Worker execution is bounded; reading/generation alone has no financial,
publishing or customer communication side effects.

## Release and cutover evidence checklist

1. Required CI, secret scan, dependency audit, build and preview authentication /
   persistence / failure / retry checks pass on the exact head.
2. Confirm the tested merged commit reaches the intended project with READY status.
3. Verify source access, identity, data quality, notification receiver idempotency
   and actual owner-channel delivery. Verify the dashboard's durable result.
4. Resume each replacement after configuration checks, run a controlled real job,
   and prove a later **independent scheduled** run. Manual success is insufficient.
5. Check runtime logs and current workflows; do not alter public publishing flags.
6. Disable the corresponding original ChatGPT tasks one at a time only after each
   replacement passes all gates. Paused tasks remain paused. Never bulk-disable.

The preview Redis gate is now resolved; the remaining gates are preview owner
OAuth, Gmail/alert receiver delivery, real workload tests and independent
scheduled production proof. Keep the PR Draft and all original enabled tasks.

## Two-account Gmail monitoring: authorized scope and privacy gates (2026-10-06)

The owner requested **two separately monitored Gmail accounts**: one AMS business
inbox and one secondary inbox. Both identity/profile calls succeed using existing
ChatGPT Gmail connectors. **Those connector grants are NOT AMS backend OAuth grants**;
no backend monitoring, inbox read, or backend email delivery has been proven.
Do not include the owner's personal account address, message bodies, provider
refresh tokens, or mailbox contents in the public repository or PR logs.

Implement Gmail as an *additional, gated workstream*, not a silent expansion of
the currently disabled AI intelligence / creator jobs:

1. Use a separate explicit owner OAuth consent flow for **each** Gmail account,
   reusing the existing encrypted AMS connection vault and owner auth patterns.
   Require the expected email identity to match before persisting a grant. Offer
   independent connect/disconnect and status; never reuse YouTube/Google sign-in
   tokens for mailbox access.
2. Request the minimum scopes for the enabled feature: read-only access for
   owner-approved inbox monitoring, and `gmail.send` only for an explicitly
   authorized sender account. Do not request modify/forward/delete scopes.
   Consent verification may require Google OAuth verification and owner action.
3. Limit **secondary inbox** ingestion to narrowly defined business-operational
   signals and security/Google Play notifications; discard unrelated personal
   content. Allow the owner to adjust allowed categories/senders privately.
4. Use Gmail History/watch with renewal and reconciliation **if operationally
   supported**, otherwise bounded incremental polling with per-account cursors.
   Account-scoped dedup keys and encrypted state must prevent cross-account
   collisions; never assume one email equals two separate actionable events.
5. Persist only minimal metadata needed for categorization and audit, with
   redacted summaries and retention limits. Never write raw messages, snippets,
   attachment bytes, credentials or account IDs into public source or logs.
6. Enforce approval-first response and no automatic sends, labeling, archiving,
   deletions, or forwarding from either inbox. Dedicated notification sending is
   limited to opted-in owner alerts.
7. Verify each account with a real authorized backend read and independently
   persisted cursor, then verify primary sender -> intended recipient with a
   provider receipt and owner-confirmed delivery. Mock tests and ChatGPT connector
   access are not backend acceptance evidence.
8. Historical paused Gmail-related watches must remain paused unless approved,
   and their complete functionality must not be inferred from monitoring queues.

The accurate ChatGPT inventory was subsequently reconciled against the Personal
account to **27 tasks: 3 enabled, 17 paused, 7 completed**. The initial connector
listing omitted two task records. Do not retire or migrate private tasks by
inferring their presence from outdated service counters.

## 2026-10-06 dependency follow-up

- The original preview Redis 503 was repaired on an isolated Free-plan database;
  the verified READY preview runs commit `308b1c43a264bc0dcde2d2f5e4f75076c816616e`.
- Vercel project access works with the **corrected full** team ID
  `team_tyt9FpAEguBeBOiFqBMO3ZCg`. The direct create-deployment endpoint
  still rejects with 403; Git-backed previews or approved owner browser
  redeployment are the available release paths.
- Branch-only preview `NEXTAUTH_URL` and `PUBLIC_APP_URL` environment variables
  are now saved for the approved preview alias. A **fresh preview deployment**
  is required before they take effect. Production origin variables are untouched.
- Google Cloud must independently register the exact authorized preview Google
  OAuth callback, preserving production callbacks. Owner sign-in remains
  unverified until that registry update and a real browser test pass.
- The notification receiver and Gmail sender still require implementation and
  real delivery proof. Do not activate replacements, merge, or disable original
  ChatGPT tasks before independently scheduled production success.

## Implemented owner Gmail backend (disabled pending acceptance)

Separate owner-only OAuth routes bind `primary` and `secondary` to private
expected-account environment variables. OAuth attempts have encrypted PKCE
verifiers, 10-minute Redis TTL, single-use state, owner binding and HTTP-only
same-site cookies. The Google verified email must exactly match its slot.
Primary requests `openid email gmail.readonly gmail.send`; secondary requests
`openid email gmail.readonly`. Unexpected Gmail scopes are rejected. Existing
login, Drive and YouTube credentials are never repurposed.

The existing AES-256-GCM vault encryption functions are reused, with a private
owner/slot namespace. No credential is returned in connection status. Refresh
failure, identity changes, missing grants and expired Testing consent fail closed.
Testing grants are tracked conservatively at seven days and are prohibited in
Vercel production. `approved-owner-use` requires a separately recorded policy
approval; this flag must not be set as a workaround for verification.

### Exact additional Gmail redirect URIs

Register both slot callbacks on the existing dedicated Gmail-capable web client:

- Preview primary: `https://aspect-ai-overlord-git-81b2cf-kimberleyaversbiz-4131s-projects.vercel.app/api/owner/gmail/primary/callback`
- Preview secondary: `https://aspect-ai-overlord-git-81b2cf-kimberleyaversbiz-4131s-projects.vercel.app/api/owner/gmail/secondary/callback`
- Production primary: `https://www.aspectmarketingsolutions.app/api/owner/gmail/primary/callback`
- Production secondary: `https://www.aspectmarketingsolutions.app/api/owner/gmail/secondary/callback`

These are additional to the existing login `/api/auth/callback/google` redirect.
Preserve every existing production callback. Never register wildcards.

### Private configuration

Set server-side `AMS_GMAIL_CLIENT_ID`, `AMS_GMAIL_CLIENT_SECRET`,
`AMS_GMAIL_PRIMARY_EMAIL`, `AMS_GMAIL_SECONDARY_EMAIL`, existing
`AMS_CONNECTION_ENCRYPTION_KEY`, Redis and `AMS_OWNER_EMAIL`. Configure
`AMS_GMAIL_CONSENT_MODE=testing` for isolated preview acceptance. Production
needs `approved-owner-use` and `AMS_GMAIL_POLICY_APPROVED=true` only after the
owner verifies a valid no-assessment exception or approves any required review.
Do not purchase or initiate paid verification/security assessment.

Google classifies readonly as restricted and send as sensitive:
https://developers.google.com/workspace/gmail/api/auth/scopes . External Testing
refresh tokens expire in seven days for Gmail scopes:
https://developers.google.com/identity/protocols/oauth2 . Restricted server data
can require annual assessments; Google documents exceptions, including small
personal-use applications, but eligibility for this business-owner-only use
must be established rather than assumed:
https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification .
This implementation does not open Gmail access to customers or the public.

The two paused hourly workers share the existing scheduler, locks, histories,
retries and durable outbox. Polling uses fixed relevant search terms, optional
private `AMS_GMAIL_PRIMARY_BUSINESS_TERMS` and
`AMS_GMAIL_SECONDARY_BUSINESS_TERMS` (comma-separated, max 20). The default
business gate requires AMS/Quick Audit/Play context; broad personal Stripe or
Fiverr messages are discarded. Explicit business terms must be configured and
accepted to cover customer/order/payment subjects without AMS text. The Gmail
API still grants mailbox-wide readonly access: application filters limit
processing, not Google's underlying permissions. Matching metadata is untrusted
and does not authorize payments, replies or fulfillment.

Only From/Subject metadata is inspected transiently; no body, snippet,
attachment, raw subject or sender is stored or sent to a model. Results retain
message ID, category and received time in the protected owner dashboard. Each
account has its own message dedup hashes and bounded pagination checkpoint;
incomplete pages do not advance the completed time window. Histories are bounded
by the existing task engine. No Gmail modify/delete/archive/forward/reply API is
called. Pause/resume/history/retry controls apply independently to each worker.

Set `AMS_GMAIL_SEND_ENABLED=true` only after sender authorization. Point the
existing signed monitor webhook to the same environment's
`/api/internal/monitoring/email` receiver and configure its server-side signing
secret. Only signed scheduled-task envelopes are accepted. Generic owner-only
email contains dashboard navigation and severity, never message content or
private task results. Persistent send claims prevent concurrent or ambiguous
retries from sending duplicates; retries reconcile a matching RFC Message-ID in
the primary inbox. Send HTTP success alone does not count as delivery. An
uncertain pre-send crash may need owner reconciliation; automatic resend is
intentionally prohibited. Owner test controls use a stable request UUID and
record attempts/results in Redis with 30-day TTL. The inbox receipt must also
be independently confirmed by the owner during acceptance.

Required pre-merge gates: each real OAuth grant, wrong-account denial, each real
monitor run, business-filter coverage and personal-message exclusion, persisted
results/dashboard controls, real primary inbox receipt, recovery from revoked
consent/provider failure, and unchanged production login. Required pre-cutover:
exact production deployment and later independent scheduled execution. Keep all
27 ChatGPT records unchanged until individual replacement proof is complete.

### Protected preview notification transport

The AMS Vercel project enables Vercel Authentication on non-custom preview
domains. A server-side HTTP POST back to the protected preview alias can be
rejected by Vercel SSO before reaching the signed receiver, even if AMS owner
authentication is correct. No global protection bypass or temporary public
preview access was enabled.

To preserve preview protection, the internal scheduler and authenticated owner
test endpoint now invoke the same Gmail delivery implementation *in-process*
**only in Vercel preview** and **only when** the configured receiver exactly
matches the trusted app origin and
`/api/internal/monitoring/email`, with no URL query/hash. Both still require
the approved Gmail sender opt-in, encrypted vault and real provider receipt.
Other targets and production use the original HMAC-signed HTTPS receiver. The
public receiver's HMAC check stays enforced. Regression tests verify this
origin restriction and prohibit unapproved local dispatch. A real owner test
and actual inbox delivery are still required; passing a mock is insufficient.

The preview owner test will remain nonfunctional until Google Cloud registers
all relevant callbacks, the dedicated Gmail client credentials and isolated
vault key are supplied, both grants are given, and a server-side HMAC secret
and sender opt-in are configured. These prerequisites must not be faked.


### AMS automated business acknowledgements — owner-approved, staged OFF

The owner authorized automatic sending for **AMS business emails** on 2026-10-06.
The first implementation handles only high-confidence, **first-contact inquiry
acknowledgements** from the **primary** mailbox. It does not send general AI
answers, sales campaigns, personal email replies, refunds, invoice confirmations,
or messages claiming fulfillment. Secondary Gmail remains read-only.

Source: `lib/server/owner-gmail-autoreply.ts`, integrated into the existing
primary `runGmailMonitor` job; no new scheduler, mailbox connections or
credentials. An inbound message must be newly received (within two hours), in
the primary account and explicitly addressed to the primary account, have a
single non-owner sender, a safe RFC Message-ID/thread ID, a concise ASCII subject
clearly identifying AMS and a routine inquiry. Established threads, personal
mail, billing/refunds/disputes, Google Play/security warnings, automated senders,
mailing lists, bulk mail and mismatched Reply-To are ineligible.

The outgoing message is a fixed, truthful receipt only: it indicates that AMS
received the inquiry; it does not promise a completed action or response time.
Sending uses `gmail.send` only from the primary OAuth grant and Gmail's
thread context. Subjects/headers are sanitized. No inbound message body,
attachment or personal customer details are exposed to an AI model.

Feature is **disabled by default**. The operator must explicitly set both
`AMS_GMAIL_SEND_ENABLED=true` and `AMS_GMAIL_AUTOREPLY_ENABLED=true`
on the intended environment **after** successful independent Gmail consent,
trusted Google Cloud OAuth setup, policy approval where required, and successful
controlled live sender/recipient tests. The separate owner dashboard shows the
policy state; there is no implicit enablement by enabling the Gmail monitor.

An atomic Redis first-send claim is stored before Gmail API submission. Each
inbound message has only one attempt, using a 90-day durable dedup claim.
A bounded Redis quota limits the primary account to 20 auto replies per UTC
day. Ambiguous send results and quota exclusions are recorded for operator
review; ambiguous email sends are never retried automatically. Gmail HTTP send
acceptance is **not** proof of recipient mailbox delivery. Monitoring excludes
Sent and Drafts so AMS-generated replies do not trigger self-alert loops.

**Additional acceptance gates** before enabling:
1. Real provider-authorized primary and secondary Gmail grants (each account).
2. Confirm direct-contact inquiry gets exactly one generic acknowledgement
   in the same email thread, and owner verifies the recipient copy.
3. Confirm security, billing, refund, automated mail, secondary account,
   bounced replies, loops and unrelated personal messages get no auto reply.
4. Test repeated scans and simulated ambiguous Gmail send without duplicates,
   and rate-cap, disabled-mode and emergency-disable behavior.
5. Confirm provider terms, Gmail OAuth scope verification eligibility, privacy
   notices, and any applicable transactional/marketing email requirements. Do
   not start unsolicited promotional campaigns without explicit approval.

Further AMS automation may be added using trusted signed order/customer events,
but real payments, order fulfillment, account changes and substantive customer
commitments must never be inferred solely from untrusted email subject lines.

### Preview natural-expiry refresh acceptance (PR #262 remains on HOLD)

The owner dashboard exposes **Verify token refresh** only in Preview. Its
owner-authenticated, trusted-origin POST `/api/owner/gmail/verify-refresh`
accepts only `slot` and a UUID `requestId`; production returns 404. It does not
force expiry or request consent. A valid cached token yields `awaiting-expiry`;
retry with a new request ID after the reported access-token expiry.

After natural expiry, the existing refresh path exchanges the selected account's
refresh token and verifies encrypted replacement-token/expiry persistence by
reading back the sealed record internally. Two bounded metadata monitoring reads
replay the same checkpoint/cursor on private snapshots, proving deduplication
when repeated messages exist. The operation holds the existing task lease,
never writes task states or checkpoints, and blocks provider sends. Replies must
already be disabled. No owner alert is sent by this operation.

Evidence is stored separately for 30 days and available through the protected
GET with the same slot/request ID. It contains status, token-exchange HTTP status,
expiry and boolean/count checks, never credentials, addresses, message IDs,
content or raw provider responses. `passed` requires refresh, secure persistence,
replacement token, successful monitoring, a preserved existing checkpoint,
replay deduplication and an unchanged other account grant. An empty replay is
`inconclusive`, not a pass. Account-failure isolation is covered by synthetic
tests; do not deliberately invalidate a live grant.

Run each account independently in the existing connected Preview. Keep all 27
original tasks and paused states unchanged, owner alerts primary-only and PR #262
Draft/HOLD until both real refresh records pass and Google policy requirements
and remaining release checks are satisfied. Local mocked tests do not establish
real Google refresh acceptance.
