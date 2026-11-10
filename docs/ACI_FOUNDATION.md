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
   URL, publisher, original publication/retrieval time, official corroboration URL(s),
   repo SHA, affected agent ID, stable source/claim fingerprint and distinct status.
   This is not independent verification of the claim: every accepted record stays
   \`research_only\`, \`verified=false\`, \`trustedInstructions=false\`, \`mayExecute=false\`.
2. An offline **before/after fixture evaluation**, requiring identical labeled cases,
   schema-valid decisions, evidence for evidence-dependent decisions, critical-safety
   case results, zero unauthorized simulated actions, billed-cost telemetry and timing.
   It rejects missing, invalid, duplicative, or unregistered observations, safety
   regressions and missed critical events. Improvements yield \`candidate_for_review\`
   only, with \`productionApproved=false\`.
3. Regression tests for public/private boundaries, source freshness/deduplication,
   external prompt injection treated as untrusted data, missing/outdated evidence,
   regressed critical decisions, dangerous actions and invalid cost telemetry.

Reproduce in a checked-out branch with the repository's existing dependencies:

\`\`\`sh
node --import tsx --test tests/aci-evidence-evaluation.test.ts
pnpm test
\`\`\`

**Interpretation:** Synthetic fixture scores are engineering checks, **not** actual agent
quality, platform access, customer value, live profitability or authorized real-world
safety results. The supplied cost is fixture telemetry; it is not provider-invoiced proof.
An accepted research candidate's \`dataClassification="public"\` is a caller assertion,
not privacy inspection. Do not ingest customer/inbox/private information. URL validation
is not an SSRF barrier for future fetchers; add DNS/IP checks and allowlists before
any server-side network retrieval. Untrusted videos/transcripts are data, never prompts
or permissions, and full copyrighted transcripts must not be copied into the ledger.

## Next acceptance milestones (NOT completed here)

1. Owner-review the fixture rubric, add a reviewed held-out dataset referencing current
   AMS agent tasks and actual redacted trace evidence, and reconcile the evaluation with
   existing #265 benchmark rather than forking a second provider evaluation.
2. Once #280 Preview datastore identity/ingestion/replay is proven, propose an **additive**
   persisted research record and expiry/revalidation flow, using its exact existing
   namespace, ACL, tenancy, deduplication and audit chain. No direct Redis write in
   this branch. Owner review before connecting any external ingestion.
3. Implement explicit verified-learning promotion and permission-scoped retrieval.
   Independent corroboration plus review is required before \`verified\` changes;
   research text can never upgrade system or tool instructions.
4. Prove one real source→safe knowledge entry→specialist retrieval→before/after
   evidence→isolated Draft PR→exact-head CI. Reviewers must separately approve
   production release and independently measure post-release results.
5. Preserve current working Twitch→YouTube behavior. Prioritize revenue fulfillment
   and Google Play compliance over risky creator-system enhancements.

No credentials, provider calls, paid dependencies, customer data, actions, production
flags, persistent store operations, public publishing, branch merging, or release changes.
