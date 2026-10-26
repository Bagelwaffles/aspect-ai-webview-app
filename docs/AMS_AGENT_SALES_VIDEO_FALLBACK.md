# AMS sales-video fallback — isolated repair, not released

On October 26, 2026, authenticated customer browser evidence showed the same HeyGen player error on seven AMS Live-agent sales pages. Source `app/agents/agentSales.ts` assigned one shared HeyGen embed ID (`f1cd50c072c34d37ab911a1c4895ce4a`) to all agent sales pages. HeyGen's read-only video lookup returned `404 video_not_found` for that ID.

This proposal disables the unverified shared embed rather than presenting broken playback, shows an accessible explanatory state, preserves all agent launch and pricing links, and removes inaccurate "watch the video" catalog copy. It does not regenerate or upload media, change billing or checkout, change agent execution, or deploy production.

A completed AMS introduction video exists in the connected HeyGen account, but its **public embedding and owner-approved suitability have not been verified**. It is **not** automatically substituted.

## Acceptance before merge

1. Exact-head focused agent-sales regression tests, typecheck, app build and secret scan PASS.
2. A matching Preview of all seven agent pages renders the fallback and functional agent launch links, with no dead player or autoplay.
3. When a replacement is proposed later, verify public iframe playback (not merely a completed render) and marketing appropriateness before restoring embed URL.
4. Separate owner review and explicit production release authorization. Keep unrelated pricing/billing guard in existing Draft PR #273; do not merge it as part of this repair.

Tracking: [AMS launch closeout #285](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/285). This draft alone is not a production fix.
