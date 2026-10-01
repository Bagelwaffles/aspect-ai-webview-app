# Platform compatibility check — 2026-10-01

## Vercel Node.js 20 deprecation

Vercel disabled Node.js 20 for new Builds and Functions deployments on 2026-10-01.

AMS repository audit before this change:
- root `package.json`: no `engines.node` pin
- GitHub Actions: Node 22
- `tools/vercel-browser-worker/package.json`: Node 22
- staging Docker image: Node 22
- local Windows browser-worker installer: Node 20-or-newer minimum
- `.nvmrc` / `.node-version`: absent

Live Vercel evidence on 2026-10-01 showed READY deployments for both `aspect-ai-overlord` and `aspect-ai-browser-worker` after the deprecation date, so AMS was not deployment-blocked by a Node 20 project setting at the time of this audit.

This PR moves the repository and CI baseline to Node 24 and adds explicit Vercel-compatible `engines.node = 24.x` pins for both deployed projects. Production settings must not be changed separately from this tested branch.

Required merge gate:
1. GitHub test/type/build workflows pass on Node 24.
2. Vercel preview is READY.
3. Main preview `GET /api/health` reports `runtime.node` beginning with `v24.`.
4. Browser-worker authenticated `GET /api/status` reports `nodeVersion` beginning with `v24.`.
5. No production promotion until those proofs are recorded.

Official notice: https://vercel.com/changelog/node-js-20-is-being-deprecated

## Claude Sonnet 4.5 retirement

Anthropic retires `claude-sonnet-4-5-20250929` on 2026-11-30 and recommends Claude Sonnet 5.5.

Repository/configuration search result:
- exact model ID `claude-sonnet-4-5-20250929`: no matches
- exact `claude-sonnet-5-5`: no matches
- checked-in Content Agent model: `openai/gpt-5.4-mini`
- checked-in Social Campaign model: `openai/gpt-5.4-mini`
- checked-in Twitch video-analysis model: `google/gemini-2.5-flash`

Result: no AMS code migration is required for the Sonnet 4.5 retirement based on checked-in configuration and provider-routing code. Do not introduce Sonnet 5.5 into production solely because of this deprecation. Any future Anthropic route must first pass the existing quality-and-cost benchmark and account for Sonnet 5.5 tool/thinking behavior changes.

Official release notes: https://platform.claude.com/docs/en/release-notes/overview
