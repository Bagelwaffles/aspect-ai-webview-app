# YouTube Data API November 2026 — Creator Autopilot safety checkpoint

Source: [official YouTube Data API revision history](https://developers.google.com/youtube/data/revision_history), entries dated **November 2 and 3, 2026**. Reviewed **2026-11-04**.

## Immediate upload privacy regression risk (November 2)

YouTube removed the former API-project verification rule forcing uploads from unverified projects to Private. Per Google's current documentation, **`videos.insert` defaults to Public when `status.privacyStatus` is omitted**, subject to creator account settings. API-project verification status must not be used as a privacy safeguard.

AMS currently sends **`privacyStatus: "private"` explicitly** during both the existing Twitch Shorts uploader (`lib/server/youtube-private-uploader.ts`) and full-VOD upload session creation (`lib/server/twitch-catchup.ts`). It also sets **`notifySubscribers=false`**, validates the expected YouTube channel, and requires provider readback of Private state before declaring verification. Public promotion remains a separate owner-governed action. Keep every safeguard.

This change adds a focused mock-provider full-VOD regression test to `tests/twitch-catchup.test.ts`, complementing existing private-Shorts tests. It checks the actual `videos.insert` session payload, explicit Private state, absence of scheduling, and notification suppression without creating any upload or changing any OAuth grant. A future change that removes explicit privacy must fail CI.

## New Shorts thumbnails support (November 3)

Google now documents `thumbnails.set` support for custom **Shorts** thumbnails **after video processing**, and adds `thumbnails.shortsAspectRatio`. This is a potential creator-branding improvement but **not activated here**. Existing AMS thumbnail upload handles full VODs, not verified Short-specific processing, dimensions, or thumbnail readback.

Before any Shorts thumbnail implementation, check current method authorization scopes, API quota, eligible media constraints, processing-state readback and repeat/idempotency rules, privacy/ownership, safe image formats, and immutable owner approval boundaries. Reuse the established owner connection and media receipts; do not add permissions or write metadata automatically. Keep default-off until tested and explicitly authorized.

## API, costs, licensing and verification

- **API availability:** Both features are officially documented in the YouTube Data API. AMS integration was checked by source inspection, **not** by a live Google API transaction.
- **Cost/quota:** The API uses per-method quota; the [YouTube API quota guidance](https://developers.google.com/youtube/v3/determine_quota_cost) and [revision history](https://developers.google.com/youtube/data/revision_history) control estimates. No new quota-consuming action or paid product was started.
- **Policies:** Continue adhering to [YouTube API Services policies](https://developers.google.com/youtube/terms/developer-policies) and platform monetization/originality rules. New thumbnail availability does not grant content rights, publishing authorization, monetization or unlimited use.
- **Security and governance:** Never depend on an API project's audit status or provider defaults to keep creator content Private; never automatically publish Shorts or VODs as part of this change. No new credentials, OAuth consent, customer data or production settings.
- **Scope:** Source comment + one no-network regression test + this documentation. No functional uploader, OAuth, queue, payment, billing or production switch change.

## Evidence gates

Run `node --import tsx --test tests/twitch-catchup.test.ts tests/youtube-private-uploader.test.ts` and applicable repository CI/secret checks against the exact Draft PR head. Do not claim deployed protection or CI success from code review alone. Keep PR Draft until owner approval.
