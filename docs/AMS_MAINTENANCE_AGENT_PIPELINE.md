# AMS Update and Repair Agents — bounded native pipeline

Status: **Preview-only proposal / not released**. Delivery tracker: [#279](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/279).

This adds a source-controlled maintenance evidence lane to the **existing** AMS Next.js/Vercel control plane. It does not start another agent platform and does not enable Overmind's generic executor. It is not a claim that AMS can autonomously rewrite and deploy arbitrary code.

## Current monitor inventory

| Producer | Current contract | Access / cost | Native ingestion |
| --- | --- | --- | --- |
| Backend monitoring | \`lib/server/backend-monitoring.ts\`: 10 checks, change events, Redis persistence | Existing Vercel cron and Upstash production credentials; existing service calls may have cost | New warning/critical events only, gated by \`AMS_MAINTENANCE_ENABLED=true\` |
| Dependabot | npm daily, Gradle and Actions weekly | GitHub-hosted; no new third-party charge | Already opens PRs; no duplicate native package upgrader |
| GitHub Actions | Reconciliation CI and secret scan on PRs | GitHub checks read API, optional read token for rate limits | Exact-head PR/check proof on owner request |
| AMS AI Platform Watch / Builder Update Agent | ChatGPT scheduled external intelligence evaluations | ChatGPT scheduled tasks and connected GitHub tools | **Not** wired to this Vercel endpoint; can independently prepare draft PRs |
| SmokyBanana03 Shorts Repair Watch | ChatGPT hourly diagnostic watch | Existing connected GitHub data | **Not** wired to this Vercel endpoint; independently proposes draft PRs |
| Twitch media monitor | Existing backend Twitch/render health | Existing provider configuration | Yes, when its backend monitor emits warning/critical events |

## Event lifecycle

1. Existing cron runs backend checks and persists changed warning/critical events.
2. If \`AMS_MAINTENANCE_ENABLED=true\`, ingest those events into \`ams:maintenance:v1\` in **that environment's configured Redis**. Never substitute the preview database for an unverified production datastore.
3. Normalize source, timestamp, fingerprint, severity, probable impact, confidence, estimated cost, and policy. Reject stale/future events; deduplicate repeated observations; retain up to 250 indexed findings for 90 days.
4. Classify signals as **observed**, not verified defects. Billing, core infrastructure and Play release signals are escalation-only. Other backend events are candidates for an *isolated draft investigation*; a source observation is never code proof.
5. Owner-only, trusted-origin \`/api/internal/maintenance\` accepts external research as **unverified**, or attaches an actual **open draft PR** after independent GitHub head SHA / repository / branch / draft checks.
6. Owner can request verification of two required GitHub workflows against the **exact** PR head SHA: \`AMS Reconciliation CI\` and \`Secret scan\`. Both must be successfully completed. A failure or unavailable GitHub API fails closed.
7. There is **no merge, production deployment, live-write, payment, public publication, permission/credential update, or Android release API** in this pipeline. Those require the existing separately approved release controls and post-release evidence. \`checks_passed\` is not \`deployed\`.

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

## Known limitations

- Automatic arbitrary PR generation by a Vercel cron is **not supported**. GitHub's Dependabot and the separately configured ChatGPT scheduled coding watches provide the current draft-PR producers, with their own execution limits and permissions.
- Production Redis coverage and actual cron freshness remain to be verified with authorized production access. Preview records do not prove production status.
- This bounded state store records observation and checked draft PR only. Post-release promotion/recovery is future separately gated work. A read-only internal-admin queue is available at `/dashboard/maintenance`.
- A source claiming capability, price, or a fix does not justify adopting it without reproducible API/license/cost and security evidence.
