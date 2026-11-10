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
