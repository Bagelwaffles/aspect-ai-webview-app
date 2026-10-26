# SmokyBanana03 — Adaptive Twitch Clip Boundaries (controlled proposal)

## Problem verified from actual Shorts

The existing daily sampler generated roughly 15–30-second Twitch source clips. The video analyst could choose `bestStartSeconds` / `bestEndSeconds`, but could not recover a missing payoff or a teammate's reply once cut off. Repeated 31-second YouTube Shorts often put the exciting moment far too late, and some static captions did not accurately describe the final visible event.

## Proposed first-stage fix (this branch)

1. Reuse Twitch's existing authorized Create Clip From VOD path. Request up to **60 seconds of source context** when the VOD position allows, respecting its 5–60 second platform limit. This is **not** a fixed output length.
2. Supply real media to the existing video-analysis model. It chooses the tightest **complete** meaningful window (action + necessary lead-in + audible reaction/payoff), anywhere from 5 to 60 seconds, without filling an arbitrary runtime.
3. The analyst must supply two valid timestamps entirely within the source to mark a candidate `render`; otherwise it skips it. Invalid timestamps must not be clamped into a misleading claim or silently converted to the entire source.
4. Keep the existing maximum of three selected Shorts per stream and current authorization/publishing gates. No change to authentication, Redis isolation, webhook behavior, finance/billing, or external account permissions.
5. Existing historical clips are **not** replaced or republished by this change. This affects future processed source clips once deliberately merged/deployed.

## What this does not solve yet

- Blind/evenly spaced VOD sampling can **miss** a highlight occurring outside sampled windows. The next independently designed stage should inspect the full authorized VOD at bounded computational cost, prioritize creator markers/existing clips/audio/scene changes, and identify candidate event timestamps before choosing source windows. Do not claim full-VOD gameplay coverage until that stage is proven.
- Twitch's API does **not** produce individual clips longer than 60 seconds. A 60–180 second story would require approved access to the full original VOD, timestamped VOD trimming, separate copyright checks and platform-format validation. YouTube supports vertical Shorts up to 3 minutes, but that does not increase Twitch's clip-creation limit.
- A generative model may still choose suboptimal boundaries. Review actual output clips against source evidence before enabling any new automatic public publishing or backfill.
- Increasing source windows may increase video-analysis costs. Use bounded per-stream candidates and cap selection as already implemented; measure cost per accepted Short before broad rollout.

## Acceptance requirements (not yet proven by this branch)

- Unit tests cover source caps near the start/end of VODs, valid 10s and 48s highlight windows, and invalid/missing/out-of-source timestamps.
- Existing short-render worker honors distinct start and end values. Rendered file duration must correspond to chosen window, allowing normal encoder tolerance.
- Verify three real cases end-to-end in isolated preview using *existing* authorized footage:
  - Short COD action lasting about 8–15 seconds
  - A 20–35 second clutch
  - A 40–60 second squad conversation with complete reply and no cut-off.
- Confirm the resulting headline/captions describe only the selected footage and make sense on mobile.
- Preserve private/approval-first uploads, existing 3-per-stream cap, no account changes, and production isolation.
- Do not merge or deploy until owner-approved acceptance proof exists.

## Relevant references

- Twitch API: https://dev.twitch.tv/docs/api/reference#create-clip-from-vod
- YouTube Shorts duration: https://support.google.com/youtube/answer/15424877
