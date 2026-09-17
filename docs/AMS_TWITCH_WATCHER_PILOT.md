# AMS Twitch Watcher controlled pilot

## Purpose

The Twitch Watcher pilot proves one real, read-only creator integration before AMS represents Twitch monitoring as a working commercial capability.

The first production acceptance path is:

1. AMS owner session starts Twitch OAuth.
2. The creator authorizes exactly `user:read:broadcast`.
3. AMS validates the returned Twitch token and records only the channel identity plus encrypted OAuth tokens.
4. AMS creates EventSub webhook subscriptions for `stream.online`, `stream.offline`, and `channel.update`.
5. Twitch verifies the HTTPS webhook using the configured EventSub signing secret.
6. A real authorized channel produces an online event, optional channel-update events, and an offline event.
7. AMS stores the stream session and, after the offline event, queries Twitch for the matching archive VOD, creator stream markers, and Twitch clips created during the stream window.
8. AMS stores a deterministic source-backed stream summary.
9. The owner verifies the summary in `/creators/twitch` before the agent can move from Setup Required to Beta.

## Hard boundaries

This pilot does not request or implement chat write, moderation, clip creation, video deletion, broadcast mutation, ads, spending, DMs, or automatic publishing.

The generated summary is explicitly labeled `twitch-metadata`. It may use Twitch stream metadata, VOD references, creator markers, and Twitch clips. It must never claim that AMS visually reviewed gameplay unless a separate media-ingestion path later supplies the actual media.

## Production environment variables

All values are server-side only. Never use `NEXT_PUBLIC_` for Twitch credentials.

- `AMS_TWITCH_CLIENT_ID` — Twitch Developer application client ID.
- `AMS_TWITCH_CLIENT_SECRET` — Twitch Developer application client secret.
- `AMS_TWITCH_EVENTSUB_SECRET` — independent random ASCII webhook signing secret, 10–100 characters.
- `AMS_CONNECTION_ENCRYPTION_KEY` — existing 32-byte base64 AMS connection-vault key used to encrypt Twitch access/refresh tokens at rest.
- `PUBLIC_APP_URL` or `NEXTAUTH_URL` — production AMS origin.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — existing AMS persistent store.

The Twitch Developer application must register this exact OAuth redirect URL:

`https://www.aspectmarketingsolutions.app/api/internal/twitch/callback`

The runtime derives the EventSub callback as:

`https://www.aspectmarketingsolutions.app/api/twitch/eventsub`

## Security controls

- OAuth start/callback/status/disconnect are owner-gated through the existing AMS owner session.
- OAuth state is random, signed, expiring, and kept in an HttpOnly SameSite=Lax cookie.
- Twitch tokens are AES-256-GCM encrypted before Redis persistence.
- EventSub requests are verified using Twitch's message ID + timestamp + raw-body HMAC signature.
- Webhook timestamps outside the replay window are rejected.
- Event IDs are deduplicated.
- Disconnect revokes the current user token where possible, removes AMS-created subscriptions for the broadcaster, and removes local connection/session state.
- External publishing remains approval-first and is not part of this pilot.

## Status gates

### Setup Required

Use this state when the runtime is deployed but production Twitch application credentials, channel authorization, webhook verification, or the first real stream proof is still missing.

### Beta

Promotion to Beta requires evidence of all of the following:

- owner-authenticated Twitch OAuth succeeds;
- the expected broadcaster ID/login is recorded;
- all three intended EventSub webhook subscriptions are accepted and verified;
- one real `stream.online` event is accepted with a valid signature;
- one real `stream.offline` event is accepted with a valid signature;
- a durable source-backed summary is stored and visible in the owner console;
- retries/duplicate EventSub messages do not duplicate the stream result;
- no Twitch write action is performed.

### Live

Do not promote to Live merely because the controlled pilot passes. Live additionally requires a supported customer authorization/onboarding path, connection health/re-auth handling, support documentation, token-validation operations, privacy/export/delete handling, production observability, and intended-user availability.

## Current external owner action

Twitch does not provide an API that creates the Developer application itself. The AMS owner must register the application in Twitch's Developer Console, add the exact redirect URI above, and place the resulting client ID/secret plus an independent EventSub secret into the production secret store. No secret should be pasted into source code, GitHub issues, logs, or chat.
