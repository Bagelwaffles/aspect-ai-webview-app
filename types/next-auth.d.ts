import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      /** Opaque server-derived identity; never sourced from request bodies. */
      customerSubject?: string
    }
    youtubeConnectionStatus?: "connected" | "error"
    youtubeConnectionError?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Opaque derivative of the signed provider subject. */
    customerSubject?: string
    youtubeConnectionStatus?: "connected" | "error"
    youtubeConnectionError?: string
  }
}

export {}
