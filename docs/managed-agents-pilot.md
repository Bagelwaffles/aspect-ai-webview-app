# Managed Agents Pilot — Reverse-Engineering Intelligence

## Scope

This is an isolated, fail-closed pilot for the planned Reverse-Engineering Intelligence Agent.

It does not replace the shared AMS Vercel AI Gateway runtime, change customer-facing agents, alter Stripe or credits, publish content, mutate external services, or promote the catalog status.

## Architecture

1. Existing AMS live research retrieves permitted public-source evidence.
2. AMS passes only the normalized source packets into OpenAI's managed Agents API.
3. The managed agent performs synthesis only.
4. AMS retains source URLs plus the managed session and turn identifiers for evaluation.

The first phase intentionally uses no sandbox tools or external action surface. This establishes harness quality, cost, latency, and reliability before introducing Vercel Sandbox execution.

## Fail-closed controls

The pilot runs only when both are present:

- AMS_MANAGED_INTELLIGENCE_PILOT_ENABLED=true
- OPENAI_API_KEY

Optional controls:

- AMS_MANAGED_INTELLIGENCE_PILOT_MODEL — defaults to gpt-6.1-sol
- AMS_MANAGED_INTELLIGENCE_MULTI_AGENT=true — off by default
- AMS_MANAGED_INTELLIGENCE_POLL_ATTEMPTS — bounded retry count

No production environment variable should be enabled until preview verification is complete.

The preview acceptance probe is additionally restricted to `VERCEL_ENV=preview` and requires `AMS_MANAGED_INTELLIGENCE_PROBE_TOKEN`; it is not a customer-facing route.

The acceptance credential is temporary and must be removed with the preview probe route before merge.

## Acceptance gate

The pilot is technically proven only after:

1. Repository tests pass.
2. Preview deployment builds successfully.
3. A real managed Agents API session completes from preview.
4. The brief is source-backed and does not invent unsupported facts.
5. Session and turn identifiers, end-to-end latency, and provider token usage are captured.
6. Cost and latency are compared with the existing AMS structured-agent path.
7. Failure behavior is verified without misreporting success.

Only after that proof should AMS consider a second phase using Vercel Sandbox or broader multi-agent delegation.

## Preview pilot result

Controlled preview proof completed on October 5, 2026 with GPT-6.1 Sol.

- Managed session completed successfully and returned a source-disciplined brief.
- Measured end-to-end latency: 24,598 ms.
- Recorded usage after bounded late-telemetry polling: 8,231 input tokens, 496 output tokens, 37 reasoning tokens, 8,727 total tokens, 0 cached input tokens.
- The measured standard input/output token component is approximately $0.0214 at the then-current GPT-6.1 Sol rates, excluding any separately billed cache-write or infrastructure charges.
- The temporary acceptance route was removed after proof.

This is enough to prove the managed harness works, but not enough to justify production adoption. The PR remains Draft until AMS runs an apples-to-apples baseline through the existing Vercel AI Gateway path and compares quality, latency, token overhead, and total cost.


## Gateway comparison and decision

A controlled comparison was run against AMS's existing Vercel AI Gateway path using the same evidence packets and the same synthesis objective.

### Managed Agents API

- Model: `gpt-6.1-sol`
- End-to-end latency: 24.598 seconds
- Input tokens: 8,231
- Output tokens: 496
- Reasoning tokens: 37
- Total tokens: 8,727
- Approximate standard model-token cost at the measured rates: $0.0214
- Result: successful, source-disciplined synthesis

### Vercel AI Gateway

The current Vercel free tier rejected both `openai/gpt-6.1-sol` and AMS's default `openai/gpt-5.4-mini` because those models require paid Gateway credits.

AMS's existing structured fallback path then succeeded with `google/gemini-2.5-flash-lite` through Vertex:

- End-to-end latency: 1.832 seconds
- Input tokens: 234
- Output tokens: 276
- Total tokens: 510
- Gateway-reported inference cost: $0.0001338
- Result: successful structured synthesis with preserved source URLs
- Gateway routing proof: blocked OpenAI primary → Gemini fallback → Vertex provider

### Decision

Do not adopt the managed Agents API for this Reverse-Engineering Intelligence synthesis workload.

For this task, the existing Vercel AI Gateway structured-agent path is approximately:

- 13x faster
- 17x lower in token volume
- 160x lower in measured inference cost

The managed harness remains technically validated and may be reconsidered later for genuinely long-running, stateful, tool-heavy, or multi-agent workloads where its managed session features provide measurable operational value.

PR #260 should be closed unmerged after the temporary benchmark endpoint is removed. This preserves the experiment and measurements in Git history without adding unused runtime surface to production.
