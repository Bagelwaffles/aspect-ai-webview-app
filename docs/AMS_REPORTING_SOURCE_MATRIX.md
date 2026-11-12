# AMS reporting source matrix

Source review: 2026-11-12, base commit `8ea19feca879592e61b1b2fe924d449ec474f586`, Draft PR #280. This is a source and read-only configuration inventory, not a new monitor run, deployment, acceptance test, or proof that current operational data is fresh.

## Existing backend monitors

All ten definitions below are in `lib/server/backend-monitoring.ts`. They execute together in `runBackendMonitoring`; none has an independent schedule. Suggested reporting lanes preserve the owner's existing eight lanes and are presentation groupings, not ten newly created agents.

| Monitor key | Suggested lane | Evidence and warning/critical trigger | Limits and error semantics |
| --- | --- | --- | --- |
| `core-health` | Engineering | Redis readiness and configured owner/internal auth; missing/unready core dependency is critical. Incomplete Stripe, R2, enabled Twitch renderer or enabled browser worker configuration is warning. | Configuration presence is not end-to-end service acceptance. Redis probe timeout is 2.5 seconds. Unexpected throw becomes critical. |
| `revenue-fulfillment` | Revenue | Stripe paid Quick Audit sessions versus Redis completed fulfillment; missing completion is critical. Recent payment failures are warning. | Two Stripe lists, maximum 100 each over six hours, no pagination. No Stripe secret gives `not_configured`; request/read failure gives critical. Raw details may contain checkout identifiers and must not be copied into generic reports. |
| `overmind-tasks` | Engineering | Stored queue: active tasks unchanged at least 24 hours or expired approved windows give warning. | Up to 200 indexed tasks. Missing/unreadable storage gives critical. Pending approvals alone do not raise status. |
| `social-publishing` | Growth | Latest stored campaigns: publishing at least 45 minutes gives critical; failed/partial campaigns or failed deliveries give warning. | Up to 50 campaigns. Storage/parse failure gives warning. No fresh social-provider verification is performed. |
| `twitch-media` | Creator | Latest media queue and render jobs: rendering at least one hour gives critical; failed jobs, pending at least six hours, or missing R2 gives warning. | Queue authorization is recorded but does not itself raise status. Missing Redis returns null queue/empty jobs in underlying readers; thrown reads give warning. An `ok` result does not prove a successful render or fresh stream. |
| `fiverr-operations` | CX | Recent stored operations: urgent priority or a deadline within the next 24 hours gives warning. | Up to 25 records. Underlying reader returns empty on missing storage or read failure, so this monitor can report `ok` while evidence is unavailable. Overdue deadlines are not counted by the upcoming-deadline predicate. |
| `android-play` | Compliance | Environment confirmation plus catalog; unconfirmed hard-coded September 30, 2026 verification deadline is warning within ten days, critical after it. | Not a live Play Console read. Blocked catalog status is informational if no stronger deadline signal exists. Deadline accuracy must be reviewed independently. |
| `visibility-catalog` | Growth | GET agents/pricing/robots/sitemap; inaccessible page gives critical; advertised Live-agent counts differing from catalog give warning. | Eight-second timeout per fetch; text capped at 1.5 million characters. Base prefers `NEXT_PUBLIC_APP_URL`, then `NEXTAUTH_URL`, then public Production URL. Preview execution can therefore read public Production pages; do not run as an isolation test. |
| `execution-transparency` | Compliance | Registered contract disclosure, consent, fail-closed and audit flags; any violation gives critical. | Static contract conformance, not proof of actual execution or legal compliance. Unexpected throw becomes critical. |
| `agent-lifecycle` | Engineering | Catalog status counts; any blocked agent gives `info`, otherwise `ok`. | Static catalog, not runtime activity or freshness evidence. Does not establish Finance or Merch coverage. |

Finance and Merch have no dedicated monitor in this inventory. Do not fabricate healthy reports for those lanes. Shared monitor results may inform a lane only with clear source attribution.

## Triggers and side effects

- `vercel.json` declares `GET /api/internal/monitoring/run` at `17 13 * * *` (13:17 UTC daily). This is a configured schedule, not evidence of a successful run or automatic Preview scheduling.
- `app/api/internal/monitoring/run/route.ts` checks the cron bearer secret, then executes and persists the monitors. With `AMS_MAINTENANCE_ENABLED=true`, it also ingests recent monitor transitions and GitHub action failures. Each intake reports its own `failed` flag; a normal response's `ok: true` is not sufficient evidence that both intakes succeeded.
- `POST /api/internal/monitoring` requires owner authorization and trusted origin and executes/persists the checks. Its `executionPerformed: false` field must not be interpreted as meaning this route is read-only: it writes monitor state and may send a configured alert webhook.
- `GET /api/internal/monitoring` is the owner-only stored-evidence read: latest snapshot plus up to 50 events, no monitor execution. Redis exceptions return HTTP 503 / `BACKEND_MONITORING_STORE_UNAVAILABLE`.
- The reporting bridge must read stored evidence only. A page view or refresh must not invoke either execution route, send alerts, ingest findings, publish, or perform provider actions.

## Snapshot, event and freshness semantics

- Namespace: `ams:monitoring:v1`. Keys: `:latest`, `:state:<monitorKey>`, `:events`. These existing keys have no owner/tenant/environment suffix; isolation depends on the selected Redis datastore and owner-only API boundary.
- Latest snapshot contains version, `checkedAt`, overall status, results, and that run's `newEvents`. Each result contains its own `checkedAt`, summary/details, metrics and fingerprint. Overall status ranks critical, warning, not_configured, info, ok.
- Latest/per-monitor state has a 90-day TTL. Event history is capped at 300 entries; its list TTL resets to 90 days when an event is added. This is not a per-event age guarantee. Read API clamps requested history to 1–100 events.
- Events emit only when status or fingerprint changes and either the current or prior status is warning/critical. Leaving an alert status is a recovery. An unchanged alert produces no new event; no events does not mean healthy or no monitor activity. Fingerprints include metrics, so metric changes can produce another event without status change.
- Persistence performs sequential writes, not an atomic transaction. A failure can leave partial state/events and no updated latest snapshot. Persistence exceptions propagate; no Redis configuration silently skips persistence and yields no events.
- Missing Redis configuration or missing/invalid latest JSON returns a null snapshot; missing configuration returns an empty event list. Existing readers minimally validate stored objects, not full schemas. The bridge must distinguish unavailable, missing, invalid and stale evidence rather than infer an empty successful run.
- The existing snapshot reader has no freshness threshold. Calculate freshness from source timestamps; never replace them with page-load time. November 1–3 evidence remains historical on November 12 even if retrieved today. Guard against invalid/future timestamps.
- Alert webhook delivery happens after persistence, only for new events, and reports configured/attempted/ok separately. A failed alert does not erase the saved snapshot; saved data does not establish successful notification.
- Maintenance intake (`lib/server/maintenance-lifecycle.ts`) uses `ams:maintenance:v1`, 90-day finding retention and a 250-item index cap, without tenant suffix. Replay reads up to 100 monitor events and filters to nonrecovery warning/critical signals from the last 48 hours. These are findings, not completed repairs.
- Existing ACI knowledge (`lib/server/aci-knowledge-store.ts`) uses `ams:maintenance:v1:aci-knowledge:v1`, indexes scoped by agent slug/version, 100 facts per scope, 90-day storage retention and 30-day fact lifetime. It is separate from monitoring. Do not reuse it as a reporting inbox or repeat its acceptance workflow.

## Preview datastore identity proof

Read-only connector verification on 2026-11-12:

1. Vercel `filter_project_envs`, project `aspect-ai-overlord`, team slug `kimberleyaversbiz-4131s-projects`, branch `feat/ams-maintenance-agent-pipeline-20261015`, `decrypt=false`: the branch-specific `UPSTASH_REDIS_REST_URL` is `https://accepted-quetzal-206056.upstash.io` and its only target is `preview`.
2. Upstash `redis_list_databases` metadata identifies `ams-scheduled-tasks-preview` as active at endpoint `accepted-quetzal-206056.upstash.io`. The hostname matches exactly.
3. Backend configuration prefers `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, falling back to KV equivalents. Token metadata exists for this same Preview branch, but no token was decrypted, requested or disclosed.

This proves the current branch-scoped configured datastore identity, not deployment adoption, credential validity, connectivity, key presence, or data freshness. No Redis commands, monitor execution, credential changes, new services, Production configuration changes or ACI acceptance were performed. No stored customer records or older scheduled-task namespace were inspected. New bridge-specific writes, if later authorized and needed, must remain separate from existing namespaces and use an explicitly documented scope and retention policy.

## External specialist work

The eight lanes are Engineering, Compliance, Revenue, Growth, CX, Finance, Creator and Merch. Private specialist tasks can be retrieved or followed up through ChatGPT tooling, but no app-side ingestion feed is verified here. Do not embed private task/thread identifiers or personal details in source or pretend these tasks are backend monitor results. A lane with no verified feed is unavailable/unconnected, not idle or healthy. A report must retain its original evidence date and source, and must not claim that owner review, a follow-up, a blocker, or a draft is a completed action.

## Local reporting implementation (not deployed acceptance)

The Draft change adds a manual, owner-reviewed transport, not an automatic connection from ChatGPT specialist tasks. Source bindings are fixed server-side to `owner-reviewed-specialist:<lane>`. No private task identifiers or private report contents are checked into source. The eight original tasks and schedules remain unchanged; their supported read/follow-up tools live outside the AMS app. A recent reply that cites November 1–3 evidence must retain that old observation time.

- Owner dashboard reporting loads only after the existing internal-admin cookie is verified **and** its email matches configured `AMS_OWNER_EMAIL`. A different valid admin still sees the preexisting dashboard but no reporting data.
- `/api/internal/operations/reports` separately uses the existing signed owner Google session; internal bearer keys are not accepted. POST also requires trusted origin, exact deployment SHA, public-only/minimization/source-review attestations, and a streaming 16 KiB request limit.
- Production and every unrelated Preview branch are rejected. Persistence additionally pins the previously proved Preview URL by SHA-256. No fallback to KV, another URL or another database is permitted.
- Existing `ams:maintenance:v1` is reused under `:reporting:v1:owner:<lane>`. Each immutable report and dedupe key retain 90 days; per-lane history is capped at 100 and a separately retained latest-by-observation record prevents old arrivals from displacing newer evidence. Replays keep the first receipt and do not refresh retention. This namespace is reporting-only, not customer or schedule state.
- One Lua transaction claims both stable identities, appends history and updates latest evidence. A repeated identity with changed content returns a conflict. Failed or ambiguous storage outcomes return unavailable, never fake success; readback or an identical replay is required before changing the report ID.
- Source text is inert: strict allowlisted fields, length limits, source/lane match, timestamps, public HTTPS evidence links, common-secret/PII/instruction rejection. These screens are defense in depth, not exhaustive sensitive-data detection or proof a URL is publicly accessible; owner review is still required.
- The report carries `observedAt`, `sourceLastRunAt` and server-assigned `receivedAt` separately. Daily lanes use 48-hour TTL; Compliance, Finance and Commerce use eight days as a conservative initial weekly review policy, **not a newly configured schedule**. This policy requires owner review if the existing cadence differs. Freshness uses the older source timestamp; stale evidence remains visible.
- Healthy requires fresh evidence plus explicit `owner_attested` verification. Source authenticity is never called machine-verified. `approvalState` accepts only `none` or `requested`; it cannot approve execution. Requests are latest-report claims, not a replacement for existing governed approval state.
- The bridge reads existing monitor `:latest` and `:events` keys without executing monitors or alerts. It minimizes retained/displayed projection to source keys, known statuses and times, dropping raw details/metrics and possible customer identifiers. Legacy OK/info remains unknown because those monitors do not prove full runtime health. Missing snapshot, malformed data, failed query and successful-empty event history have distinct semantics.
- The existing Fiverr reader now exposes explicit ready/not-configured/unavailable outcomes. Its monitor no longer translates failed reads to an OK empty queue. The old list function remains available for unrelated callers.
- Maintenance cards link existing finding/PR evidence and identify stale source or CI timestamps. They do not re-run ACI acceptance, query providers, infer release approval, or duplicate the lifecycle.

### Minimal synthetic report format

The import form accepts the report object below after the owner selects Engineering and explicitly reviews the public-only attestation. The API outer wrapper is added by the form. Replace timestamps with the actual test observation time; do not refresh old evidence by editing its timestamp. This is a **synthetic example**, not a completed specialist run or runtime acceptance result.

```json
{
  "schemaVersion": 1,
  "reportId": "synthetic-reporting-acceptance-v1",
  "dedupeKey": "synthetic-reporting-acceptance-v1",
  "specialistId": "engineering",
  "sourceSystem": { "id": "owner-reviewed-specialist:engineering", "version": "1" },
  "observedAt": "2026-11-12T00:00:00.000Z",
  "sourceLastRunAt": "2026-11-12T00:00:00.000Z",
  "status": "unknown",
  "summary": "Synthetic reporting bridge acceptance fixture, not live service evidence.",
  "currentWork": "Preview-only reporting verification",
  "blocker": "Real specialist transport remains unverified.",
  "nextAction": "Read back and replay the identical report.",
  "evidence": [{ "url": "https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/279", "label": "Reporting scope", "provenance": "Public issue reference reviewed by owner" }],
  "confidence": "low",
  "verification": "unverified",
  "approvalState": "none"
}
```

### Remaining acceptance, no current completion claim

Local tests use mocked storage/auth only. Before calling the bridge operational: obtain permission to publish the source/evidence to the existing public Draft PR; check that no concurrent branch update would be overwritten; verify exact-head Reconciliation CI and Secret Scan; verify the exact SHA Preview and unchanged Preview datastore identity; perform a single authorized non-sensitive report import/readback/replay and inspect its rendered lane, malformed/source-mismatch denial, owner denial and mobile layout. This is reporting acceptance only, **not another ACI acceptance run**. No import, deployed UI verification, provider-cost measurement, automatic specialist feed, public publication, merge or Production change is claimed by the local implementation.
