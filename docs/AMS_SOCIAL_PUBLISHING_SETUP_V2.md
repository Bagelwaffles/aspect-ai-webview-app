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

## LinkedIn — organization-only cutover

The September 2026 production cutover intentionally quarantines any older LinkedIn credential until a fresh Aspect Marketing Solutions organization connection is installed.

The correct operating model is:

1. Kimberley's real personal LinkedIn member account is the human administrator/developer identity.
2. That member account must be a Super Admin/Administrator of the Aspect Marketing Solutions LinkedIn Page.
3. The LinkedIn developer application must be associated with and verified by the Aspect Marketing Solutions Page.
4. AMS publishes with an organization author URN, never a legacy personal author URN.
5. The access token must have the LinkedIn product access/scopes required to post for that organization.

Required server-side variables for the new cutover:

- `AMS_LINKEDIN_ACCESS_TOKEN`
- `AMS_LINKEDIN_AUTHOR_URN` — must be `urn:li:organization:*`
- `AMS_LINKEDIN_API_VERSION=202608`
- `AMS_LINKEDIN_CONNECTION_GENERATION=ams-linkedin-org-2026-09`

An older token may still exist in hosting configuration, but the production publish route will not call LinkedIn unless all four cutover requirements pass. A publish is never recorded as successful unless LinkedIn returns an external post ID.

Provider-side revocation/deletion of the old app or authorization should be completed from the authenticated LinkedIn Developer Portal after the correct organization app is ready.

## Facebook Page

Required server-side variables:

- `AMS_META_ACCESS_TOKEN`
- `AMS_META_GRAPH_API_VERSION`
- `AMS_FACEBOOK_PAGE_ID`

The Meta app/account must have authority for the Aspect Marketing Solutions Facebook Page. The adapter publishes to the Page feed endpoint and uses `destinationUrl` as the link when it is a public HTTPS URL. Placeholder IDs are treated as not configured.

## Instagram

Required server-side variables:

- `AMS_META_ACCESS_TOKEN`
- `AMS_META_GRAPH_API_VERSION`
- `AMS_INSTAGRAM_USER_ID`

The Instagram professional account must be connected to the Aspect Marketing Solutions Facebook Page/business assets used by the Meta app. Instagram requires `mediaUrl`. The adapter creates a media container and then publishes it. Both provider responses must return authoritative IDs.

## Pinterest

Required server-side variables:

- `AMS_PINTEREST_ACCESS_TOKEN`
- `AMS_PINTEREST_BOARD_ID`

Use the Aspect Marketing Solutions Pinterest business account/app. Pinterest requires `mediaUrl`. `destinationUrl` remains the outbound Pin link. Provider limits are enforced before the request: title is capped at 100 characters and description at 800 characters.

For durable authorization, use Pinterest's Authorization Code flow and continuous refresh-token model rather than a 24-hour test token.

## YouTube Shorts

YouTube Shorts remains deliberately unavailable in the social publisher. The publisher configuration reports it as false even when OAuth-like environment values exist. It must stay fail-closed until a real verified server-side upload implementation and controlled private/unlisted test are complete.

The eventual server-side connection uses the existing Google/YouTube OAuth web-app model and should retain a refresh token so AMS can upload after the owner leaves the session. Revocation must revoke the Google OAuth grant rather than merely deleting a local value.

## Provider cutover order

Use this order so no wrong identity can publish during setup:

1. LinkedIn: quarantine legacy identity, make the real owner account Page Super Admin, associate/verify the AMS developer app, authorize organization posting, install the fresh generation marker, then perform a controlled approved post.
2. Meta: connect the AMS Facebook Page first, then the linked Instagram professional account, then perform separate controlled posts.
3. Pinterest: connect the AMS business account/app with durable OAuth, select the approved AMS board, then perform a controlled Pin.
4. YouTube: keep the current publisher closed until the server-side uploader passes a private/unlisted upload test; only then enable Shorts.

## Concurrency and duplicate protection

Before any provider call, the server acquires a short-lived campaign publish lock in Redis and marks the selected delivery as `publishing`. A second overlapping request cannot call a provider while that claim is active. Already-published deliveries are returned from durable state rather than sent again.

## Safety rules

- Never put provider credentials in `NEXT_PUBLIC_*` variables.
- Never log raw OAuth tokens, provider request bodies, or raw provider errors.
- Never publish an unapproved campaign.
- Never treat a placeholder provider identifier as configured.
- Never record a successful publish without an authoritative external provider ID.
- Keep provider request and response-body consumption bounded by the configured timeout.
- LinkedIn must remain organization-only after the September 2026 cutover.
- Keep YouTube Shorts disabled until upload support is implemented and proven.
