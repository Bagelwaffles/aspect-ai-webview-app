# Creator Autopilot — YouTube 2027 monetization policy notice

Reviewed: **2026-10-25**. Scope: a **read-only** notice on the existing public `/creators` page. No creator credentials, OAuth permissions, publishing, monetization settings, billing, or customer records are changed.

## Primary evidence and exact dates

- **2026-08-10:** YouTube announced updated YouTube Partner Program (YPP) terms, new Shorts revenue-sharing requirements and revised entry thresholds. Official announcement: https://support.google.com/youtube/blog/451804019/updates-to-the-youtube-partner-program-new-earning-opportunities-changes-to-eligibility and https://blog.youtube/news-and-events/youtube-partner-program-updates-2027-new-opportunities-earn/
- **2026-10-15:** TeamYouTube updated the same official community announcement with an **invitation-only Shorts bonus pilot** in the US, UK, Germany, Brazil, Japan, and South Korea. Specific amounts, goals, and eligibility are communicated to invited channels; availability is not guaranteed.
- **2027-01-31:** Deadline for YPP creators to accept the updated applicable Watch Page, Shorts and Commerce monetization modules in YouTube Studio. Failure to accept stops earnings from the associated features from February 1, not necessarily YPP membership.
- **2027-02-01:** To earn Shorts Creator Pool ad/Premium revenue, existing YPP channels must maintain **10 million qualified Shorts views in the preceding 90 days**. New applicants seeking ads/Premium revenue sharing need **20 million qualified Shorts views in 90 days** or **8,000 qualified watch hours in 365 days**. Existing partners are not removed from YPP solely because of the new entry thresholds. Fan funding has separate eligibility.

## AMS implications and controls

1. Creator Autopilot should sell **verified stream-to-content workflow outcomes**, not guaranteed reach, monetization, Shorts bonuses, or automatic YPP eligibility. These changes make Shorts-only revenue assumptions less dependable.
2. The new pilot is **not an open API or general entitlement**. No supported API for bonus enrollment or acceptance of new YPP terms was verified. Only the channel owner should review invitations and accept applicable terms through YouTube Studio.
3. For SmokyBanana03, the owner's YPP membership, acceptance state, and bonus invitation have **not** been inspected. Do not claim this channel is eligible, invited, or earning.
4. Continue the existing original-content, authorization, private-first publishing, provenance, idempotency and owner-approval gates. Do not change Shorts publishing frequency to chase a bonus whose conditions are unknown.
5. Future commercial packaging should distinguish creator-service subscription revenue from any third-party YouTube payouts; review actual costs and terms before a paid Creator SKU.

## Deduplication / release

- Reuses existing Creator OS page and tracking issue [#266](https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/266); does not rebuild creator agents or alter the draft Creator positioning [PR #268](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/268).
- Independent of existing Twitch verification [PR #286](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/286), dependency security [PR #294](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/294), and transactional email [PR #300](https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/300).
- Scoped check: `node --import tsx --test tests/creator-ypp-policy.test.ts`. Run repository CI and security gates on the exact PR head; **do not merge or deploy** without normal owner approval and successful checks.
- Policy content is dated and should be reverified before production release or if YouTube updates its terms.
