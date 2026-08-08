# AMS Social Publisher v1

## Goal

Provide a safe internal publishing layer for AMS campaigns without coupling social delivery to any one AI provider.

## Current mode

Approval-first and delivery-disabled.

The internal API can validate, prepare, approve, and preview social posts for Facebook, Instagram, LinkedIn, and TikTok. It detects whether required server-side credentials are present but will not call platform publishing APIs yet.

## Internal API

`GET /api/internal/social-publisher`

Returns supported platforms, delivery mode, and credential presence as booleans only. It never returns secret values.

`POST /api/internal/social-publisher`

Accepts:

```json
{
  "campaign": "quick-marketing-audit",
  "platform": "facebook",
  "headline": "Optional headline",
  "body": "Post copy",
  "callToAction": "Optional CTA",
  "destinationUrl": "https://www.aspectmarketingsolutions.app/quick-marketing-audit",
  "scheduledFor": "2026-08-08T20:00:00.000Z"
}
```

The route requires the existing AMS internal API authorization path.

## Safety invariants

- No customer card or payment data belongs in this system.
- No social secret is returned by status endpoints or committed to source.
- Posts begin as drafts.
- Approval never publishes by itself.
- Missing credentials block readiness.
- Even credentialed posts remain delivery-disabled until the relevant adapter is verified against the platform API.
- Content generation and publishing are separate concerns so the publisher is not dependent on xAI availability.

## Platform credential map

Facebook: `META_PAGE_ACCESS_TOKEN` + `META_PAGE_ID`

Instagram: `META_PAGE_ACCESS_TOKEN` + `INSTAGRAM_BUSINESS_ACCOUNT_ID`

LinkedIn: `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_AUTHOR_URN`

TikTok: `TIKTOK_ACCESS_TOKEN` + `TIKTOK_OPEN_ID`

All credentials are server-side only. Never use `NEXT_PUBLIC_` prefixes.

## Recommended activation order

1. Facebook Page
2. Instagram Business
3. LinkedIn organization/profile as approved by the app permissions
4. TikTok after Content Posting API permissions are verified

For each platform, add one adapter at a time, test with a non-public or controlled test post where the platform supports it, record the returned post identifier, verify idempotency, then enable delivery for that adapter only.
