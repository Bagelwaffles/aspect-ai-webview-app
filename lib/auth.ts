import { createHash } from "node:crypto"

import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

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
    async jwt({ token }) {
      const customerSubject = customerSubjectFromProviderSubject(token.sub)
      if (customerSubject) {
        token.customerSubject = customerSubject
      } else {
        delete token.customerSubject
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

      return session
    },
  },
}
