import assert from "node:assert/strict"
import test from "node:test"

import {
  getLinkedInOrganizationCutoverStatus,
  linkedinOrganizationConnectionRequirements,
} from "../lib/server/linkedin-organization-cutover"

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values }
}

test("legacy personal LinkedIn author is quarantined", () => {
  const requirements = linkedinOrganizationConnectionRequirements()
  const status = getLinkedInOrganizationCutoverStatus(
    env({
      AMS_LINKEDIN_ACCESS_TOKEN: "token_1234567890123456789012345",
      AMS_LINKEDIN_AUTHOR_URN: "urn:li:person:legacy-person",
      AMS_LINKEDIN_API_VERSION: requirements.apiVersion,
      AMS_LINKEDIN_CONNECTION_GENERATION: requirements.generation,
    }),
  )

  assert.equal(status.configured, false)
  assert.equal(status.legacyCredentialPresent, true)
  assert.equal(status.organizationAuthorConfigured, false)
})

test("old LinkedIn token remains quarantined until the new generation marker is present", () => {
  const requirements = linkedinOrganizationConnectionRequirements()
  const status = getLinkedInOrganizationCutoverStatus(
    env({
      AMS_LINKEDIN_ACCESS_TOKEN: "token_1234567890123456789012345",
      AMS_LINKEDIN_AUTHOR_URN: "urn:li:organization:123456789",
      AMS_LINKEDIN_API_VERSION: requirements.apiVersion,
    }),
  )

  assert.equal(status.configured, false)
  assert.equal(status.legacyCredentialPresent, true)
  assert.equal(status.generationConfigured, false)
})

test("AMS LinkedIn organization connection is enabled only after full fresh cutover", () => {
  const requirements = linkedinOrganizationConnectionRequirements()
  const status = getLinkedInOrganizationCutoverStatus(
    env({
      AMS_LINKEDIN_ACCESS_TOKEN: "token_1234567890123456789012345",
      AMS_LINKEDIN_AUTHOR_URN: "urn:li:organization:123456789",
      AMS_LINKEDIN_API_VERSION: requirements.apiVersion,
      AMS_LINKEDIN_CONNECTION_GENERATION: requirements.generation,
    }),
  )

  assert.deepEqual(status, {
    configured: true,
    legacyCredentialPresent: false,
    organizationAuthorConfigured: true,
    generationConfigured: true,
    apiVersionConfigured: true,
  })
})

test("stale LinkedIn API version fails closed", () => {
  const requirements = linkedinOrganizationConnectionRequirements()
  const status = getLinkedInOrganizationCutoverStatus(
    env({
      AMS_LINKEDIN_ACCESS_TOKEN: "token_1234567890123456789012345",
      AMS_LINKEDIN_AUTHOR_URN: "urn:li:organization:123456789",
      AMS_LINKEDIN_API_VERSION: "202509",
      AMS_LINKEDIN_CONNECTION_GENERATION: requirements.generation,
    }),
  )

  assert.equal(status.configured, false)
  assert.equal(status.legacyCredentialPresent, true)
  assert.equal(status.apiVersionConfigured, false)
})
