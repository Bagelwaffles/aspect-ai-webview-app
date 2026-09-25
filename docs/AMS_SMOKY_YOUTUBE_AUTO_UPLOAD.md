# SmokyBanana03 Twitch → YouTube private auto-upload

## Purpose

This integration is an internal, single-creator path for **SmokyBanana03**. It is not a generic customer-facing YouTube publisher.

The creator workflow is intentionally simple:

`PS5 Twitch stream → AMS stream/video analysis → clip selection → 9:16 render → YouTube metadata → Private upload`

The creator does not need to operate AMS.

## Hard safety boundaries

- Twitch source broadcaster is fixed to broadcaster ID `155477801`.
- YouTube destination is fixed by `AMS_SMOKY_YOUTUBE_EXPECTED_CHANNEL_ID`.
- The uploader never accepts a destination channel ID from a request body, generated metadata, Twitch content, or UI field.
- Before every upload, AMS refreshes the Google OAuth access token and calls YouTube `channels.list(part=id,snippet,mine=true)`.
- If the authenticated channel does not exactly match the expected channel ID, AMS fails closed.
- Every automatic upload uses `privacyStatus=private`.
- Every automatic upload uses `notifySubscribers=false`.
- No public or unlisted auto-publish path exists in this adapter.
- Existing public YouTube content is not modified.
- The general AMS social publisher remains closed for YouTube Shorts.

## Environment

All values are server-side only:

- `AMS_SMOKY_YOUTUBE_AUTO_UPLOAD_ENABLED=false`
- `AMS_SMOKY_YOUTUBE_CLIENT_ID`
- `AMS_SMOKY_YOUTUBE_CLIENT_SECRET`
- `AMS_SMOKY_YOUTUBE_REFRESH_TOKEN`
- `AMS_SMOKY_YOUTUBE_EXPECTED_CHANNEL_ID`

Keep the enable flag false until the production OAuth identity is verified.

## Activation gate

1. Use the existing SmokyBanana03 YouTube channel. Do not create another channel.
2. Authorize the Google OAuth client for the channel with the YouTube upload permission required by `videos.insert`.
3. Obtain a durable refresh token.
4. Call YouTube `channels.list(mine=true)` using that authorization.
5. Record the exact returned channel ID as `AMS_SMOKY_YOUTUBE_EXPECTED_CHANNEL_ID`.
6. Keep the auto-upload flag false and perform one controlled private upload.
7. Verify the uploaded video appears on SmokyBanana03 and is **Private**.
8. Verify subscribers were not notified.
9. Verify a wrong expected channel ID produces `SMOKY_YOUTUBE_CHANNEL_MISMATCH`.
10. Only after those checks set `AMS_SMOKY_YOUTUBE_AUTO_UPLOAD_ENABLED=true`.

## Idempotency

AMS stores upload state by Twitch render job ID in Redis. A successfully uploaded job is not uploaded again. Uploads with uncertain completion state fail closed instead of retrying automatically.

## Current media boundary

The automated write path applies to **rendered Twitch Shorts** already stored in AMS R2.

The current repository does not have a verified full-length Twitch VOD binary-ingestion path. Twitch archive metadata, VOD references, clip creation, clip download, video analysis, and Short rendering exist, but full VOD transfer to YouTube requires a separate bounded implementation and validation.

Do not bypass Twitch/YouTube platform APIs or use unrestricted third-party downloading to fill that gap.

## Metadata

The private upload uses the evidence-backed metadata already attached to the rendered Twitch job:

- YouTube title
- description
- tags
- hashtags
- Gaming category

AI-generated metadata cannot select the destination channel or change privacy mode.
