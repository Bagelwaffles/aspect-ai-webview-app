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
