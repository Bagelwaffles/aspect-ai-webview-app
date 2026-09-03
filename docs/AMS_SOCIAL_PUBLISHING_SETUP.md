# AMS Social Publishing Setup

This document covers the Vercel-native social publishing adapters. Publishing remains approval-first: generated drafts are never sent to a provider unless the stored campaign has been explicitly approved.

## Required Runtime

The social campaign store uses the existing Redis-compatible server-side store:

- `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL`
- `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN`
- `AMS_INTERNAL_API_KEY`

The draft-generation agent uses the existing Vercel AI Gateway runtime:

- `AMS_SOCIAL_CAMPAIGN_MODEL`
- Vercel deployment OIDC or `AI_GATEWAY_API_KEY`

## LinkedIn

LinkedIn publishing uses the REST Posts API with these server-side variables:

- `AMS_LINKEDIN_ACCESS_TOKEN`
- `AMS_LINKEDIN_AUTHOR_URN`
- `AMS_LINKEDIN_API_VERSION`

`AMS_LINKEDIN_AUTHOR_URN` must be a verified `urn:li:person:*` or `urn:li:organization:*`. Organization posting must not be enabled until the authenticated LinkedIn account is verified as authorized for the Aspect Marketing Solutions Company Page.

## Facebook Page

Facebook Page publishing uses the Meta Graph API Page feed endpoint with:

- `AMS_META_ACCESS_TOKEN`
- `AMS_META_GRAPH_API_VERSION`
- `AMS_FACEBOOK_PAGE_ID`

The Meta app must stay in Development mode until platform requirements are satisfied and the owner explicitly approves any Live-mode transition or app-review request.

## Instagram

Instagram publishing is separate from Facebook Page publishing. The adapter requires an Instagram professional account ID and a public HTTPS media URL. It creates a media container first, then publishes that container.

Required variables:

- `AMS_META_ACCESS_TOKEN`
- `AMS_META_GRAPH_API_VERSION`
- `AMS_INSTAGRAM_USER_ID`

Text-only Instagram publishing is not supported by this adapter. Missing or non-public media fails closed.

## Pinterest

Pinterest publishing uses the v5 Pin creation endpoint and requires:

- `AMS_PINTEREST_ACCESS_TOKEN`
- `AMS_PINTEREST_BOARD_ID`

Pins require a public HTTPS media URL. Missing board, token, or media returns a closed `not_configured` or failed result.

## YouTube Shorts

YouTube Shorts publishing remains blocked until the existing Google Cloud OAuth client and target AMS YouTube channel are verified and a real server-side video upload path is implemented.

Expected future variables:

- `AMS_YOUTUBE_CLIENT_ID`
- `AMS_YOUTUBE_CLIENT_SECRET`
- `AMS_YOUTUBE_REFRESH_TOKEN`
- `AMS_YOUTUBE_CHANNEL_ID`

The current adapter intentionally does not call the YouTube API for uploads. Controlled verification must default to private or unlisted visibility and requires separate action-time owner approval.

## Safety Rules

- Do not use `NEXT_PUBLIC_*` for provider credentials.
- Do not log provider request bodies, OAuth responses, tokens, or raw provider errors.
- Do not publish unapproved campaigns.
- Do not retry already-published channel deliveries as a duplicate provider call.
- Do not claim a post was published without an authoritative provider ID or success response.
- Keep provider errors sanitized as stable `*_HTTP_*`, `*_TIMEOUT`, `*_NOT_CONFIGURED`, or media-required codes.

