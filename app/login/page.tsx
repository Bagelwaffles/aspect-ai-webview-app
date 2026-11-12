import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { ShieldCheck } from "lucide-react"

import { safeRelativeCallbackPath } from "@/app/lib/safe-relative-callback"
import { CustomerLoginButton } from "@/components/customer-login-button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { authOptions, isCustomerAuthConfigured } from "@/lib/auth"
import { authOriginState } from "@/lib/auth-origin"

export const dynamic = "force-dynamic"

type LoginPageProps = {
  searchParams?: Promise<{ next?: string; callbackUrl?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {}
  const requestedCallback = params.next ?? params.callbackUrl
  const callbackUrl = safeRelativeCallbackPath(requestedCallback, "/grok-chat")
  const requestHeaders = await headers()
  const requestUrl = new URL(
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() === "http" ? "http://placeholder.invalid" : "https://placeholder.invalid",
  )
  const forwardedHost =
    requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    requestHeaders.get("host")?.split(",")[0]?.trim()
  if (forwardedHost) requestUrl.host = forwardedHost
  const authOrigin = authOriginState(requestUrl.href, requestHeaders)
  const session = isCustomerAuthConfigured() && authOrigin.matches
    ? await getServerSession(authOptions).catch(() => null)
    : null

  if (session?.user?.email) {
    redirect(callbackUrl)
  }

  const configured = isCustomerAuthConfigured()
  const originMismatch = Boolean(authOrigin.configuredOrigin && !authOrigin.matches)

  return (
    <div className="ams-public-page">
      <AmsPublicHeader />
      <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <Card className="w-full max-w-md border-border/70 bg-card/90 shadow-2xl">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to AMS</h1>
          <CardDescription>
            Customer tools and paid AI routes require a verified account. AMS does not grant access from a checkout return URL alone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {configured && !originMismatch ? (
            <CustomerLoginButton callbackUrl={callbackUrl} />
          ) : originMismatch ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="font-semibold">Google sign-in is disabled on this preview deployment.</p>
              <p className="mt-2 text-amber-100/80">
                Please use the main AMS website to sign in securely. Your account and access remain unchanged.
              </p>
              {authOrigin.configuredOrigin ? (
                <a
                  className="mt-3 inline-block font-semibold underline"
                  href={`${authOrigin.configuredOrigin}/login?next=${encodeURIComponent(callbackUrl)}`}
                >
                  Continue on the production sign-in page
                </a>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              Sign-in is temporarily unavailable. Please try again later.
            </div>
          )}
          {params.error && (
            <p className="text-sm text-destructive">Sign-in failed. No access was granted.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Sign in with your Google account to access your AMS tools.
          </p>
        </CardContent>
      </Card>
    </main>
      <AmsPublicFooter />
    </div>
  )
}
