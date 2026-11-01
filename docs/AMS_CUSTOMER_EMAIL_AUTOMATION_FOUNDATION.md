# AMS Customer Email/Nurture Automation — Review-Only Foundation

## Scope (October 12, 2026)

First non-sending customer automation milestone. Reuses the production-proven Content Agent runtime behind Email Campaign and Nurture; does not rebuild agents, replace n8n, alter billing, or connect live outbound email.

Customer page: /campaign-automations, linked from both specialist-agent pages.
Customer API: /api/customer/campaign-automations, supporting GET own plans, POST new plan, PATCH review/pause. Signed customer session required; POST/PATCH enforce trusted-origin checks. Internal admin tokens are not customer sessions.

## Data and execution
- Plan creation references a successful, account-owned, email-channel Content Agent run with committed credit and persisted output.
- Input: kind, title, owner-scoped run ID, future start date, 3/5/7 steps and 1/2/3/7 day review cadence. All previews are UTC dates.
- Redis keys use namespace ams:customer-campaign-automation:v1 with hashed owner-scoped lists, atomic idempotent create, compare-and-swap review/pause transitions, bounded recent history and 90-day expiration.
- Every saved record has deliveryEnabled=false and recipientCount=0. No contact list, recipient email, sender credential, or external account connection is accepted.
- No new cron job or scheduled task: these are previews, not job execution. No email is sent or scheduled for sending.
- Reviewed means the customer examined the draft timeline. It is NOT consent to send. Pausing prevents further plan edits through this route.
- The existing Content Agent run confirms a successful email-channel generation but does not independently classify campaign versus nurture content. Customer review is required.

## Acceptance requirements before real automated sending
1. A new customer-specific verified email/ESP sender connection, encrypted and revocable. Never reuse AMS owner Gmail PR #262 monitoring OAuth for customer sending.
2. Authenticated consented audiences and exact recipient enrollment, suppression/unsubscribe, bounce/complaint handling, stop-on-reply, and revocation controls.
3. Customer approval of exact message, sender identity, recipients, cadence, consent proof and communication policy.
4. Independent durable tenant-scoped dispatch queue and worker, with retries, dedup, rate limits, concurrency, state recovery, failure alerts, and cancellation.
5. Controlled live delivery proof against approved test mailboxes for each sender, renewal, pause, opt-out, and failure case; no unsolicited customer messages.
6. Customer UI for start/pause/cancel, monitoring, history, and data removal, with legal/privacy review.
7. Owner authorization for production promotion and any real customer delivery.

## Unchanged
PR #262 Draft/HOLD; owner Gmail grants and owner-only alerts; all 27 scheduled tasks and their states; Stripe checkout, webhook, customer credits, subscriptions, Quick Audit, Android billing, Twitch, Shopify, social publishing, and production. No production change and no claim of hands-off automation readiness in this PR.
