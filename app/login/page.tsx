import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"

import { safeRelativeCallbackPath } from "@/app/lib/safe-relative-callback"
import { CustomerLoginButton } from "@/components/customer-login-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authOptions, isCustomerAuthConfigured } from "@/lib/auth"

export const dynamic = "force-dynamic"

type LoginPageProps = {
  searchParams?: Promise<{ next?: string; callbackUrl?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {}
  const requestedCallback = params.next ?? params.callbackUrl
  const callbackUrl = safeRelativeCallbackPath(requestedCallback, "/grok-chat")
  const session = isCustomerAuthConfigured() ? await getServerSession(authOptions).catch(() => null) : null

  if (session?.user?.email) {
    redirect(callbackUrl)
  }

  const configured = isCustomerAuthConfigured()

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <Card className="w-full max-w-md border-border/70 bg-card/90 shadow-2xl">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Sign in to AMS</CardTitle>
          <CardDescription>
            Customer tools and paid AI routes require a verified account. AMS does not grant access from a checkout return URL alone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {configured ? (
            <CustomerLoginButton callbackUrl={callbackUrl} />
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              Customer sign-in is not configured yet. Google OAuth credentials and a NextAuth secret must be added to the staging environment before this page is enabled.
            </div>
          )}
          {params.error && (
            <p className="text-sm text-destructive">Sign-in failed. No access was granted.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Required staging variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, and NEXTAUTH_URL.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
