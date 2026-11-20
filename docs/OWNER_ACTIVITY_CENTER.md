# Owner Activity & Approval Center

This extends the existing owner-only `/dashboard` reporting section in Draft PR #280. It is a read-only view over the same bounded report history, stored monitor events/snapshot and maintenance findings. It creates no dashboard route, endpoint, Redis namespace, service, agent or schedule. Version 2 report submission uses the existing owner-authenticated Preview API and pinned datastore gate. Version 1 reports remain readable.

## What is integrated

- Owner-reviewed activity updates can be imported through the existing report form and retained in the same immutable report records.
- The center groups current retained updates into in-progress, owner-review, completed/no-change, blocked/failed and uncertain/stale views. Source history is chronological and adjacent identical activity updates are collapsed.
- Monitor warnings and finding states are labeled as evidence, not ongoing specialist tasks or completed repairs. An OK/recovery monitor signal or passed Draft checks cannot manufacture task completion, deployment readiness or release authority.
- Observation, source update, receipt and completion times stay separate. Freshness uses the oldest applicable source date. Daily/weekly limits remain those of the existing specialist lane. A newly imported old activity remains stale.
- A display-only clock ages statuses. There is no source polling or monitor execution. A user-clicked local browser read marker stores one timestamp only; it changes no report, request or permission. Late imports are counted using receipt time, while stored monitor events use source time.

## Explicit missing integrations

Automatic specialist delivery and authoritative host-approval reconciliation are not connected. Imported text cannot establish host approval. The UI has no approve, deny, retry, resend or execution button. The owner must use the original host request after reconciling its state; no verified host action link is available in this implementation.

`HostApprovalObservation` is a reserved server-side display interface, not a client payload or connected adapter. Unit fixtures exercise exact-scope confirmed results, mismatches and expiry. The live dashboard calls the projection without host observations. Every item and model remains `mayExecute: false`, including a hypothetical confirmed approval. Such a result never changes task completion, deployment status or release status.

No real specialist/host activity was imported as part of local implementation. The earlier synthetic version 1 reporting fixture does not become a real activity feed. Browser viewport, keyboard and screen-reader acceptance remain separate from source/CSS and server-rendered markup tests.

## Version 2 activity contract

Keep every existing version 1 field, set `schemaVersion: 2`, and add one `activity` object. This object is included in the existing semantic content hash, report-ID/dedupe conflict checks, retention and read validation. Do not change an existing report's content; use a distinct public-safe report/dedupe identity for an authorized new source observation.

Activity fields, all explicit:

- `activityId`: public-safe correlation label for this activity, not a private platform task ID.
- `title`, `actor`: bounded, minimized display text. Role names are sufficient.
- `taskStatus`: `IN_PROGRESS`, `COMPLETED`, `BLOCKED`, `AWAITING_OWNER`, `APPROVAL_PENDING`, `APPROVAL_UNKNOWN`, `FAILED`, `NO_CHANGE`, `STALE`, or `UNAVAILABLE`.
- `startedAt`, `completedAt`: original canonical UTC timestamp or null. `updatedAt` is required and cannot exceed the report observation time.
- `nextCheckpoint`, `lastSuccessfulStep`, `result`, `blocker`, `recovery`, `changeSummary`: bounded display-only text. Running work requires a checkpoint; blocked/failed work requires a blocker and recovery path.
- `ownerActionRequired`: explicit boolean claim, displayed as reported rather than independently verified.
- `toolStatus`: `NOT_REPORTED`, `RUNNING`, `SUCCEEDED`, `FAILED`, or `UNKNOWN`. An unknown outcome stays distinct from a known failure and cannot support completion.
- `approval`: null or the scope object below.

`COMPLETED` and `NO_CHANGE` require a terminal time, nonempty result and change summary, owner-attested review and at least one valid public evidence reference. These remain owner-reviewed source reports, not machine-authenticated task events. Neither implies a release or permission grant.

An approval scope contains: `requestKey`, `requestedAt`, `requestedAction`, `capability`, `tool`, nullable public `site`, `targetEnvironment`, `reason`, `riskImpact`, `dataExposure`, `duration`, `permissionType` (`one_time` or `recurring`), and `reportedOutcome` (`pending`, `unknown`, `approved`, `denied`). All scope details are required except the explicitly nullable site. Use an opaque public-safe correlation label, not an actual private host request identifier.

The outer `approvalState` must remain `requested` when this object is present. A reported approved/denied/pending outcome is still unconfirmed without a matching fresh host observation for the same activity, request, action, environment, capability, exposure, duration and persistence. Clicks, dismissal, “always allow” selections and imported fields cannot populate that trusted interface. Extra confirmation/authority fields are rejected.

## Limits and safeguards

- Existing owner identity, Google-session API, trusted-origin, exact commit, 16 KiB streaming request cap, Preview branch and datastore identity checks are unchanged.
- Strict keys, safe IDs, canonical/nonfuture timestamps, public-link and secret/private-text screens also apply to every new activity/scope field. Screens are defense in depth; owner minimization remains required.
- Failed source reads remain unavailable. Successful empty history is not proof that external work or approvals do not exist.
- Retention remains bounded by the existing store. The timeline shows at most 250 retained events, with 30 initially visible. Large current groups initially show 20 items with an explicit disclosure control. This is not a complete audit log or durable system of record for every open external task.
- Source/receipt time labels are UTC. The local read marker is browser-specific, not synced ownership/account state.
- No Production, merge, credential, permission, billing, customer, public publishing or Twitch pipeline action is authorized by this UI or report format.

## Local verification versus acceptance

Focused tests cover all status representations, completion/no-change prerequisites, spoofed host claims, exact permission scope and expiry, source freshness, unknown versus failed tools, duplicate/conflicting events, version 1 compatibility, existing-store version 2 readback, owner/Preview gates, markup labels, and CSS wrapping/focus contracts. Server-rendered markup is not an interactive browser test. Real host result ingestion, automatic delivery and live 360/390/768 viewport checks are not claimed.

Publication, exact-head CI/Secret Scan and matching Preview validation require a separately authorized push of this feature. Prior checks on another commit cannot certify it.
