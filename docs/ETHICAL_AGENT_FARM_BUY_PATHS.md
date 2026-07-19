# Ethical Agent Farm Buy Paths

## Current State

The ethical agent farm now has two buy path types:

1. Monthly support through live Stripe checkout
2. One-time offers through configurable Stripe checkout, with request-form fallback when a price ID is not set

## Monthly Support

Path:

- `/ethical-agent-farm/offers/monthly-marketing-support`
- `/billing`
- `/api/billing/checkout`

Behavior:

- Uses the existing live Stripe subscription checkout flow
- Keeps the safe org/user billing protections already in place
- Does not require any Stripe product or price changes

## One-Time Offers

Paths:

- `/ethical-agent-farm/offers/quick-marketing-audit`
- `/ethical-agent-farm/offers/social-content-pack`
- `/ethical-agent-farm/offers/website-profile-review`
- `/ethical-agent-farm/offers/business-cleanup-plan`

Behavior:

- Each page explains the offer clearly
- Each page uses a Stripe checkout button when its price ID is configured
- Each page falls back to the request form when a price ID is missing
- No fake revenue claims are shown

Checkout route:

- `POST /api/ethical-agent-farm/checkout`

Environment variables for live one-time Stripe checkout:

- `ETHICAL_AGENT_QUICK_MARKETING_AUDIT_PRICE_ID`
- `ETHICAL_AGENT_SOCIAL_CONTENT_PACK_PRICE_ID`
- `ETHICAL_AGENT_WEBSITE_PROFILE_REVIEW_PRICE_ID`
- `ETHICAL_AGENT_BUSINESS_CLEANUP_PLAN_PRICE_ID`

If any of those are missing, the page will still work and send the visitor to the compliant request form instead.

## Request Form Fields

- name
- email
- business name
- website or Facebook page
- selected offer
- notes / goals
- consent checkbox

Consent copy:

> I understand this is an ethical marketing service request and no revenue results are guaranteed.

## API Route

Request submissions post to:

- `POST /api/ethical-agent-farm/offer-request`

The route:

- validates required fields
- forwards accepted requests to the backend lead-capture store
- rejects empty or spam-like submissions
- returns structured JSON
- does not expose secrets
- reports whether email notification is configured

## Persistent Storage and Admin Visibility

One-time offer requests are now stored server-side and can be reviewed internally.

- Stored request records use the ethical agent farm request table in the backend database.
- Internal review is available at `/admin/ethical-agent-farm-requests`.
- The admin page is gated by the internal admin access flow and is not exposed through reviewer/demo access.
- Status values supported for follow-up are:
  - `new`
  - `reviewed`
  - `contacted`
  - `won`
  - `lost`
- Email notification remains `not_configured` unless an email provider is explicitly wired later.

## Production Verification

- Public request submissions are saving successfully in production.
- A production smoke request returned `saved: true` with `emailNotificationStatus: not_configured`.
- Empty requests return a controlled validation error instead of a server crash.
- Monthly support checkout continues to return a live Stripe Checkout Session URL.
- The internal requests page redirects unauthenticated users to `/admin/login` and keeps real lead data behind the internal admin flow.

## Confirmation State

After submission, the user sees:

- Request received
- We’ll review your business and follow up
- No payment has been charged yet

## Future Upgrade Path

When dedicated one-time Stripe prices exist, each one-time offer can be mapped to its own checkout session. The code already supports that path now.

Suggested future mapping:

- one offer
- one Stripe price ID
- one checkout session
- one confirmation page

Until then, the request form remains the compliant default fallback.
