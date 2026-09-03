const LINKEDIN_ORGANIZATION_CONNECTION_GENERATION = "ams-linkedin-org-2026-09"
const LINKEDIN_API_VERSION = "202608"

function normalized(value: string | undefined) {
  return value?.trim() ?? ""
}

function isPlaceholder(value: string) {
  return /(?:^|[:_-])(?:replace|placeholder|changeme|your)(?:$|[:_-])/iu.test(value)
}

function hasBearerToken(value: string) {
  return value.length >= 20 && !isPlaceholder(value)
}

export type LinkedInOrganizationCutoverStatus = {
  configured: boolean
  legacyCredentialPresent: boolean
  organizationAuthorConfigured: boolean
  generationConfigured: boolean
  apiVersionConfigured: boolean
}

export function getLinkedInOrganizationCutoverStatus(
  env: NodeJS.ProcessEnv = process.env,
): LinkedInOrganizationCutoverStatus {
  const token = normalized(env.AMS_LINKEDIN_ACCESS_TOKEN)
  const author = normalized(env.AMS_LINKEDIN_AUTHOR_URN)
  const version = normalized(env.AMS_LINKEDIN_API_VERSION)
  const generation = normalized(env.AMS_LINKEDIN_CONNECTION_GENERATION)

  const tokenConfigured = hasBearerToken(token)
  const organizationAuthorConfigured =
    /^urn:li:organization:[A-Za-z0-9_-]+$/u.test(author) && !isPlaceholder(author)
  const generationConfigured = generation === LINKEDIN_ORGANIZATION_CONNECTION_GENERATION
  const apiVersionConfigured = version === LINKEDIN_API_VERSION
  const configured =
    tokenConfigured &&
    organizationAuthorConfigured &&
    generationConfigured &&
    apiVersionConfigured

  return {
    configured,
    legacyCredentialPresent: tokenConfigured && !configured,
    organizationAuthorConfigured,
    generationConfigured,
    apiVersionConfigured,
  }
}

export function linkedinOrganizationConnectionRequirements() {
  return {
    generation: LINKEDIN_ORGANIZATION_CONNECTION_GENERATION,
    apiVersion: LINKEDIN_API_VERSION,
  } as const
}
