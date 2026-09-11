# Google Play Graphic Assets — AMS Android v2.0.0

Verified against Google Play Console Help on 2026-09-11. Recheck the official Play requirements immediately before final upload if the release is delayed.

## App icon — required

- 32-bit PNG with alpha
- Exactly 512 × 512 px
- Maximum 1024 KB
- Use the existing AMS launcher identity as the source: purple field with the white AMS `A`
- Do not add ranking, price, category, Google Play badges, or misleading promotional text

Planned filename: `ams-play-icon-512.png`

## Feature graphic — required

- JPEG or 24-bit PNG with no alpha
- Exactly 1024 × 500 px
- Keep important content centered because Play can crop the edges on some surfaces
- Use the same purple/dark AMS visual language without simply enlarging the app icon
- Avoid price claims, rankings, testimonials, awards, `New`, `Free`, `Sale`, or other promotional metadata
- Avoid device-frame imagery

Planned filename: `ams-play-feature-1024x500.png`

Suggested concept: a restrained AMS operating-layer graphic using the purple brand field, abstract connected-agent nodes, and a concise product identity such as `Aspect Marketing Solutions` / `AMS Mobile`. Keep text minimal.

Suggested alt text (under 140 characters):
`Aspect Marketing Solutions mobile companion represented by a purple connected agent network.`

## Phone screenshots — required

Google Play currently requires at least two screenshots across supported device types to publish. AMS will target four phone screenshots so the listing also satisfies Play's stronger app recommendation guidance.

Target per screenshot:

- Portrait 9:16
- 1080 × 1920 px
- JPEG or 24-bit PNG with no alpha
- Real captured app UI from the release candidate
- No device frame
- No fingers, people, fake UI, ranking claims, price promotions, or download/install calls to action
- Keep the first three focused on actual UI
- Remove unrelated notifications/service-provider details from the status bar where practical

Planned captures:

1. `01-platform-health.png` — top of AMS Mobile showing `ONLINE · PRODUCTION · persistence ready`
2. `02-live-agents.png` — Agent Network showing verified Live customer-facing agents
3. `03-audit-beta-boundary.png` — Marketing Audit Beta card and surrounding lifecycle context
4. `04-privacy-support.png` — consumption-only purchase policy plus Privacy & Support section

Suggested alt text:

1. `AMS Mobile showing production platform health and persistence ready status.`
2. `AMS Mobile Agent Network showing selected customer-facing agents marked Live.`
3. `AMS Mobile showing the Marketing Audit Agent Beta status within the verified agent network.`
4. `AMS Mobile showing consumption-only purchase policy, privacy policy access, and support contact.`

## Source-of-truth rule

Screenshots must be captured only after the exact Play release candidate is built. Do not reuse screenshots from the old WebView/Admin-PIN app, old Pipedream placeholders, or an earlier agent-status build.
