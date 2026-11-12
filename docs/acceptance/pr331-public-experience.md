# PR #331 public website acceptance

Scope: existing `feat/ams-unified-public-experience-20261111`; Draft/Preview only.
No pricing, billing, auth guards, customer records, agent execution or creator automation changes.

## Presentation repairs

- Shared public shell and correctly separated header/main/footer landmarks, with a keyboard skip target on all shared-header routes.
- Mobile menu remains a native disclosure; Escape returns focus to its summary, outside pointer and focus departure dismiss it, and selecting a link closes it. Panel positioning is relative to the header instead of a narrow summary (the previous panel started at x=-6.9 at a 390px viewport).
- Customer sign-in navigation returns to the Agent Store, not the internal-admin `/dashboard`. The login callback sanitizer, configured-origin guard, OAuth scope and credentials are untouched.
- Login uses a real h1 and customer-facing availability guidance instead of environment variable names. Sign-in remains disabled on a mismatched Preview origin.
- Catalog filter state is announced, selected filters expose pressed state, Beta/Planned results are not mislabeled Live, and the Live/full-roadmap toggle resets conflicting filters.
- Consistent public-page backdrop, scoped primary-button style, wrapping buttons, 44px navigation targets, brighter secondary text and focus styles. Legal text is unchanged.

## Route / interaction acceptance procedure

Use the exact deployed commit. Inspect `/`, `/agents`, `/pricing`, `/quick-marketing-audit`, `/creators`, `/creators/pilot`, `/agents/content-agent`, `/contact`, `/login`, `/privacy`, `/terms`, `/refund`.

At 1440, 1280, 768, 390 and 360 CSS pixels: check rendered content, horizontal reflow, image loading, header/footer, heading hierarchy, controls and route destinations. At mobile test menu keyboard Enter/Escape, focus return, outside dismissal, link dismissal, and skip-link activation. Test catalog 7 Live -> 33 roadmap -> Beta/Planned -> return to 7. Validate empty form constraints only; no successful submission, payment, login grant or customer record.

Do not claim a full screen-reader or WCAG conformance audit from DOM checks alone. Record any untested screen-reader, browser zoom, reduced-motion or contrast cases explicitly. Exact final browser observations, screenshots and CI IDs belong in the PR/issue acceptance comments, so evidence updates do not manufacture new deployment commits.

## Measurement inventory and plan

Existing `components/marketing-attribution.tsx` captures source/medium/campaign/content and path when source or campaign exists, deduplicates in sessionStorage, and POSTs to `/api/marketing/attribution`. That endpoint validates bounded strings and logs `marketing_attribution`; this alone is not a durable conversion funnel or evidence of revenue/conversion improvement. No analytics behavior or data collection is changed here.

Proposed future measurement (not activated):

| Event | Minimum metadata | Authoritative evidence |
| --- | --- | --- |
| landing_view | allowlisted route, campaign category | consent-reviewed page event |
| primary_cta_click | route, fixed CTA ID, destination category | explicit UI activation |
| offer_view | audit/plan/agent slug | rendered offer |
| checkout_started | fixed offer ID, TEST/LIVE environment | existing server checkout creation |
| checkout_completed | fixed offer ID, TEST/LIVE environment | verified signed Stripe event, never return URL |
| signup_completed | opaque account cohort | verified account creation |
| first_generation_succeeded | agent slug, environment | durable successful run |
| repeat_generation_succeeded | agent slug, relative cohort window | independently deduplicated durable runs |

No emails, prompts, outputs, full referrers, arbitrary URL queries, tokens or payment details in analytics. Define retention, consent and access policy before new collection. Establish baseline unique visits and each transition before any controlled comparison; no invented baseline or conversion lift. Keep operational and customer analytics separate.
