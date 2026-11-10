# Aspect Continuous Intelligence (ACI) — phase 1 foundation

**State:** isolated research/evaluation prototype only; not a Live AMS agent, feature, database,
scheduled job, model provider, background learner, or production release.

**Owner authorization (Nov 10, 2026):** learn from permitted public sources, including
YouTube tutorials, and improve existing AMS specialists in measurable, approval-controlled
steps. **Preserve the working SmokyBanana03 Twitch→YouTube upload/publication flow exactly
as operating.** No new channel, retry, post, visibility change, OAuth action or live change.

## Reuse and explicit non-overlap

- Existing [#279](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/279) /
  Draft [#280](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/280)
  own the native persisted finding/replay and PR-check pipeline. Do not duplicate Redis,
  APIs, worker or schedules, and do not claim persistence until integrated and accepted.
- Draft [#265](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/265)
  owns the separate ten-task paid-model provider comparison. This prototype does **not**
  duplicate model benchmarks or make paid provider calls.
- Draft [#233](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/233)
  owns action approval/governance. This prototype cannot execute tools or authorize actions.
- Commercial priority [#313](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/313)
  remains ahead of rolling out an experimental autonomous product.

## What this branch actually adds

1. Pure, offline validation for **public-only, attributed research claims**, with source
   URL, publisher, original publication/retrieval time, caller-supplied corroboration links,
   repo SHA, affected agent ID, stable source/claim fingerprint and distinct status.
   These links are not fetched or independently verified: every accepted record stays
   `research_only`, `verified=false`, `trustedInstructions=false`, `mayExecute=false`.
2. An offline **before/after fixture evaluation**, requiring identical labeled cases,
   schema-valid decisions, evidence for evidence-dependent decisions, critical-safety
   case results, zero unauthorized simulated actions, billed-cost telemetry and timing.
   It rejects missing, invalid, duplicative, or unregistered observations, safety
   regressions and missed critical events. Improvements yield `candidate_for_review`
   only, with `productionApproved=false`.
3. Regression tests for public/private boundaries, source freshness/deduplication,
   external prompt injection treated as untrusted data, missing/outdated evidence,
   regressed critical decisions, dangerous actions and invalid cost telemetry.
4. `tests/aci-ams-agent-policy-fixtures.test.ts`: 14 additional, explicitly synthetic
   AMS catalog-aligned scenarios checking content/lead-magnet draft boundaries, consent-safe
   email/nurture/outreach behavior, TEST-versus-LIVE audit proof, CSV provenance, Shopify
   migration failure holds, accepted-AAB-versus-release distinction, untrusted video text,
   creator noninterference, research corroboration, support datastore identity and public
   social-post approval. Compares synthetic before/after decisions without any LLM or
   external action. Every accepted result is non-production and evidence-mode-labeled.

Reproduce in a checked-out branch with the repository's existing dependencies:

```sh
node --import tsx --test tests/aci-evidence-evaluation.test.ts tests/aci-ams-agent-policy-fixtures.test.ts
pnpm test
```

**Interpretation:** Synthetic fixture scores are engineering checks, **not** actual agent
quality, platform access, customer value, live profitability or authorized real-world
safety results. The supplied cost is fixture telemetry; it is not provider-invoiced proof.
**The new 14-case AMS suite is not a human-reviewed held-out dataset** and does not
contain real redacted production traces or independently collected agent outputs. Its
`billedCostUsd=0` and `durationMs=1` entries are controlled test values, NOT provider
billing or measured production latency. The suite is a guardrail on the evaluator's
behavior and policy classification, not a quality benchmark of running AMS agents.

An accepted research candidate's `dataClassification="public"` is a caller assertion,
not privacy inspection. Do not ingest customer/inbox/private information. URL validation
is not an SSRF barrier for future fetchers; add DNS/IP checks and allowlists before
any server-side network retrieval. Untrusted videos/transcripts are data, never prompts
or permissions, and full copyrighted transcripts must not be copied into the ledger.

## Owner-authorized private execution evidence — preparation, not acceptance

The next gate is **real, reviewed, before/after agent execution records**. A recent read-only
check found that the existing Vercel **Agent Runs** observability view denies access (403);
a narrowly scoped runtime-log lookup did not return usable agent executions. No complete,
owner-authorized, independently reviewable before/after examples have been obtained.
**Do not fabricate a dataset, treat catalog status as a run trace, or label synthetic tests
as measured learning.**

The additive module \`lib/aci/private-trace-intake.ts\` provides a **private, offline,
metadata-only intake validator**. It contains no network fetches, persistent writes,
model calls, private run IDs, stored transcripts, training operation, or production integration.
It requires pairs of baseline/candidate records referencing the **same existing AMS agent**
at distinct repository commits, an opaque proof digest for each unique execution, an
environment, observed/reviewed times, outcome category, and an owner/authorized reviewer
privacy attestation. The accepted response is always
\`status=metadata_only_unverified\`, \`sourceAuthenticityVerified=false\`,
\`readyForScoring=false\`, \`productionApproved=false\`.

Even a successful shape check does **not** verify the attestation, existence or quality of
the underlying runs. The next independent stage must securely inspect the exact original
run logs, validate the execution versions and outcomes against authorized evidence, establish
a human-reviewed quality rubric, and *then* evaluate measured before/after results in a
separate private workspace. Keep the private source mapping and its high-entropy HMAC-derived
digests out of public GitHub commits; the SHA-like digest format alone does not prove
authenticity or privacy. Store no customer/owner emails, financial records, secrets,
prompts, output transcripts, raw request IDs, customer identifiers or customer-derived
artifacts in this public project. Do not turn signed-off attestations into automatic trust.

Run offline fixture tests with existing dependencies:

\`\`\`sh
node --import tsx --test tests/aci-private-trace-intake.test.ts
\`\`\`

**Still blocked:** authorized real execution records, independently verified redaction,
owner-reviewed outcome labels, an accepted private proof store and genuine measured
before/after results. The owner authorizes non-destructive evidence preparation only;
no live systems, integrations, prices, customer data, Google Play, or Twitch/YouTube
publishing can be modified as a consequence.

## Read-only real-trace source access matrix — November 10, 2026

This is an **accessibility/coverage diagnosis**, not a finding that AMS's Live agents
failed or did not run. Read-only tools accessed existing dashboards, source code,
deployment metadata and owner-authorized **on-screen run status labels** after login.
No new AI calls, credits, customer prompts, outputs, identifying run details,
credentials, logging or production writes were used or exported.

| Source | Actual non-sensitive observation | Evidence usability |
| --- | --- | --- |
| Vercel connected Agent Runs API | `403 forbidden` for this project/team | Cannot retrieve any run traces through the available API scope |
| Existing owner's Vercel dashboard, Observability → Agent Runs | `Runs 0` / `No results found` for **Last 7 days**, **Production** | No run metadata from this observability surface in the checked period; this does **not** prove AMS native agents are inactive |
| Existing Vercel production runtime logs | Narrow query returned no usable agent-run evidence; broader seven-day content/audit searches timed out | No complete trace suitable for evaluation |
| Existing AMS production `/content-agent` UI, connected Opera after owner login | Authenticated native Recent runs now visible; historical completed items display `Execution provenance unavailable for this legacy run.` | Genuine owner-accessible history exists, but on-screen status and missing provenance are **not** independently verified model outputs, source commit versions, or matched before/after evaluations |
| Existing `app/api/content-agent/runs/route.ts` and `lib/server/content-agent-runs.ts` | GET requires authenticated customer principal, then calls `listForOwner`; run history includes input, output, provenance and financial state | This is the actual native AMS run store, but raw replies cannot be treated as safe-to-export evaluation records |
| Existing GitHub issues/catalog/CI | Historical claims, code releases, synthetic CI and operator notes | Useful corroboration and fixture requirements, **not** two independently verified before/after agent execution outputs |

**Minimum non-destructive continuation:** The owner's existing signed-in session
has now confirmed that native run history can be displayed. **Do not repeat login or
execute paid generation to manufacture an experiment.** A reviewer must first establish
whether any existing owner-authorized records provide a **same-task baseline/candidate
pair with independently verified distinct code/model versions and actual outcomes**.
The legacy UI lacks sufficient provenance, so merely finding two completed entries is
not proof of a valid comparison. If independently attributable evidence does become
available, compile a separate **private-only**, reviewed/redacted case inventory and
outcome rubric, keeping raw prompts, outputs, subjects, emails, tokens, credit and
financial details, and run identifiers out of public GitHub. If such a pair does not
exist, remain BLOCKED pending an exact-action, capped-cost experiment approval; do not
invent metrics or modify live services.

**Further limits:** Vercel Agent Runs is an observability feature for particular
instrumented agent frameworks, whereas AMS native Content Agent stores its own
execution history. An empty Vercel Agent Runs table is not evidence that native
Content Agent or the separate working Twitch→YouTube pipeline stopped. Do not enable
costly telemetry, widen access to customer records, add privileged endpoints,
or change working operational behavior to fill this evaluation gap.

## Phase 1.5: agent-scoped research retrieval and offline improvement review

Research reviewed on **November 10, 2026**:
- [LangChain: How To Build a Self-Improving Agent with LangSmith Engine and Context Hub](https://www.youtube.com/watch?v=y6WUw2_Hhrs) — demonstrates trace detection, versioned context updates and verification.
- [LangChain: Build Agents That Never Forget](https://www.youtube.com/watch?v=3Yp-hIEcWXk) — demonstrates namespace-scoped long-term memory.
- [LangChain: Create a Dataset from Production Traces](https://www.youtube.com/watch?v=qDWBGyqUqdI) and [Evaluation Types](https://docs.langchain.com/langsmith/evaluation-types) — separate deterministic CI tests from actual historical-run backtesting.
- [OWASP Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html) and [RAG Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html) — stored/retrieved memory is an untrusted source that cannot authorize tool actions.

**Decision:** Extend the repository's existing TypeScript ACI prototypes, not install a
second managed agent platform or subscribe to an expensive autonomous-fixer service.

Added `lib/aci/research-review.ts` as a **pure, offline and default-inert** next building
block:

1. `selectAciResearchReferences` re-evaluates research candidate structure, source
   freshness, canonical URL, deduplication fingerprint and the never-trust flags using
   `assessPublicResearchCandidate` before selecting up to five source **references**.
   It rejects unknown AMS agents, cross-agent and cross-source-SHA mixing, tampered
   claims/links, unknown fields, stale citations and unbounded input. A duplicate
   fingerprint is returned once.
2. Selected references are `dataOnly: true`, `verified: false`,
   `trustedInstructions: false`, `mayExecute: false`, and contain only a source URL,
   reference fingerprint, retrieved time, citation URL(s), source kind and associated
   agent/commit. The **untrusted claim text is deliberately not returned** as agent
   instructions or automatically injected into runtime prompts. The existing
   `public` classification is caller-asserted, not independent privacy review.
3. `planAciOfflineImprovement` can associate these research references with the
   existing deterministic **synthetic** before/after evaluation, rejecting SHA mismatch,
   unsafe actions and failed fixtures. Its best state is
   `synthetic_candidate_for_human_review`: not measured improvement, not a code
   patch, not verified source contents, and never permission to execute, merge, deploy
   or publish.

Run the new offline regression tests:

```sh
node --import tsx --test tests/aci-research-review.test.ts
pnpm test
```

**This is NOT persistent agent memory, automatic source verification, dynamic
retrieval-augmented generation, or an autonomous code-repair agent.** No network calls,
API routes, Redis keys, agents, schedules, LLM calls, customer records, authorization
changes, PR merges or external actions are introduced. Never present a synthetic
evaluation score as real success or claim a source is verified simply because it has
a second URL.

**Implementation order after this gate (separately verified and approved):**

- Reconcile with Draft [#280](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/280):
  prove authorized Preview datastore identity, idempotent persisted finding replay and
  exact-head CI. Store references in its existing authenticated, scoped namespace only
  after explicit integration approval. Do not invent a second database.
- Implement independent source verification and audited owner review so trusted
  **facts** can be promoted to a versioned knowledge state without ever promoting
  instructions or tool permissions. Bind reads to exact agent/tenant/repo version,
  impose expiration/revalidation and log decisions without private prompts.
- Obtain consented, properly redacted historical runs with verified version/outcome
  provenance. Establish independent, held-out comparison fixtures (not only self-scored
  synthetic tests). Record actual budget and cost per successful task.
- Source-backed finding → verified knowledge → bounded agent retrieval → evaluated
  patch in a **Draft PR** → exact-head tests/security checks → **separate owner
  release approval** → independently measured post-release result. Unknown, stale,
  malicious or unavailable evidence must fail closed.

Preserve current owner-approved SmokyBanana03 Twitch→YouTube automatic upload and public
publishing unchanged. The only purpose of the new tests is to prevent research-driven
unapproved changes to the working pipeline.

## Next acceptance milestones (NOT completed here)

1. Owner-review the newly added 14-case synthetic AMS policy rubric. Build a separately
   reviewed held-out dataset referencing actual redacted, owner-authorized agent trace
   evidence (not fabricated results), and reconcile its scope with existing #265 model
   benchmarking rather than adding a second provider comparison.
2. Once #280 Preview datastore identity/ingestion/replay is proven, propose an **additive**
   persisted research record and expiry/revalidation flow, using its exact existing
   namespace, ACL, tenancy, deduplication and audit chain. No direct Redis write in
   this branch. Owner review before connecting any external ingestion.
3. Implement explicit verified-learning promotion and permission-scoped retrieval.
   Independent corroboration plus review is required before `verified` changes;
   research text can never upgrade system or tool instructions.
4. Prove one real source→safe knowledge entry→specialist retrieval→before/after
   evidence→isolated Draft PR→exact-head CI. Reviewers must separately approve
   production release and independently measure post-release results.
5. Preserve current working Twitch→YouTube behavior. Prioritize revenue fulfillment
   and Google Play compliance over risky creator-system enhancements.

No credentials, provider calls, paid dependencies, customer data, actions, production
flags, persistent store operations, public publishing, branch merging, or release changes.
