# AMS Fiverr Bridge v1

## Purpose

AMS Fiverr Bridge v1 turns Fiverr notification email into an internal, human-reviewed fulfillment queue without browser automation, scraping, unofficial Fiverr API calls, auto-messaging, auto-delivery, or off-platform payment routing.

This is intentionally different from the AMS YouTube connector. YouTube provides an official publishing API. The Fiverr bridge treats Fiverr as a human-operated marketplace boundary and automates the work around the marketplace rather than pretending AMS has a supported seller API.

## Architecture

```text
Fiverr notification
  -> mailbox connected to n8n Gmail OAuth
  -> AMS Fiverr Bridge v1 (n8n)
  -> strict Fiverr sender-domain verification
  -> POST /api/internal/fiverr/intake
     authenticated with existing AMS Internal Gateway header credential
  -> server-side event normalization/classification
  -> internal operator approval packet
  -> owner reviews work
  -> owner manually performs any Fiverr-facing action
```

The server route never calls Fiverr. It accepts a sanitized email envelope, verifies that the sender address belongs to `fiverr.com` or a subdomain, classifies the notification, identifies Quick Marketing Audit orders when supported by the email text, and returns an operator brief.

## Supported event classes

- `new_order`
- `requirements_received`
- `buyer_message`
- `revision_requested`
- `deadline_warning`
- `cancellation`
- `order_completed`
- `needs_review`

Unknown formats fail closed to `needs_review` rather than guessing.

## Quick Marketing Audit handling

When the notification clearly identifies the Quick Marketing Audit, the operator brief attaches the expected package:

1. 5 marketing problems
2. 5 specific fixes
3. improved headline
4. improved offer
5. 1 ready-to-use promotional post
6. 7-day action plan

The bridge prepares work only. Human approval remains mandatory before a buyer receives anything.

## Security boundaries

The following are hard requirements:

- no Fiverr passwords, cookies, session tokens, browser profiles, or MFA data in n8n or source control
- no Fiverr browser automation
- no unofficial Fiverr API calls
- no scraping authenticated Fiverr pages
- no automatic acceptance, cancellation, revision submission, messaging, or delivery
- no links asking Fiverr buyers to pay through AMS Stripe
- no external payment routing for Fiverr-originated work
- no embedded n8n credential IDs or secret values in the workflow JSON
- unknown sender domains are rejected
- obvious secrets in email body context are redacted before being returned in the normalized event

## Existing credential reused

The Vercel intake route expects the same server-side secret already used by the AMS n8n gateway:

- n8n credential name: `AMS Internal Gateway`
- header name: `x-ams-internal-key`
- Vercel environment variable: `AMS_N8N_INTERNAL_KEY`

Do not create another secret just for Fiverr.

## n8n installation

Import:

`automation/n8n/AMS_Fiverr_Bridge_v1.json`

Then configure only these items:

1. Open `Fiverr Gmail Trigger` and connect a Gmail OAuth credential for the mailbox that receives Fiverr notifications.
2. Open `Send to AMS Fiverr Intake` and select the existing `AMS Internal Gateway` Header Auth credential.
3. Open `Email Owner Approval Packet`, connect the same or another approved Gmail credential, and replace `owner@example.invalid` with the AMS operator email.
4. Keep the workflow inactive during initial validation.
5. Verify a real Fiverr notification reaches the Gmail trigger and that the normalized event is classified correctly.
6. Confirm the internal approval email contains no secret values and no buyer-facing action is performed.
7. Activate only after the validation evidence is recorded.

## Mailbox note

If the Fiverr account currently uses a non-Gmail mailbox, use that provider's automatic forwarding or change the Fiverr notification destination to a Gmail mailbox you control. Do not manually forward test messages unless the forwarded message still preserves the original Fiverr `From` header; the bridge deliberately rejects messages whose visible sender is not a Fiverr domain.

## Gmail search filter

The imported workflow uses this as a first-pass efficiency filter:

`from:fiverr.com -in:spam -in:trash`

This filter is not trusted as the security boundary. `Normalize + Verify Fiverr Email` independently extracts the sender mailbox and allows only `fiverr.com` or a subdomain. If a legitimate Fiverr notification sender is not returned by the Gmail query, widen the Gmail query and keep the code-level sender check unchanged.

## Internal endpoint

### GET `/api/internal/fiverr/intake`

Returns non-secret readiness metadata. It does not require the internal key and does not expose the key.

Expected shape:

```json
{
  "ok": true,
  "status": "listening",
  "configured": true,
  "human_approval_required": true,
  "auto_delivery_enabled": false
}
```

### POST `/api/internal/fiverr/intake`

Requires `x-ams-internal-key`.

Input shape:

```json
{
  "message_id": "provider-message-id",
  "thread_id": "provider-thread-id",
  "from": "Fiverr <notification@subdomain.fiverr.com>",
  "subject": "notification subject",
  "snippet": "short preview",
  "text": "plain text notification content",
  "received_at": "2026-08-08T04:00:00.000Z",
  "labels": ["INBOX"]
}
```

Do not include Gmail access tokens, full raw MIME blobs, attachments, passwords, cookies, or card/payment credentials.

## Required validation evidence before activation

Record all of the following:

- workflow imports without missing nodes
- Gmail credential connection works
- Header Auth is bound by credential name only
- intake GET shows `configured: true`
- genuine Fiverr sender is accepted
- non-Fiverr sender is rejected
- new order classification works
- revision classification works
- deadline warning classification works
- unknown notification fails to manual review
- Quick Marketing Audit package is attached only when the email supports the match
- approval packet is sent internally
- no Fiverr-facing action occurs
- no secret appears in execution logs

## Operational rule

The bridge may research public business information and draft work after an order is confirmed, but the operator must open Fiverr manually to inspect the actual order, requirements, deadline, buyer conversation, and delivery state before sending anything.
