# AMS / NEXT — Aspect Marketing Solutions Public Brand System (v1)

**Status:** Draft preview design, not a production release.  
**Owner:** Aspect Marketing Solutions  
**Scope:** Public website, agent catalog, marketing audit funnel, and cross-channel identity.  
**Out of scope:** Operator/admin consoles, agent execution, OAuth, Gmail permissions, Stripe, billing, webhooks, Android build/signing, and production activation.

## Brand positioning

**Company name:** Aspect Marketing Solutions  
**Short name:** AMS  
**Signature line (reuse on website and social):** *Always on. Always working. Built to grow your brand.*  
**Brand pillars:** AUTOMATE / AMPLIFY / GROW  
**Positioning:** Specialized AI marketing intelligence and actionable workflow support for growing businesses, with meaningful human approval and execution transparency. Do not advertise unfinished integrations as Live.

**Hero messaging:** "Your marketing. In motion. Your decisions. In control."

**Audience promise:** Practical content, lead capture, follow-up, search visibility, and campaign support without surrendering control of public or consequential actions.

## Visual identity

| Token | Value | Usage |
| --- | --- | --- |
| Midnight | `#060A14` | Primary background |
| Navy | `#101B31` | Surfaces and dashboards |
| Cyan | `#63DCFF` | Primary highlights, active elements, accessible focus |
| Violet | `#8F7CFF` | Secondary accent, restrained glows |
| Silver | `#EAF2FF` | Headings / high-contrast typography |
| Muted blue-gray | `#B5C1D3` | Body text |
| Success lime | `#C9FF3D` | *Optional minor status accent only*, not a competing dominant hue |

**Official owner-supplied assets (October 22):** The supplied global-network hero, metallic wordmark banner, square AMS icon and angular A emblem are hosted on the company Shopify CDN, with URLs in `lib/ams-brand-assets.ts`. Homepage, public headers and footers, and social metadata use these assets. Existing Android binaries and Google OAuth graphics remain unchanged until their respective approved review.

**Composition:** Big concise type, asymmetrical grids, midnight negative space, soft cyan-to-violet edge lighting, precise rules/grid detail, elegantly framed UI previews, and minimal animated flourishes. Keep it legible and fast on low-end mobile devices. Any workspace preview is labeled illustrative; never present mock data as real customer performance.

**Typography:** Bold modern system sans-serif for headings, readable sans-serif for body, monospace micro-labels. Avoid remote font fetches/build dependency. Tight headings; comfortable body line height; sufficient color contrast.

**Motion:** 150–300ms hover/focus transitions; no auto-playing video; honor `prefers-reduced-motion`.

## Website and conversion rules

1. **Homepage:** Clear outcome, trust, transparent current availability, direct paths to Agent Store and $49 Quick Marketing Audit.
2. **Agent Store:** Preserve existing 33 catalog entries, categories, statuses and verified boundaries. Use the shared palette and clear status labels; never silently upgrade Beta/Planned.
3. **Pricing:** Preserve current real plans and launch-flag behavior. Do not change customer credits or Stripe products.
4. **Quick Audit:** Preserve the existing $49 checkout logic, 48-hour delivery language, and all disclosures; no purchase flow change.
5. **Creators:** Visually align while accurately distinguishing Pilot, Integration required and Roadmap.
6. **Contact and legal/privacy:** Maintain functional access, especially Google data-use, deletion and Gmail approval disclosures used for verification.
7. **Navigation:** Desktop full nav and a discoverable keyboard-friendly mobile menu, with accessible CTA and sign-in.
8. **Metadata:** Maintain canonical domain `https://www.aspectmarketingsolutions.app`; social cards should use the approved brand art *after* the correct source asset is added. Do not set an Open Graph image path that does not exist.
9. **Responsive:** Inspect 320, 375, 768, 1024, and 1440px widths. No horizontal scrolling, covered CTA, or clipped text.

## Social template system

Use identical name, emblem, palette, headline style, and brand signature across:

- **LinkedIn:** Official company page only, not similarly named unrelated organizations. Technical authority and verified proof; 1:1/4:5 carousel cards and adapted cover.
- **Facebook / Instagram:** 4:5 feed cards, 9:16 stories/reels, and evergreen profile/cover styling.
- **YouTube:** Existing channel full-wordmark banner, square avatar, video thumbnail system and end card.
- **X and Pinterest:** Compact high-contrast branded images and recognizably consistent covers/pins.
- **Google Play:** Keep the existing approved AMS A emblem and screenshots truthful to the released Android app.

**Recurring social formats:** Agent spotlight, marketing problem-to-solution, real evidence/results, safe automation explained, launch updates, and the $49 audit offer.

**Copy style:** Confident, direct, intelligent, business-result focused, transparent about status. Avoid inflated AGI claims, fabricated reach/results or blanket automation guarantees.

**Post architecture:** One short insight or promise / specific proof or useful example / one CTA / AMS lockup. Put key message inside mobile crop safe zones; export separately for each platform rather than stretching one file.

## Preview validation and production gate

- [ ] Visual QA on home, agents, pricing, quick audit, creators, contact, privacy, and terms.
- [ ] Mobile menu works for keyboard and touch; focus visible.
- [x] Integrate the four owner-supplied brand images into the preview; social profiles remain untouched.
- [ ] Validate image CDN, responsive layouts and social exports.
- [ ] Verify all existing links, sign-in, Stripe status flags and $49 audit checkout continue unchanged.
- [ ] Confirm Google verification homepage disclosure and Privacy link remain present.
- [ ] Check contrast, reduced motion, performance, metadata and favicon.
- [ ] CI build/test passes against branch commit, and Vercel preview renders.
- [ ] Owner approves reviewed screenshots and preview before any merge or production promotion.

The design branch is deliberately separate from the existing Google verification, Aiven, Gmail, and campaign-preview work. No account credentials or environment variables are required for this design phase.

## Customer-facing information policy (Oct 23, 2026)

- The public website explains business outcomes, actual pricing/credit entitlements, current purchase availability, delivery expectations and clear customer approval/privacy information.
- Operational configuration, internal agent readiness evidence, implementation milestones, developer terminology, deployment plumbing, API/OAuth/credential details, and status debugging are **not** customer-facing marketing copy.
- Preserve the privacy policy, Google data-use, deletion, terms and billing disclosures. Don't hide information customers need to make an informed purchase.
- Agent Store excludes `internal: true` agents from public listings and direct public detail pages; status labels use plain English without changing stored technical states.
- A cinematic master banner gives way to progressively quieter grid/glow atmospheric backgrounds on catalog, pricing, audit and contact pages. Strong contrast and legible forms take priority over effects.
- Social brand, product mechanics and owner console remain separate responsibilities.
