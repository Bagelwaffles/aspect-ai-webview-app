# Creator video-analysis session telemetry (October 18, 2026)

Source: https://vercel.com/changelog/ai-gateway-logs-now-show-session-affinity (published October 17, 2026).

Vercel AI Gateway can group requests by an opaque `providerOptions.gateway.sessionId` and display cost, model, provider, and cache statistics per session. This is useful for the existing SmokyBanana03 video-analysis retry and structured-output repair path, which can consume multiple inference requests for one clip.

Scope: one new random, opaque session ID per analysis invocation; share it across the original request, retries, and schema repair; set `sessionAffinity: false` to preserve existing provider routing. Do not include clip IDs, customer data, OAuth tokens, or source URLs in the session ID. Do not add paid calls, change publishing, change thresholds, or expand creator access.

Verification: local tests and exact-head CI; after separately approved deployment, compare Gateway Sessions view against known synthetic/test clip runs and confirm cost grouping. Dashboard evidence and real cost savings remain pending. This is observability, not a claim of lower inference cost.
