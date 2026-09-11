# AMS Agent Deliverable Contracts

## Principle

An AMS agent is not complete merely because a model returned text or an API returned HTTP 200. An agent may be labeled **Live** only when the job implied by its name and customer promise has been proven through the intended end deliverable or action, including persistence, failure handling, customer-visible output, and human approval where required.

The protected shared generation runtime remains reusable infrastructure. Specialist agents should add the deliverable/action layer their business job requires rather than duplicating billing, credits, persistence, idempotency, or provider logic.

## Class 1 — Text-native agents

For these agents, reviewed written material is legitimately the primary product. Exports and approved delivery integrations are useful refinements but are not required to pretend the core job is something else.

- **Content Agent** — finished channel-appropriate marketing/business copy.
- **Email Campaign Agent** — complete reviewed campaign sequence with message purpose/order and consent-safe delivery guidance.
- **Nurture Agent** — complete reviewed nurture sequence with timing/stop conditions and consent-safe guidance.
- **Outreach Agent** — one reviewed prospect/follow-up message from customer-supplied context; no scraping, enrichment, or sending implied.
- **SEO Agent (current scope)** — implementable on-page SEO brief. If AMS later markets it as an SEO implementation agent, the Live gate must expand to actual approved page/metadata/schema changes or another concrete implementation artifact.

### Live gate

A production run must return the promised finished written deliverable, persist successfully, debit/commit or refund credits correctly, expose verification notes where appropriate, and render to the authenticated customer. Draft-only external actions remain explicit.

## Class 2 — Artifact-native agents

These agents must leave the customer with a usable file, structured dataset, executable definition, rendered media, report, build, or other durable artifact. Plain text displayed in a card is not enough.

- **Lead Magnet Agent** — downloadable/printable customer-ready lead magnet after review.
- **Product Creator Agent** — usable first-version digital/service/course/membership customer deliverable plus a separate seller launch kit. Physical products produce an honest production brief; AMS must never claim software manufactured a physical item.
- **Marketing Audit Agent** — durable structured result plus downloadable branded report and printable/PDF-ready action plan.
- **Analytics Agent** — source-backed report/dashboard/chart artifact tied to authorized data.
- **Automation Builder** — executable/importable workflow definition with validation and safe deployment boundary.
- **n8n Automation Agent** — valid n8n workflow JSON or an AMS-native workflow replacement, plus an isolated execution proof before Live.
- **Web Scraper Agent** — permitted public-source extraction delivered as structured CSV/JSON/data table with source context.
- **Research Agent** — source-backed brief with citations and a durable exportable report/dataset where appropriate.
- **Reverse-Engineering Intelligence Agent** — source-backed change/release brief tied to permitted public sources.
- **AGI Research Bot** — scheduled/source-backed briefing artifact with traceable sources.
- **Video Agent** — rendered video/media package, not only a script.
- **Console Builder** — runnable or previewable interface/code artifact, not only a UI description.
- **Android Build Agent** — installable APK and/or Play-ready AAB with package/signing/build verification appropriate to the release stage.

### Live gate

The actual artifact must be created, validated for its format, associated with the customer/run, retrievable after completion, and tested for failure/retry behavior. Any external deployment or publication remains a separate approval-controlled action unless that action is explicitly part of the agent promise.

## Class 3 — Action-native agents

These agents are defined by a real authorized external outcome. Writing instructions about the action does not satisfy the job.

- **Social Publisher Agent** — approved post reaches the selected authorized platform and delivery state is recorded.
- **YouTube Uploader Agent** — approved controlled upload reaches the authorized channel and resulting video state/ID is recorded.
- **Shopify Agent** — approved reversible catalog/store mutation is executed against the authorized store and verified.
- **Notifier Agent** — subscribed event produces verified notification delivery with failure handling.
- **Slack Agent** — authenticated read/write/notification operation is completed within approved scope.
- **Telegram Agent** — authenticated trigger/command/notification round trip is verified.
- **Sales Agent** — qualification state is persisted and an approved human/CRM handoff is completed.
- **Customer Support Agent** — source-backed response/triage is attached to a real support state with escalation where required.
- **Technical Support Agent** — bounded diagnostics produce verified remediation guidance and escalation/action state as permitted.
- **AMS Fiverr Bridge** — real permitted marketplace event passes intake, persistence, classification, and operator review.
- **Aspect Overmind** — real task is routed through a connected production workflow/tool path with result and failure state recorded.
- **Twitch Watcher Agent** — authorized live event produces the promised monitoring/summarization/clip signal and persists it.

### Live gate

The authorized external action must succeed end-to-end, its resulting identifier/state must be persisted, retries must be idempotent where applicable, failures must not be presented as success, and high-impact actions must preserve required human approval.

## Current refinement priorities

1. Lead Magnet Agent — finished reader-facing resource + downloadable/printable artifact.
2. Product Creator Agent — customer deliverable/production brief + separate seller launch kit.
3. $49 Quick Marketing Audit — downloadable branded report + printable/PDF-ready plan.
4. Text-native Live agents — add useful exports/reuse without falsely broadening their promise into automatic delivery.
5. Action-native/setup-required agents — do not promote to Live until the actual authorized action is proven.

## Non-negotiable boundaries

- Do not rebuild a proven shared runtime solely to make an agent look different.
- Do not call a generated description a product when the named job requires a file, build, media asset, dataset, or deployment.
- Do not call instructions an executed action.
- Do not fabricate external success, customer results, rankings, analytics, publishing, fulfillment, manufacturing, or sales.
- Do not auto-publish, auto-message, change stores, or take other high-impact external actions without the required authorization/approval path.
- Do not weaken tenant isolation, credit accounting, idempotency, persistence, or failure/refund protections while adding deliverable layers.
