# SmokyBanana03: post-upload YouTube metadata verification recovery

## Observed incident (October 21, 2026)

GitHub Actions [#39594598408](https://github.com/Bagelwaffles/aspect-ai-webview-app/actions/runs/39594598408)
uploaded the already-selected Short `mC9Hnck0FB8` Private and received
`YOUTUBE_UPLOAD_METADATA_TAGS_MISMATCH` (HTTP 202) during immediate readback.
This is **successful Private upload with pending metadata proof**, not evidence
of a failed upload or permission to change visibility.

At 17:11 UTC, [#39641539384](https://github.com/Bagelwaffles/aspect-ai-webview-app/actions/runs/39641539384)
verified metadata on the same video and promoted it Public through the existing
guarded path. At 20:37 UTC,
[#39671929961](https://github.com/Bagelwaffles/aspect-ai-webview-app/actions/runs/39671929961)
found no further upload/render job; its stream-cap skip was normal.

## Narrow patch (Draft only)

The existing worker uploads a new rendered Short and calls metadata
verification once. On HTTP 202 it ended the upload step, so follow-up could
be delayed until a later scheduled worker. This change:

1. Adds an authenticated worker-only **verify** endpoint. It requires a
   previously successful upload for the exact expected SmokyBanana03 YouTube
   channel; it reads YouTube metadata and persists a verification proof in
   Redis only when all existing checks pass. It never uploads/reuploads,
   updates YouTube metadata, changes privacy or selects videos.
2. Following the *specific* tag-only 202 response, retries readback of the
   exact existing video after 10, 20 and 30 seconds (60 seconds total sleep),
   stopping on a verified 200, preserving pending 202 for later reconciliation,
   and failing closed on a mismatched response or video ID.
3. On verified proof, invokes the **unchanged** `/youtube/public/auto` handler
   once within the same run. That handler still requires the owner-enabled flag,
   channel binding, existing auto-selection, Private proof, idempotency,
   reconciliation and the hard maximum of 3 Public Shorts per source stream.
   Manual/Private-only content is not made eligible.
4. Preserves the original scheduled reconciliation as a fallback if short
   readback retries do not converge.

## Safety and acceptance

- No production writes, credential rotation, billing, scheduling, customer data,
  existing videos, or OAuth changes from this Draft PR.
- Do not deploy until type checking, test suite, secret scan, review and preview
  are green; prove a real unattended Private -> verified -> Public case in a
  separate approved production acceptance run.
- Regression checks cover transient YouTube tag-readback recovery on the same
  video with **zero upload API calls**, route worker authorization, video/channel
  identity checks, bounded retries and strict Public-gate sequencing.
- HTTP 202 remains **pending**, not "published". A successful GitHub Actions
  result without verified Public promotion is not publication proof.
- Valid stream-cap skips, empty jobs, rejected low-quality clips and deliberately
  Private content are not incidents.
- Rollback: revert this Draft's route and workflow changes. The prior scheduled
  private-proof and Public-promotion reconciliation remains intact.

Related historical repairs: [PR #244](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/244)
and [PR #246](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/246).
This patch neither changes their tag matching policy nor bypasses it.
