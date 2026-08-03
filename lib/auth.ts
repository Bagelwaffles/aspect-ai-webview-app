import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim()
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()

const providers: NextAuthOptions["providers"] = []

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
    async session({ session, token }) {
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email.toLowerCase()
      }
      return session
    },
  },
}
