import type { StreamIntelligencePackage } from "@/lib/server/stream-intelligence"
import {
  modifySmokyTwitchChannelInformation,
  twitchBroadcastScopeEnabled,
  getTwitchPilotStatus,
} from "@/lib/server/twitch-pilot"

type Options = {
  env?: NodeJS.ProcessEnv
}

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

export function getSmokyTwitchLiveMetadataConfiguration(
  env: NodeJS.ProcessEnv = process.env,
) {
  return {
    enabled:
      clean(env.AMS_TWITCH_LIVE_METADATA_AUTO_APPLY)?.toLowerCase() === "true",
  }
}

export async function autoApplySmokyLiveMetadata(
  intelligence: StreamIntelligencePackage,
  options: Options = {},
) {
  const env = options.env ?? process.env
  const config = getSmokyTwitchLiveMetadataConfiguration(env)
  if (!config.enabled) {
    return {
      status: "disabled" as const,
      errorCode: "TWITCH_LIVE_METADATA_AUTO_APPLY_DISABLED",
    }
  }
  if (intelligence.phase !== "live") {
    return {
      status: "skipped" as const,
      errorCode: "TWITCH_LIVE_METADATA_NOT_LIVE",
    }
  }
  if (intelligence.broadcasterLogin.toLowerCase() !== "smokybanana03") {
    return {
      status: "blocked" as const,
      errorCode: "TWITCH_SMOKY_ACCOUNT_MISMATCH",
    }
  }

  const status = await getTwitchPilotStatus({ env })
  const scopes = status.connection?.scopes ?? []
  if (!status.connected || !twitchBroadcastScopeEnabled(scopes)) {
    return {
      status: "not_configured" as const,
      errorCode: "TWITCH_BROADCAST_SCOPE_REQUIRED",
    }
  }

  try {
    const updated = await modifySmokyTwitchChannelInformation({
      title: intelligence.draft.twitch.titleOptions[0],
      tags: intelligence.draft.twitch.tagRecommendations,
    }, { env })
    return {
      status: "updated" as const,
      errorCode: null,
      updated,
    }
  } catch (error) {
    return {
      status: "failed" as const,
      errorCode: error instanceof Error ? error.message.slice(0, 200) : "TWITCH_LIVE_METADATA_UPDATE_FAILED",
    }
  }
}
