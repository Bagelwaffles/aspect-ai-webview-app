# AMS Update and Repair Agents — bounded native pipeline

Status: **Preview-only proposal / not released**. Delivery tracker: [#279](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/279).

This adds a source-controlled maintenance evidence lane to the **existing** AMS Next.js/Vercel control plane. It does not start another agent platform and does not enable Overmind's generic executor. It is not a claim that AMS can autonomously rewrite and deploy arbitrary code.

## Current monitor inventory

| Producer | Current contract | Access / cost | Native ingestion |
| --- | --- | --- | --- |
| Backend monitoring | \`lib/server/backend-monitoring.ts\`: 10 checks, change events, Redis persistence | Existing Vercel cron and Upstash production credentials; existing service calls may have cost | New warning/critical events only, gated by \`AMS_MAINTENANCE_ENABLED=true\` |
| Dependabot | npm daily, Gradle and Actions weekly | GitHub-hosted; no new third-party charge | Already opens PRs; no duplicate native package upgrader |
| GitHub Actions | CI/security and scheduled creator workers on main | GitHub REST API public/read-only, optional read token for rate limits; at most one read per monitoring cron | Failed Secret scan or scheduled Twitch workers become deduplicated **escalation-only observations** under `AMS_MAINTENANCE_ENABLED=true`. Exact-head PR/check proof remains owner-only |
| AMS AI Platform Watch / Builder Update Agent | ChatGPT scheduled external intelligence evaluations | ChatGPT scheduled tasks and connected GitHub tools | **Not** wired to this Vercel endpoint; can independently prepare draft PRs |
| SmokyBanana03 Shorts Repair Watch | ChatGPT hourly diagnostic watch | Existing connected GitHub data | **Not** wired to this Vercel endpoint; independently proposes draft PRs |
| Twitch media monitor | Existing backend Twitch/render health | Existing provider configuration | Yes, when its backend monitor emits warning/critical events |

## Event lifecycle

1. Existing cron runs backend checks and persists changed warning/critical events.
2. If \`AMS_MAINTENANCE_ENABLED=true\`, ingest those events into \`ams:maintenance:v1\` in **that environment's configured Redis**. Never substitute the preview database for an unverified production datastore.
3. On the same guarded cron, inspect recent **main-branch** GitHub Actions for allowlisted genuine completed failures (not cancelled/idle). Validate exact own-repo run URL, SHA, date and attempt; ignore stale signals and store no arbitrary third-party instructions. GitHub API or Redis errors flag a failed source check without pretending there are zero defects.
4. Normalize source, timestamp, fingerprint, severity, probable impact, confidence, estimated cost, and policy. Reject stale/future events; deduplicate repeated observations; retain up to 250 indexed findings for 90 days.
5. Classify signals as **observed**, not verified defects. Billing, core infrastructure and Play release signals are escalation-only. Other backend events are candidates for an *isolated draft investigation*; a source observation is never code proof.
6. Owner-only, trusted-origin \`/api/internal/maintenance\` accepts external research as **unverified**, or attaches an actual **open draft PR** after independent GitHub head SHA / repository / branch / draft checks.
7. Owner can request verification of two required GitHub workflows against the **exact** PR head SHA: \`AMS Reconciliation CI\` and \`Secret scan\`. Both must be successfully completed. A failure or unavailable GitHub API fails closed.
8. There is **no merge, production deployment, live-write, payment, public publication, permission/credential update, or Android release API** in this pipeline. Those require the existing separately approved release controls and post-release evidence. \`checks_passed\` is not \`deployed\`.

## Controls

- All responses are owner-only except the existing CRON_SECRET-protected monitor execution. State-changing requests require a trusted application origin and authenticated owner.
- The ingestion switch defaults to OFF. It must be deliberately enabled in the **correct** Vercel environment after isolated validation. It controls event collection only, not automatic code changes.
- Redis absent/unavailable results in an explicit failure; no in-memory success or ephemeral queue substitution.
- External summaries/URLs are stored as **untrusted evidence**, never interpolated into prompts that execute commands or treated as code.
- Allow read/research/free isolated draft proposals. Spending, unknown costs, production changes, secrets, permission changes, publishing, outbound messages, deletes, GitHub merges, and unknown actions fail closed and require separate owner approval.
- Existing 27 scheduler tasks, Draft PRs #233/#262, payment flows, OAuth, creator selection/caps, customer entitlements, and live production are untouched.
- Optional \`AMS_MAINTENANCE_GITHUB_READ_TOKEN\` is for authenticated GitHub API *reads only* and must never be logged; a token is not required for public GitHub API reads if rate limits permit.

## API — owner-authenticated

\`GET /api/internal/maintenance\`: findings, observed states, and flag posture.

\`POST /api/internal/maintenance\`, trusted app origin and JSON:

- \`{ "action": "record_research", "area": "creator", "summary": "...", "sourceFingerprint": "unique-external-source-identifier", "sourceObservedAt": "2026-10-15T14:00:00.000Z", "evidenceUrl": "https://example.com/official-release" }\`: save unverified research; no provider claims are trusted.
- \`{ "action": "attach_draft_pr", "findingId": "<40-char digest>", "prNumber": 280, "headSha": "<40-char SHA>" }\`: independently validate and store an open, unmerged, same-repo **draft** PR targeting main.
- \`{ "action": "verify_pr_checks", "findingId": "<40-char digest>" }\`: verify both exact-head CI and secret-scan workflows and mark checks passed. Refuses missing/failed/stale statuses.

No action can approve or deploy production.

## Acceptance steps before declaring the repair agent Live

1. Draft PR CI and secret scan pass for this feature; the CI-only Redis acceptance (persistent write, dedup, readback and cleanup) passes against the isolated container; preview build reaches READY.
2. On an isolated Preview with the correct **Preview Redis**, enable collection intentionally, trigger a controlled non-billing monitor warning, and verify one persisted finding and no duplicate on replay.
3. Verify owner-only 401/403 responses and test bad evidence, stale events, Redis down, failed provider checks, and GitHub rate limits.
4. Use a *real* low-risk GitHub defect or security update as input to the **external** scheduled coding workflow: create an isolated actual patch PR with regression tests, attach exact PR head, and verify CI through this API. No simulated patch may qualify.
5. Obtain distinct owner-approved merge/release, verify Vercel READY exact commit, observe recovery on a later monitor run, and record the deployment evidence. This release/post-deploy executor is intentionally **not** implemented in this PR.
6. Prove actual external monitor-to-native ingestion or explicitly keep external watches as a separate producer path. Without that proof, call the native Update/Repair Agents **setup-required**, not Live.

## Preview Redis incident and recovery evidence (October 15–16, 2026)

- GitHub PR #280 full reconciliation CI and secret scan both passed on commit \`1eb7041a84409aa7bd5152ebe9811fdfb702583b\`. That CI used an **isolated disposable Redis container**, not the Vercel Preview datastore.
- The corresponding Vercel Preview build was READY, but **runtime** \`GET /api/health\` reported HTTP 503 (\`environment=preview\`, Redis \`configured=true\`, \`status=unavailable\`). READY is not the same as application readiness.
- The existing connected Upstash database \`ams-scheduled-tasks-preview\` was verified active, and a direct \`PING\` returned \`PONG\`. This alone does not prove the Vercel Preview app was configured with valid credentials.
- Vercel listed no Redis environment-variable overrides for this feature branch. A **preview-branch-scoped** REST URL and sensitive REST token were added to \`aspect-ai-overlord\` for this branch only, pointing to the *existing* Upstash Preview database. Token values were never committed, printed, or added to logs; Production variables were not changed.
- Vercel's connected direct-create-deployment API returned HTTP 403 (\`forbidden\`), so new preview deployment must be triggered via the pre-existing GitHub integration. Do not change permissions or switch to Production.
- **Required next acceptance:** On the new exact-commit Preview deployment, recheck \`/api/health\` (must return HTTP 200 and Redis ready), then verify app owner-only access. Only after that should a **Preview-only** \`AMS_MAINTENANCE_ENABLED=true\` gate be considered for a controlled warning/dedup scenario. Namespace all new keys with \`ams:maintenance:v1:\`; do not read or modify any older scheduled tasks in this shared Preview database.
- If Preview health still reports unavailable, hold release, diagnose the actual Vercel Preview variable resolution without copying Production tokens or suppressing readiness checks.

## Owner-operated ACI Preview acceptance control

The owner-only maintenance dashboard now exposes a **single-click acceptance
runner only** when both conditions are true:
- \`VERCEL_ENV=preview\`
- \`VERCEL_GIT_COMMIT_REF=feat/ams-maintenance-agent-pipeline-20261015\`

It is intentionally absent from Production and other Preview branches. The
server-rendered dashboard still requires the existing internal-admin session;
the submission API independently requires the signed-in Google customer
session matching \`AMS_OWNER_EMAIL\` and a trusted same-origin POST.

The client runner uses the existing \`/api/internal/maintenance\` contract and
a fixed public OpenAI trace-grading documentation reference. It performs:
1. \`record_research\` with a stable deduplication fingerprint and current
   observation timestamp;
2. owner API GET readback and source/origin/state checks;
3. an identical replay that must return \`new=false\`;
4. another GET readback;
5. \`attach_draft_pr\` for the exact existing open Draft PR #328 and pinned
   head SHA \`e4791b0546c35d4024defdbb79be9d30410f70cc\`;
6. \`verify_pr_checks\` for the exact attached SHA; and
7. final GET readback confirming \`checks_passed\` and the same PR/head.

The sequence is idempotent and resumable after partial completion: it reuses
the same finding fingerprint, accepts a verified existing attachment, and
never creates a new PR. If a source, head SHA, auth response, replay result,
or CI status does not match, it stops and displays the exact failure code.
It never retries a failed API action in a loop.

This is a **Preview acceptance test**, not a live agent, not an auto-running
cron, and not a production learning feature. The owner must click the button
while signed in to the exact Preview. The existing cron and all production
release controls remain OFF/unchanged. A successful run proves the
research-to-maintenance persistence and exact-head evidence lane only; it
does not prove real model performance improvement or authorize release.

## Trusted-origin rejection diagnosis and safe retry

The owner acceptance UI performs a **read-only owner-authenticated** \`diagnose_origin\`
POST before any research write. The response contains only sanitized origins,
Vercel environment/branch metadata and Fetch Metadata (never cookies, tokens,
session values or private finding data). It reports the actual request origin,
browser Origin/Referer origins, configured origin source, and whether the
trusted-origin predicate accepts the request.

The state-changing API actions continue to require the trusted-origin predicate.
A present mismatched Origin is authoritative and is never overridden by Referer.
For the exact maintenance Preview branch only, Vercel's system-provided immutable
deployment URL and branch URL may also be trusted. Production and other Preview
branches cannot use this exception. If a browser omits Origin, a matching
configured Referer is accepted only when \`Sec-Fetch-Site: same-origin\`.
Missing/invalid configured origins and all cross-site requests fail closed.

An \`UNTRUSTED_ORIGIN\` response is returned before \`record_research\` reaches
Redis. Refresh the owner dashboard, inspect the automatic preflight, and only
retry once the diagnostic says the browser origin is trusted.

## Owner-attested persistent semantic memory (Preview-only; runtime OFF)

This increment adds a first persistent knowledge lane for the existing shared
\`content-agent\` runtime. It uses the **same already-verified maintenance Preview
Redis database and environment-scoped Redis adapter**. It creates no database,
vendor account, paid embedding service, cron, or external memory platform.

### Storage and governance

- Store namespace: \`ams:maintenance:v1:aci-knowledge:v1\`; keys are scoped by
  \`agentSlug\` and \`agentVersion\`. The first wired pilot is
  \`content-agent\` / \`content-v1\`.
- Each record is a **semantic fact**, never a prompt, policy, procedure, tool
  permission, or instruction. It is bound to the exact maintenance Preview
  repository SHA and to an existing recent ACI research finding in
  \`checks_passed\` state.
- Promotion requires the owner to select that research finding, enter a concise
  declarative fact, cite 2–4 public sources from distinct hosts and publishers,
  and attest that both source pages were reviewed, the publishers are
  independent, the content is public, no customer data/secrets are present,
  and the record contains no instructions.
- The server records reviewer role as \`owner\`, not an email address. It does
  **not** claim machine verification of source contents or publisher
  independence: \`sourceAuthenticityMachineVerified=false\` remains explicit.
- Fact identity is deterministic and immutable. Repeated promotion is
  idempotent; index repair handles a partial write. Facts expire no later than
  30 days after the oldest source review and are retained for up to 90 days for
  audit. Owner revocation removes a fact from retrieval but preserves its
  audit record.
- Retrieval requires the exact agent slug and version. Cross-agent or
  cross-version reads return no facts. Invalid, expired, revoked, or tampered
  records are not returned.

### API and dashboard

- \`GET /api/internal/aci/knowledge?agentSlug=content-agent&agentVersion=content-v1\`
  is owner-authenticated and Preview-branch-only.
- \`POST /api/internal/aci/knowledge\` supports only
  \`promote_verified_fact\` and \`revoke_verified_fact\`, requires owner session
  and trusted same-origin request, and refuses a reviewed SHA that does not
  match the exact running Preview commit.
- The existing owner maintenance dashboard includes a **Persistent agent
  knowledge** panel only on the exact maintenance Preview branch. It lists
  recent checks-passed ACI research findings as promotion candidates, requires
  explicit owner attestations, shows citations/expiry, and supports revocation.
- The shared \`runStructuredAgent\` runtime can append these facts as clearly
  delimited **reference data** for \`content-agent\` only. The memory policy
  states that facts are never instructions and cannot override system policy,
  customer consent, safety rules, or tool permissions.
- Runtime retrieval is gated by
  \`AMS_ACI_KNOWLEDGE_RUNTIME_ENABLED=true\` **and** the exact maintenance
  Preview branch. The flag is currently **unset/OFF**. Production always
  refuses this feature even if the flag is accidentally set. No model calls
  were triggered by the promotion/retrieval API or dashboard.

### Research basis and limitations

- [LangGraph memory overview](https://langchain-ai.github.io/langgraph/concepts/memory/)
  distinguishes thread-scoped state from long-term namespaced memory and
  semantic facts from episodic experiences and procedural instructions.
- [OpenAI trace grading](https://developers.openai.com/api/docs/guides/trace-grading)
  supports structured, reproducible evaluation of full agent traces.
- [OWASP AI Agent Security](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
  identifies memory poisoning, prompt injection and excessive agency as
  concrete risks; retrieved memory must remain scoped data, not permissions.
- OpenAI's [datasets getting-started guide](https://developers.openai.com/api/docs/guides/evaluation-getting-started)
  documents the announced Evals/grader transition and deprecation timeline.
  ACI therefore keeps its deterministic CI grader independent of the
  deprecated Evals service rather than adding a new paid dependency.

The memory runtime remains **OFF** until separate Preview-only acceptance
proves an owner-reviewed fact is retrievable for the correct agent version
and ignored for other agents/versions, with prompt-injection tests. Even after
that acceptance, it does not grant an agent permission to edit code, merge,
deploy, publish, spend money, send messages, or alter customer data.

Reproduce the offline store and runtime tests:

\`\`\`sh
node --import tsx --test tests/aci-knowledge-store.test.ts tests/aci-knowledge-api.test.ts tests/aci-knowledge-runtime.test.ts
pnpm test
\`\`\`

## Known limitations

- Automatic arbitrary PR generation by a Vercel cron is **not supported**. GitHub's Dependabot and the separately configured ChatGPT scheduled coding watches provide the current draft-PR producers, with their own execution limits and permissions.
- Production Redis coverage and actual cron freshness remain to be verified with authorized production access. Preview records do not prove production status.
- This bounded state store records observation and checked draft PR only. Post-release promotion/recovery is future separately gated work. A read-only internal-admin queue is available at `/dashboard/maintenance`.
- A source claiming capability, price, or a fix does not justify adopting it without reproducible API/license/cost and security evidence.

## GitHub source acceptance boundary

The GitHub workflow source performs a read-only, 24-hour lookback for completed failed or timed-out `Secret scan`, `Twitch Short Render Worker`, and `Twitch VOD Catch-up Worker` runs on `main`. It does not infer a code defect from a failure, never retries publishing/payment/creators, and cannot open a Draft PR itself. A failed or rate-limited GitHub API is reported as `githubMonitoring.failed: true` on the cron response and must not be treated as no incidents. Automatic patch creation remains delegated to an authorized separately connected GitHub execution task, followed by independent CI/PR proof. Production ingestion remains OFF pending release authorization and correct production Redis verification.

## Repair-queue partial-write recovery

A live Redis command can succeed for the finding record and fail before its separate list index is updated. This is an operationally meaningful partial-write failure, not a simulated GitHub incident. On a deduplicated recent-event replay, the pipeline now checks for a missing index entry and safely restores it; long-expired or evicted historical findings are not reintroduced. Isolated tests simulate the index failure and verify recovery, idempotent rereads, and no false code execution. The queue still needs a genuinely owner-authenticated live Preview finding/replay test before an autonomous-release claim.

## Durable backend-event replay gate

The existing backend monitor already writes transition events to its bounded Redis event history. Maintenance intake formerly consumed only `snapshot.newEvents`, so any crash or partial write after the monitor's successful durable save could permanently skip that transition on later crons. While the Preview-only feature gate is enabled, the maintenance cron now re-reads up to 100 retained monitor events and reprocesses only recent (48-hour), nonrecovery warning/critical signals. It removes duplicates by monitor key, source fingerprint and status, and uses the existing maintenance finding hash for persisted deduplication. A failed backlog read marks maintenance.failed instead of silently claiming success. The fallback uses the *same environment's configured Redis* and no extra credentials, billing, public writes or production execution. Test coverage includes an indexing outage followed by a run with zero new events and stale/future/recovered filtering. The system is still not an autonomous code author or a released production agent.
