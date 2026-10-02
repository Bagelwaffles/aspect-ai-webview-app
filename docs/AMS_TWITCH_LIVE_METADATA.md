# SmokyBanana03 Twitch live metadata automation

## Goal

SmokyBanana03 should be able to start a Twitch stream from the PS5 without operating AMS. AMS may prepare and apply basic Twitch broadcast metadata automatically, but only to the verified SmokyBanana03 broadcaster connection.

## Scope

The automation may update:

- stream title;
- channel-defined tags;
- broadcaster language when explicitly supplied by a future trusted rule.

The first automated production version applies only:

- the first evidence-backed Twitch title option from Stream Intelligence;
- Stream Intelligence tag recommendations.

It does **not** automatically change:

- content-classification labels;
- branded-content flags;
- ads;
- moderation;
- chat;
- schedule;
- game/category when the evidence does not establish a safe category ID.

## Authorization

Twitch's Modify Channel Information endpoint requires the `channel:manage:broadcast` user scope.

AMS now exposes an owner-only OAuth entry point:

`/api/internal/twitch/start?capability=creator`

That creator authorization requests exactly:

- `user:read:broadcast`
- `channel:manage:clips`
- `channel:manage:broadcast`

The media scope is retained so reauthorization does not break the existing Clip & Shorts Factory.

## Hard account boundary

The write function refuses any stored Twitch connection unless:

- broadcaster ID is `155477801`;
- login is `smokybanana03`.

No broadcaster ID is accepted from a public request body.

## Loop prevention

Metadata auto-apply runs only from the `stream.online` EventSub path.

It does not auto-apply in response to `channel.update`. This prevents the metadata mutation from causing a channel-update EventSub feedback loop.

## Activation gate

The environment flag is:

`AMS_TWITCH_LIVE_METADATA_AUTO_APPLY=false`

Keep it false until:

1. owner session opens the creator OAuth URL;
2. Twitch authorization completes for the existing SmokyBanana03 account;
3. stored connection reports `channel:manage:broadcast`;
4. one controlled live-stream metadata update is tested;
5. title/tags appear on SmokyBanana03 and no unrelated channel is touched.

After proof, set the flag true.

## VOD limitation

Twitch's official API supports modifying channel/broadcast metadata, but it does not provide a general VOD metadata-update endpoint. Existing VOD title/description cleanup remains a separate Video Producer/browser-operation task.
