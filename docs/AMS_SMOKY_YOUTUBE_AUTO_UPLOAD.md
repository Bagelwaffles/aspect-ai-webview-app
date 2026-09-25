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

## Full-length VOD uploader

AMS now also includes a full-length private YouTube VOD upload engine for video objects already stored in AMS R2.

The long-video path is separate from the Short uploader and uses:

- an owner-approved enqueue endpoint;
- durable Redis job/idempotency state keyed to the Twitch VOD ID;
- an encrypted YouTube resumable-session URI;
- a scoped GitHub Actions worker authenticated to AMS with OIDC;
- 16 MiB source ranges rather than loading a multi-gigabyte VOD into Vercel memory;
- YouTube resumable status checks before sending or resuming bytes;
- automatic access-token and R2 source-URL refresh;
- retry of interrupted incomplete sessions;
- fail-closed `uncertain` state when AMS cannot prove whether a final upload completed;
- hard-coded Private visibility and subscriber notifications disabled;
- the same exact SmokyBanana03 YouTube channel verification used by Shorts.

The full-length worker is gated separately with:

`AMS_SMOKY_YOUTUBE_VOD_UPLOAD_ENABLED=false`

The source object must be under the SmokyBanana03 AMS-owned VOD namespace:

`creators/twitch/155477801/.../vods/...`

A different broadcaster, clip namespace, path traversal, arbitrary public URL, or caller-selected YouTube destination is rejected.

### Preferred Twitch-native transfer

Twitch's Video Producer currently exposes an official **Export** action that sends a creator-owned VOD directly to a connected YouTube account without downloading the file locally.

For VODs that still exist in Twitch Video Producer, prefer this official export path when the connected destination can be verified as the existing SmokyBanana03 YouTube channel. The AMS resumable R2 uploader remains the fallback for creator-owned media that has already been archived into AMS storage.

The Twitch Export action is a product UI capability rather than a documented Helix export API. Any zero-touch automation of that path must therefore use the owner-authorized Browser Control worker, stay on Twitch's own Video Producer/Connections pages, stop on login/MFA/CAPTCHA/consent, and verify the destination YouTube identity before export.

### Remaining Twitch media-ingestion boundary

Twitch's official Helix Videos API exposes VOD metadata/listing and deletion, but it does not expose a general endpoint that returns the raw full-length VOD media file. The AMS uploader therefore starts only after the creator-owned full video is present in AMS R2 through a separate compliant archive/import path.

Do not bypass Twitch platform controls or use unrestricted third-party downloading to fill that acquisition gap.

## Metadata

The private upload uses the evidence-backed metadata already attached to the rendered Twitch job:

- YouTube title
- description
- tags
- hashtags
- Gaming category

AI-generated metadata cannot select the destination channel or change privacy mode.
