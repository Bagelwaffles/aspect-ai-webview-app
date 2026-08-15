import Link from "next/link"
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Account deletion
            </Badge>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Delete account and associated data</h1>
            <p className="max-w-prose text-sm text-muted-foreground sm:text-base">
              Aspect Marketing Solutions provides this page so users can request deletion of an AMS web account and eligible personal data associated with it. The current AMS Android companion app does not create a separate Android account.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to AMS
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              How to request deletion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm text-muted-foreground sm:text-base">
            <ol className="list-decimal space-y-3 pl-5 leading-relaxed">
              <li>
                Email <a className="text-primary underline underline-offset-4" href="mailto:kimberleyaversbiz@gmail.com?subject=Delete%20my%20AMS%20account">kimberleyaversbiz@gmail.com</a> with the subject line <strong className="text-foreground">Delete my AMS account</strong>.
              </li>
              <li>Include the email address used for your AMS account and, if applicable, the workspace, subscription, or service that helps us identify the correct account.</li>
              <li>AMS may verify the request before deletion to protect users from unauthorized account-removal requests.</li>
              <li>After verification, AMS will delete or de-identify eligible account and personal data associated with the request.</li>
            </ol>

            <div className="rounded-lg border bg-muted/20 p-4">
              <h2 className="mb-2 font-semibold text-foreground">Data that may be deleted</h2>
              <p className="leading-relaxed">
                Eligible data may include account profile information, authentication identifiers, submitted business or service information, beta-testing information, support or service-request information, and other personal data that is no longer required to provide or secure AMS services.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <h2 className="mb-2 font-semibold text-foreground">Data that may be retained</h2>
              <p className="leading-relaxed">
                Some records may be retained when reasonably necessary for legal, tax, accounting, dispute-resolution, security, fraud-prevention, or other lawful obligations. Where appropriate, retained records are limited to what is required for those purposes.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <h2 className="mb-2 font-semibold text-foreground">Requests to delete data without deleting an account</h2>
              <p className="leading-relaxed">
                You may also use the same email address to request deletion of eligible personal information without requesting deletion of your entire AMS web account. Tell us what information you want removed so we can review the request.
              </p>
            </div>

            <p className="leading-relaxed">
              For additional details about AMS data handling and retention, review our <Link className="text-primary underline underline-offset-4" href="/privacy">Privacy Policy</Link>.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-full sm:w-auto">
                <a href="mailto:kimberleyaversbiz@gmail.com?subject=Delete%20my%20AMS%20account">Request account deletion</a>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/privacy">Review privacy policy</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
