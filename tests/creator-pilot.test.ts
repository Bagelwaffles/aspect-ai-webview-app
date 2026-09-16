import assert from "node:assert/strict"
import test from "node:test"

import {
  CREATOR_PILOT_RETENTION_DAYS,
  buildCreatorPilotApplication,
  creatorPilotIdFromEmail,
  normalizeCreatorPilotEmail,
} from "../lib/server/creator-pilot"

test("creator pilot email normalization is case-insensitive", () => {
  assert.equal(normalizeCreatorPilotEmail(" Creator@Example.COM "), "creator@example.com")
})

test("creator pilot id is stable for equivalent email spellings", () => {
  assert.equal(
    creatorPilotIdFromEmail("Creator@Example.com"),
    creatorPilotIdFromEmail(" creator@example.COM "),
  )
})

test("creator pilot record normalizes and bounds creator data", () => {
  const application = buildCreatorPilotApplication(
    {
      name: "  Alex   Streamer  ",
      email: " Alex@example.com ",
      creatorHandle: "  @AlexPlays  ",
      primaryPlatform: "twitch",
      platforms: ["youtube", "twitch", "youtube"],
      primaryGame: "  Once   Human  ",
      creatorCategories: ["Survival", "Co-op", "Survival"],
      goals: "Build repeat viewers and a reliable short-form content pipeline.",
      biggestBottleneck: "Finding the best moments after long streams takes too much time.",
      currentSetup: "  PS5   direct streaming  ",
      weeklyStreamHours: 500,
      source: "  creator page  ",
    },
    "2026-09-16T00:00:00.000Z",
    "application-test-id",
  )

  assert.equal(application.name, "Alex Streamer")
  assert.equal(application.email, "alex@example.com")
  assert.equal(application.creator_handle, "@AlexPlays")
  assert.equal(application.primary_platform, "twitch")
  assert.deepEqual(application.platforms, ["twitch", "youtube"])
  assert.equal(application.primary_game, "Once Human")
  assert.deepEqual(application.creator_categories, ["Survival", "Co-op"])
  assert.equal(application.current_setup, "PS5 direct streaming")
  assert.equal(application.weekly_stream_hours, 100)
  assert.equal(application.source, "creator page")
  assert.equal(application.consent_contact, true)
  assert.equal(application.status, "pilot_request")
  assert.equal(application.application_id, "application-test-id")
  assert.equal(application.created_at, "2026-09-16T00:00:00.000Z")
})

test("creator pilot always includes the primary platform", () => {
  const application = buildCreatorPilotApplication(
    {
      name: "Creator",
      email: "creator@example.com",
      creatorHandle: "creator",
      primaryPlatform: "youtube",
      platforms: ["tiktok"],
      creatorCategories: [],
      goals: "Build a consistent weekly publishing workflow.",
      biggestBottleneck: "I do not know which clips are worth editing and publishing.",
    },
    "2026-09-16T00:00:00.000Z",
    "application-test-id-2",
  )

  assert.deepEqual(application.platforms, ["youtube", "tiktok"])
})

test("creator pilot retention is explicitly bounded", () => {
  assert.equal(CREATOR_PILOT_RETENTION_DAYS, 180)
})
