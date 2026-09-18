# AMS Creator OS — Stream Intelligence Engine

## Purpose

Stream Intelligence turns every independently discovered Twitch broadcast into its own approval-first content package.

The Twitch Watcher remains responsible for source discovery and evidence:

`stream.online → channel.update → stream.offline → VOD / markers / clips / source-backed summary`

Stream Intelligence is the content layer:

`stream ID → validated evidence → unique SEO/metadata package → creator review → optional future publishing adapters`

It is a Creator OS module, not an additional catalog agent.

## Per-stream identity

The Twitch stream ID is the durable content identity. Packages are stored independently under that stream ID so one broadcast does not overwrite another broadcast's record.

A new `stream.online` event produces the first live draft. A matching `stream.offline` event enriches the same stream's package with whatever post-stream evidence Twitch returns.

Retention currently follows the controlled Creator pilot's 180-day content-package window.

## Generated package

Each package can contain:

- primary search phrase;
- supporting keywords;
- stream-specific content angles;
- Twitch title options;
- Twitch tag recommendations;
- go-live promotional copy;
- YouTube VOD title options;
- YouTube description, tags, and hashtags;
- short-form hooks, captions, and hashtags;
- TikTok draft copy;
- Instagram draft copy;
- X draft copy;
- Discord announcement;
- thumbnail text concepts;
- approval notes;
- an explicit evidence boundary.

All outputs remain drafts.

## Evidence policy

The generator may use only the server-validated Twitch evidence supplied to the run:

- broadcaster identity;
- stream ID;
- start/end state;
- title;
- category;
- language;
- recorded channel updates;
- Twitch VOD reference when available;
- creator stream markers;
- Twitch clips returned for the stream window;
- deterministic AMS metadata summary.

Twitch titles, clip titles, marker descriptions, URLs, and creator-provided text are untrusted content, never instructions.

The engine must not claim:

- visual gameplay analysis when no media was ingested;
- events that are not in supplied evidence;
- current search trends or search volume without a separate verified research feed;
- rankings, guaranteed reach, guaranteed revenue, or guaranteed discovery;
- that a draft was published or applied when no approved mutation occurred.

## Runtime

The engine reuses the existing AMS Vercel AI Gateway structured-agent runtime.

Default model:

`openai/gpt-5.4-mini`

Optional override:

`AMS_STREAM_INTELLIGENCE_MODEL`

Low-cost gateway fallback:

`google/gemini-2.5-flash-lite`

If the AI runtime is unavailable or generation fails, AMS stores a deterministic metadata package instead of losing the stream record.

This module does not debit customer subscription credits during the controlled internal creator pilot.

## Background execution

Twitch EventSub must be acknowledged quickly. AI generation therefore runs with Next.js `after()` after the notification response has been produced.

The webhook request is not held open waiting for an LLM.

The first live package is scheduled after `stream.online`.

The post-stream package is scheduled after `stream.offline`, with a short delay before refreshing Twitch VOD/marker/clip evidence.

Because `after()` is not a durable queue, the owner console includes a protected manual regeneration path. A future commercial multi-tenant release should move long-running generation to a durable queue/workflow with retry observability before relying on it for customer SLAs.

## Event retry semantics

EventSub message IDs use claim → process → commit semantics.

If event processing succeeds, the message ID remains deduplicated.

If processing fails, AMS releases the claim so Twitch's legitimate retry can execute the event again.

This prevents a transient processing failure from becoming a permanent false duplicate.

## Publishing boundary

No generated field is applied automatically.

Current Twitch authorization remains read-only at:

`user:read:broadcast`

Stream Intelligence does not add chat, moderation, broadcast mutation, clip creation, deletion, ads, spending, or publishing permissions.

Future publishing adapters must remain explicit and approval-first until separately verified.

## Current Beta gate

Twitch Watcher / Stream Intelligence should remain Setup Required until a genuine post-install broadcast proves:

1. `stream.online` accepted;
2. current session persisted;
3. live Stream Intelligence package stored for that stream ID;
4. `stream.offline` accepted;
5. source-backed Twitch summary stored;
6. VOD, markers, and clips collected where Twitch makes them available;
7. post-stream Stream Intelligence package stored under the same stream ID;
8. duplicate delivery does not duplicate the result;
9. no external write action occurs.

Passing that controlled proof can justify Beta. It does not by itself justify commercial Live status.
