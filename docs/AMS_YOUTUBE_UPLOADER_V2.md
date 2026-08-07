# AMS YouTube Uploader v2

## Mission

Replace the recovered Windows-only `YouTube Uploader` manifest with an operator-only cloud publisher that can move a finished AMS video from an approved HTTPS source into YouTube through n8n Cloud.

The legacy manifest expected a local OAuth file at `C:/Program Files/Aspect Marketing Solutions/youtube_credentials.json` and described only the first metadata request of a resumable YouTube upload. v2 removes that local dependency entirely.

## Security boundary

**Do not add YouTube publishing to the customer-facing AMS n8n action list.** This publisher controls the owner's YouTube channel and is therefore operator-only.

Request path:

`POST /api/internal/youtube/publish`

Authentication:

`Authorization: Bearer <AMS_INTERNAL_API_KEY>`

The Vercel route then calls the dedicated n8n webhook using the existing internal Header Auth secret:

`x-ams-internal-key: <AMS_N8N_INTERNAL_KEY>`

No OAuth access token, refresh token, client secret, or n8n credential ID belongs in GitHub source.

## Cloud flow

1. Operator or trusted AMS automation calls `/api/internal/youtube/publish`.
2. Vercel validates the request, source URL, metadata, and operator bearer token.
3. Vercel posts the sanitized request to the dedicated n8n webhook.
4. n8n validates the request again and allowlists the source host.
5. n8n downloads the MP4 as binary data.
6. The built-in n8n YouTube node uploads the binary video using the stored `AMS YouTube OAuth` credential.
7. If a permitted `thumbnail_url` is supplied, n8n downloads it and calls YouTube `thumbnails.set` with the same OAuth credential.
8. n8n returns `video_id`, `youtube_url`, privacy status, and whether the custom thumbnail was set.

## Files

- `lib/server/youtube-publisher.ts` — schema validation, HTTPS source allowlist, n8n client.
- `app/api/internal/youtube/publish/route.ts` — operator-only API endpoint.
- `tests/youtube-publish.test.ts` — allowlist and safe-default tests.
- `automation/n8n/AMS_YouTube_Uploader_v2.json` — importable n8n workflow.
- `agents/youtube_uploader_agent_v2.json` — cloud-safe agent manifest.

## Vercel environment variables

Add these server-side only. Never prefix them with `NEXT_PUBLIC_`.

```text
AMS_N8N_YOUTUBE_PUBLISH_WEBHOOK_URL=https://aspectmarketingsolutions.app.n8n.cloud/webhook/ams-youtube-publish-v2
AMS_YOUTUBE_SOURCE_HOSTS=files2.heygen.ai,resource2.heygen.ai,dynamic.heygen.ai
```

Already existing and reused:

```text
AMS_INTERNAL_API_KEY
AMS_N8N_INTERNAL_KEY
```

Do not rotate or change the working n8n Header Auth secret merely to install this workflow.

## n8n import and credential setup

1. Import `AMS_YouTube_Uploader_v2.json` into n8n Cloud.
2. Open **AMS YouTube Publish Webhook**.
3. Keep `POST`, path `ams-youtube-publish-v2`, and Header Auth.
4. Select the existing Header Auth credential **AMS Internal Gateway**.
5. Create or select a YouTube OAuth2 credential named **AMS YouTube OAuth**.
6. In that credential, authorize the Google/YouTube account that owns the destination channel.
7. Assign **AMS YouTube OAuth** to **Upload Video to YouTube**.
8. Assign the same credential to **Set YouTube Thumbnail** as a predefined YouTube OAuth credential.
9. Save the workflow but keep it inactive while testing.
10. Execute a private test upload.
11. Confirm the returned `video_id` is visible in YouTube Studio.
12. Publish/activate the workflow only after the private test passes.

The required YouTube OAuth scope is the upload-management scope (`youtube.upload`). Depending on your Google project/OAuth configuration, Google can require consent-screen verification. New/unverified API projects can also force API uploads to **private**, even when a public status is requested. For that reason AMS v2 defaults to `private` until the channel integration is proven.

## Custom thumbnail

YouTube accepts custom JPEG/PNG thumbnails up to 2 MB. The workflow supports a `thumbnailUrl`, but that URL must be on the same explicit source allowlist as the video. Do not weaken the allowlist just to make a thumbnail load.

The futuristic AMS thumbnail generated for the first promo is packaged with the local distribution bundle. It is not automatically passed to n8n until it has a controlled HTTPS source that n8n can fetch. The first private upload can safely run without the thumbnail; the thumbnail can then be set manually or after a controlled asset-hosting path is added.

## First AMS video test

The included `ams_youtube_first_publish_payload.json` points at the finished captioned HeyGen promo:

**AMS: The Cloud AI Command Center**

Recommended title:

`Aspect Marketing Solutions: The AI Command Center for Business Growth`

Initial privacy:

`private`

Recommended category:

`28` (Science & Technology)

Made for kids:

`false`

Notify subscribers during test:

`false`

## Example operator request

Never paste a real API key into chat, source, screenshots, or shell history that will be shared.

```bash
curl -X POST https://aspectmarketingsolutions.app/api/internal/youtube/publish \
  -H "Authorization: Bearer $AMS_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  --data @ams_youtube_first_publish_payload.json
```

Expected success shape:

```json
{
  "ok": true,
  "request_id": "...",
  "status": "published",
  "video_id": "...",
  "youtube_url": "https://youtu.be/...",
  "privacy_status": "private",
  "thumbnail_set": false
}
```

## Launch gate

Do not switch the first upload to public until all of these are true:

- YouTube OAuth credential is connected to the correct channel.
- Private MP4 upload completes.
- Returned `video_id` exists in YouTube Studio.
- Title/description/tags are correct.
- No secret is present in logs or source.
- Thumbnail path is verified if automatic thumbnail upload is enabled.
- Google API project restrictions/verification status are understood.

Once that gate passes, change the publish payload from `private` to `public` (or `unlisted`) and perform the final release.
