import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import {
  getYouTubeOwnerConnectionStatus,
  SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
  YOUTUBE_FORCE_SSL_SCOPE,
} from "@/lib/server/youtube-owner-connection"
import YouTubeOwnerConnectButton from "./YouTubeOwnerConnectButton"

export const dynamic = "force-dynamic"

function safeConnectionError(value: unknown) {
  if (typeof value !== "string") return null
  return /^YOUTUBE_[A-Z0-9_]+$/u.test(value) ? value : null
}

export default async function YouTubeOwnerConnectPage() {
  const session = await getServerSession(authOptions).catch(() => null)
  const ownerEmail = process.env.AMS_OWNER_EMAIL?.trim().toLowerCase() ?? ""
  const signedInEmail = session?.user?.email?.trim().toLowerCase() ?? ""
  const ownerSignedIn = Boolean(ownerEmail && signedInEmail === ownerEmail)

  const status = ownerSignedIn
    ? await getYouTubeOwnerConnectionStatus()
    : { oauthConfigured: false, connected: false, connection: null }

  const connectionError = safeConnectionError(session?.youtubeConnectionError)
  const publicEditGranted = Boolean(
    status.connected &&
    status.connection?.scopes.includes(YOUTUBE_FORCE_SSL_SCOPE),
  )

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-4 py-12">
      <section className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">AMS Creator Operations</p>
          <h1 className="text-2xl font-semibold">Connect SmokyBanana03 YouTube</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            AMS uploads Twitch-generated Shorts privately first, verifies the correct channel and
            metadata, then can promote only the ranked best clips to Public when the separate
            auto-publish gate is enabled.
          </p>
        </div>

        <div className="mb-6 rounded-xl border p-4 text-sm leading-6">
          <div><span className="font-medium">Target channel:</span> SmokyBanana03</div>
          <div><span className="font-medium">Channel ID:</span> {SMOKYBANANA03_YOUTUBE_CHANNEL_ID}</div>
          <div><span className="font-medium">Upload safety:</span> Private-first verification</div>
          <div><span className="font-medium">Public automation:</span> {publicEditGranted ? "Edit permission granted; feature flag still controls posting" : "Reconnect required for edit permission"}</div>
          <div><span className="font-medium">Per-stream cap:</span> Maximum 3 ranked Shorts</div>
        </div>

        {!signedInEmail ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              First sign in with the AMS owner Google account. Then connect the SmokyBanana03 brand channel.
              The refresh token is encrypted server-side and is never shown in this page.
            </p>
            <YouTubeOwnerConnectButton mode="signin" />
          </div>
        ) : !ownerSignedIn ? (
          <div className="space-y-4">
            <p className="text-sm text-amber-600">
              This Google account is not the configured AMS owner account. No YouTube credential
              was stored.
            </p>
            <YouTubeOwnerConnectButton mode="signout" />
          </div>
        ) : status.connected && status.connection ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="font-medium">Connected and channel-verified</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {status.connection.channelTitle} · {status.connection.channelId}
              </div>
            </div>
            {publicEditGranted ? (
              <p className="text-sm text-muted-foreground">
                Private upload + verification is ready, and the owner grant includes the edit scope
                required for verified private-to-public promotion. Public posting still remains
                disabled unless the production auto-publish flag is explicitly enabled.
              </p>
            ) : (
              <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-sm text-amber-700">
                  The existing connection can upload privately, but it does not include the edit
                  permission required to make verified Shorts Public automatically.
                </p>
                <YouTubeOwnerConnectButton />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Owner sign-in is valid. Connect YouTube and select SmokyBanana03 • PS5 FPS in Google’s channel chooser.
            </p>
            {connectionError ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                Last connection result: <code>{connectionError}</code>
              </div>
            ) : null}
            <YouTubeOwnerConnectButton />
          </div>
        )}
      </section>
    </main>
  )
}
