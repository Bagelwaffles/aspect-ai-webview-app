# AMS Social Publishing Setup V2

This is the reconciled launch path for the Vercel-native social publisher. Publishing remains approval-first: drafts are never sent to an external platform until the stored campaign has been explicitly approved.

## Runtime

The social campaign store uses the existing server-side Redis-compatible store and internal API boundary:

- `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL`
- `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN`
- `AMS_INTERNAL_API_KEY`

The draft-generation agent uses the existing Vercel AI Gateway runtime through `AMS_SOCIAL_CAMPAIGN_MODEL`.

## Campaign URLs

`destinationUrl` and `mediaUrl` are intentionally separate.

- `destinationUrl` is the CTA/landing-page link.
- `mediaUrl` is the approved public HTTPS image used by Instagram or Pinterest.

Do not put a landing page into `mediaUrl`. Instagram and Pinterest fail closed if an approved public media URL is missing.

## LinkedIn

Required server-side variables:

- `AMS_LINKEDIN_ACCESS_TOKEN`
- `AMS_LINKEDIN_AUTHOR_URN`
- `AMS_LINKEDIN_API_VERSION`

The author may be a verified personal `urn:li:person:*` or an organization URN for which the authenticated account has posting authority. A publish is not recorded as successful unless LinkedIn returns an external post ID.

## Facebook Page

Required server-side variables:

- `AMS_META_ACCESS_TOKEN`
- `AMS_META_GRAPH_API_VERSION`
- `AMS_FACEBOOK_PAGE_ID`

The adapter publishes to the Page feed endpoint and uses `destinationUrl` as the link when it is a public HTTPS URL. Placeholder IDs are treated as not configured.

## Instagram

Required server-side variables:

- `AMS_META_ACCESS_TOKEN`
- `AMS_META_GRAPH_API_VERSION`
- `AMS_INSTAGRAM_USER_ID`

Instagram requires `mediaUrl`. The adapter creates a media container and then publishes it. Both provider responses must return authoritative IDs.

## Pinterest

Required server-side variables:

- `AMS_PINTEREST_ACCESS_TOKEN`
- `AMS_PINTEREST_BOARD_ID`

Pinterest requires `mediaUrl`. `destinationUrl` remains the outbound Pin link. Provider limits are enforced before the request: title is capped at 100 characters and description at 800 characters.

## YouTube Shorts

YouTube Shorts remains deliberately unavailable. The publisher configuration reports it as false even when OAuth-like environment values exist. It must stay fail-closed until a real verified server-side upload implementation and controlled private/unlisted test are complete.

## Concurrency and duplicate protection

Before any provider call, the server acquires a short-lived campaign publish lock in Redis and marks the selected delivery as `publishing`. A second overlapping request cannot call a provider while that claim is active. Already-published deliveries are returned from durable state rather than sent again.

## Safety rules

- Never put provider credentials in `NEXT_PUBLIC_*` variables.
- Never log raw OAuth tokens, provider request bodies, or raw provider errors.
- Never publish an unapproved campaign.
- Never treat a placeholder provider identifier as configured.
- Never record a successful publish without an authoritative external provider ID.
- Keep provider request and response-body consumption bounded by the configured timeout.
- Do not enable YouTube Shorts until upload support is implemented and proven.
