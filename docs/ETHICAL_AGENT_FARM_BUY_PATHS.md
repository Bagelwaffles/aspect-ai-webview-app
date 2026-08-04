# Ethical Agent Farm Launch Paths

## Launch Policy

AMS launches with subscription checkout only. One-time Ethical Agent Farm offers remain request-only until a separate fulfillment design, approved price catalog, and lifecycle tests are complete.

## Subscription Plans

Paths:

- `/pricing`
- `/billing`
- `POST /api/billing/checkout`

Behavior:

- Customer authentication is required.
- The server selects an approved recurring Stripe price for the selected plan.
- Checkout uses Stripe subscription mode.
- Access is granted only through signed webhook fulfillment.

## One-Time Service Requests

Offer pages:

- `/ethical-agent-farm/offers/quick-marketing-audit`
- `/ethical-agent-farm/offers/social-content-pack`
- `/ethical-agent-farm/offers/website-profile-review`
- `/ethical-agent-farm/offers/business-cleanup-plan`

Behavior:

- Public pages link only to the request form.
- Submitting a request does not create a Stripe session or charge the visitor.
- Copy states that the offer is request-only at launch.
- No public `Buy on Stripe` action is shown.

The former one-time endpoint is retained as an explicit lockout:

- `POST /api/ethical-agent-farm/checkout`
- Always returns HTTP `410 Gone`.
- Returns code `ONE_TIME_CHECKOUT_DISABLED`.
- Never initializes Stripe or creates a Checkout Session.

## Request Form

Path:

- `/ethical-agent-farm/request`

Fields:

- name
- email
- business name
- website or Facebook page
- selected offer
- notes or goals
- consent checkbox

Consent copy:

> I understand this is an ethical marketing service request and no revenue results are guaranteed.

Requests post to `POST /api/ethical-agent-farm/offer-request`. Accepted requests are stored for protected internal review. The public flow does not expose secrets, grant access, or claim that delivery has started.

## Future Re-enable Requirements

One-time payments require a separate reviewed change that provides all of the following before public checkout returns:

- an approved server-side price-to-fulfillment allowlist
- authenticated buyer and tenant ownership
- signed webhook fulfillment for every offer
- idempotent delivery records
- failure and refund handling
- end-to-end tests proving payment cannot succeed without fulfillment

Until those conditions are met, the `410` lockout is the intended production behavior.
