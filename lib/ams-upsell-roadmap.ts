/**
 * INTERNAL ONLY — future cross-sell hypotheses for AMS non-Live agents.
 * Never imported by checkout, public sales pages, automated mail or billing.
 * Every entry is NOT FOR SALE until the underlying agent reaches verified Live.
 */
export const ROADMAP_AGENT_UPSELLS = {
  "ams-fiverr-bridge": {
    nextOutcome: "Approved Fiverr order intake and fulfillment tracking",
    prerequisite: "Verify allowed marketplace events and keep Fiverr payments/messages on-platform.",
  },
  "aspect-overmind": {
    nextOutcome: "Scoped operator setup and supervised cross-agent orchestration",
    prerequisite: "Release a tested exact-action executor with owner authorization and audit trails.",
  },
  "youtube-uploader-agent": {
    nextOutcome: "Channel-approved video metadata and recurring publishing support",
    prerequisite: "Verify rights, OAuth, privacy state, delivery receipts, and approval before public upload.",
  },
  "social-publisher-agent": {
    nextOutcome: "Approved multi-channel publishing setup and reporting",
    prerequisite: "Prove one exact-platform draft, review, publication and reconciliation flow.",
  },
  "android-build-agent": {
    nextOutcome: "Managed app packaging and Play Store submission assistance",
    prerequisite: "Complete Google Play access, testing and production release compliance gates.",
  },
  "sales-agent": {
    nextOutcome: "Offer qualification and human-reviewed pipeline follow-up setup",
    prerequisite: "Verify compliant lead source, approved actions, and the specific sales workflow.",
  },
  "marketing-audit-agent": {
    nextOutcome: "Implementation of agreed audit findings",
    prerequisite: "Use the existing $49 audited service and quote path; do not create another audit product.",
  },
  "analytics-agent": {
    nextOutcome: "Recurring KPI interpretation and decision-ready reporting",
    prerequisite: "Validate source data, consent, reproducibility and the Live production run.",
  },
  "automation-builder": {
    nextOutcome: "Design and deploy one approved business workflow",
    prerequisite: "Demonstrate authorized triggers, secrets boundaries, idempotency and rollbacks.",
  },
  "n8n-automation-agent": {
    nextOutcome: "Owned workflow migration or secure self-hosted automation setup",
    prerequisite: "Resolve the blocked n8n infrastructure; no production dependency on a lapsed trial.",
  },
  "affiliate-marketing-agent": {
    nextOutcome: "Compliant affiliate tracking and partner onboarding",
    prerequisite: "Verify attribution, disclosure, payout approvals and one accepted campaign.",
  },
  "shopify-agent": {
    nextOutcome: "Scoped storefront catalog and listing implementation",
    prerequisite: "Verify owner store authorization, draft persistence and controlled publish.",
  },
  "video-agent": {
    nextOutcome: "Approved video package production and delivery",
    prerequisite: "Prove render quality, rights, cost ceilings and artifact delivery.",
  },
  "twitch-watcher-agent": {
    nextOutcome: "Creator-approved highlights and Shorts production package",
    prerequisite: "Prove authorized source clips, private deliverables, channel identity and publish approval.",
  },
  "customer-support-agent": {
    nextOutcome: "Knowledge-base onboarding and escalated support workflow",
    prerequisite: "Verify ticket source, data handling, escalation policy and safe handoff.",
  },
  "technical-support-agent": {
    nextOutcome: "Scoped diagnostics and approved remediation playbook",
    prerequisite: "Prove non-destructive diagnostic permissions and escalation.",
  },
  "notifier-agent": {
    nextOutcome: "Business event alert routing and delivery monitoring",
    prerequisite: "Verify one event end-to-end with deduplication, receipts and quiet hours.",
  },
  "slack-agent": {
    nextOutcome: "Authorized workspace summaries and alerts",
    prerequisite: "Verify workspace authorization, channel scope and no unapproved posts.",
  },
  "telegram-agent": {
    nextOutcome: "Bot notification and inbound workflow onboarding",
    prerequisite: "Verify account ownership, trigger authentication and opt-in recipient delivery.",
  },
  "web-scraper-agent": {
    nextOutcome: "Permitted public-source extraction and monitoring",
    prerequisite: "Verify source terms, rate limits, provenance and safe processing.",
  },
  "research-agent": {
    nextOutcome: "Recurring source-backed intelligence brief",
    prerequisite: "Demonstrate reproducible retrieval, citations and authorized use.",
  },
  "reverse-engineering-intelligence-agent": {
    nextOutcome: "Compliant competitor capability mapping",
    prerequisite: "Restrict to allowed sources and non-invasive research; verify citations.",
  },
  "agi-research-bot": {
    nextOutcome: "AI platform change monitoring and decision briefs",
    prerequisite: "Verify reliable sources, alert thresholds and cost limits.",
  },
  "console-builder": {
    nextOutcome: "Custom owner dashboard implementation",
    prerequisite: "Prove authenticated deployment, authorization and data isolation.",
  },
  "meme-to-agent": {
    nextOutcome: "Supervised creative workflow prototyping",
    prerequisite: "Validate the actual agent generation, licensing and production quality.",
  },
  "agent-battle-arena": {
    nextOutcome: "Bounded agent evaluation and benchmark reports",
    prerequisite: "Demonstrate fair test cases, reproducibility, model costs and privacy limits.",
  },
} as const

export const ROADMAP_UPSELL_STATE = "internal_concept_not_for_sale" as const
