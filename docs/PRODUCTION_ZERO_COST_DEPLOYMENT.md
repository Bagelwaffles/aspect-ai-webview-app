# AMS Zero-Cost Production Deployment

Approved by the owner on 2026-08-04.

## Source

- Merge commit: `ba8abdc694989b6ea5dab0e69cecb4edda0af3bc`
- Pull request: #14
- Validation: CI run #108 passed

## Production mode

The site launches with paid AI execution disabled by default.

- `NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE` must remain unset or false.
- New paid AI checkout remains paused.
- Content Agent remains private beta / temporarily unavailable.
- Request-only services, account access, saved-run history, billing portal access, and public marketing pages remain available.
- xAI and Relevance execution remain disabled until separately approved and funded.

## Rollback

Keep the immediately previous Vercel production deployment available as the rollback target during post-deploy verification.

## Outstanding security work

Historical Relevance credentials still require provider-side revocation or rotation. Relevance must remain disabled until that is complete.
