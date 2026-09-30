import { createHash } from "node:crypto"

import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

import {
  YOUTUBE_UPLOAD_SCOPE,
  storeYouTubeOwnerConnectionFromGoogle,
} from "@/lib/server/youtube-owner-connection"

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim()
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()

const providers: NextAuthOptions["providers"] = []

const CUSTOMER_SUBJECT_PREFIX = "customer:google:"

if (googleClientId && googleClientSecret) {
  providers.push(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  )
}

export function isCustomerAuthConfigured(): boolean {
  return Boolean(googleClientId && googleClientSecret && process.env.NEXTAUTH_SECRET?.trim())
}

/**
 * Converts the provider-owned subject in the signed NextAuth JWT into an
 * opaque, stable AMS customer identifier. Email is deliberately excluded so
 * an address change cannot move authorization, rate-limit, or ownership data.
 */
export function customerSubjectFromProviderSubject(providerSubject: unknown): string | null {
  if (typeof providerSubject !== "string") return null

  const normalized = providerSubject.trim()
  if (!normalized) return null

  const digest = createHash("sha256")
    .update(`google\u0000${normalized}`)
    .digest("hex")

  return `${CUSTOMER_SUBJECT_PREFIX}${digest}`
}

export function isStableCustomerSubject(value: unknown): value is string {
  return (
    typeof value === "string" &&
    new RegExp(`^${CUSTOMER_SUBJECT_PREFIX}[a-f0-9]{64}$`).test(value)
  )
}

export const authOptions: NextAuthOptions = {
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      const customerSubject = customerSubjectFromProviderSubject(token.sub)
      if (customerSubject) {
        token.customerSubject = customerSubject
      } else {
        delete token.customerSubject
      }

      if (
        account?.provider === "google" &&
        typeof account.scope === "string" &&
        account.scope.split(/\s+/u).includes(YOUTUBE_UPLOAD_SCOPE)
      ) {
        const profileEmail =
          profile && typeof profile === "object" && "email" in profile && typeof profile.email === "string"
            ? profile.email
            : null
        const email =
          profileEmail ??
          (typeof token.email === "string" ? token.email : null)
        const refreshToken =
          typeof account.refresh_token === "string" ? account.refresh_token : null

        try {
          if (!email || !refreshToken) throw new Error("YOUTUBE_REFRESH_TOKEN_REQUIRED")
          await storeYouTubeOwnerConnectionFromGoogle({
            email,
            refreshToken,
            accessToken:
              typeof account.access_token === "string" ? account.access_token : null,
            scopes: account.scope,
          })
          token.youtubeConnectionStatus = "connected"
          delete token.youtubeConnectionError
        } catch (error) {
          token.youtubeConnectionStatus = "error"
          const code = error instanceof Error ? error.message : "YOUTUBE_CONNECTION_FAILED"
          token.youtubeConnectionError = /^YOUTUBE_[A-Z0-9_]+$/u.test(code)
            ? code
            : "YOUTUBE_CONNECTION_FAILED"
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email.trim().toLowerCase()
      }

      const customerSubject = customerSubjectFromProviderSubject(token.sub)
      if (session.user && customerSubject) {
        session.user.customerSubject = customerSubject
      }

      if (token.youtubeConnectionStatus === "connected" || token.youtubeConnectionStatus === "error") {
        session.youtubeConnectionStatus = token.youtubeConnectionStatus
      }
      if (typeof token.youtubeConnectionError === "string") {
        session.youtubeConnectionError = token.youtubeConnectionError
      }

      return session
    },
  },
}
