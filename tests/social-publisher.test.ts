import assert from "node:assert/strict"
import test from "node:test"

import {
  approveSocialPost,
  buildPublishPreview,
  getPlatformCredentialState,
  prepareSocialPost,
} from "../lib/server/social-publisher"

test("prepareSocialPost creates an approval-first draft", () => {
  const post = prepareSocialPost({
    campaign: "quick-marketing-audit",
    platform: "facebook",
    body: "Get a practical marketing audit for your business.",
    destinationUrl: "https://www.aspectmarketingsolutions.app/quick-marketing-audit",
  })

  assert.equal(post.status, "draft")
  assert.equal(post.campaign, "quick-marketing-audit")
  assert.ok(post.id)
  assert.ok(post.createdAt)
})

test("approval blocks a platform when credentials are missing", () => {
  const post = prepareSocialPost({
    campaign: "quick-marketing-audit",
    platform: "instagram",
    body: "See what is costing your business attention online.",
  })

  const approved = approveSocialPost(post, {
    facebook: false,
    instagram: false,
    linkedin: false,
    tiktok: false,
  })

  assert.equal(approved.status, "blocked_missing_credentials")
  assert.ok(approved.approvedAt)
})

test("approval marks a credentialed platform ready without publishing", () => {
  const post = prepareSocialPost({
    campaign: "quick-marketing-audit",
    platform: "linkedin",
    body: "A stronger offer starts with knowing where your marketing is leaking attention.",
  })

  const approved = approveSocialPost(post, {
    facebook: false,
    instagram: false,
    linkedin: true,
    tiktok: false,
  })

  const preview = buildPublishPreview(approved)
  assert.equal(preview.status, "ready")
  assert.equal(preview.platform, "linkedin")
})

test("credential detection never returns secret values", () => {
  const state = getPlatformCredentialState({
    META_PAGE_ACCESS_TOKEN: "secret-token",
    META_PAGE_ID: "123",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "456",
    LINKEDIN_ACCESS_TOKEN: "secret-linkedin",
    LINKEDIN_AUTHOR_URN: "urn:li:organization:123",
    TIKTOK_ACCESS_TOKEN: "secret-tiktok",
    TIKTOK_OPEN_ID: "abc",
  })

  assert.deepEqual(state, {
    facebook: true,
    instagram: true,
    linkedin: true,
    tiktok: true,
  })
})
