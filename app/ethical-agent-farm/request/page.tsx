"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getEthicalOfferPage } from "@/lib/ethical-agent-farm-offers"

type SubmissionState = "idle" | "sending" | "sent" | "error"

export default function OfferRequestPage() {
  const searchParams = useSearchParams()
  const slug = searchParams.get("offer") || "quick-marketing-audit"
  const offer = useMemo(() => getEthicalOfferPage(slug) ?? getEthicalOfferPage("quick-marketing-audit")!, [slug])
  const [state, setState] = useState<SubmissionState>("idle")
  const [message, setMessage] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState("")

  async function onSubmit(formData: FormData) {
    setState("sending")
    setError("")

    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      businessName: String(formData.get("businessName") || "").trim(),
      websiteOrFacebook: String(formData.get("websiteOrFacebook") || "").trim(),
      selectedOffer: offer.slug,
      notesOrGoals: String(formData.get("notesOrGoals") || "").trim(),
      consent: agreed,
    }

    try {
      const response = await fetch("/api/ethical-agent-farm/offer-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || "Request failed")
      }

      setMessage(data?.message || "Request received. We’ll review your business and follow up.")
      setState("sent")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed")
      setState("error")
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Offer request</p>
          <h1 className="text-4xl font-bold tracking-tight">{offer.name}</h1>
          <p className="text-muted-foreground">
            Request review for this offer. No payment has been charged yet for one-time offers.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{offer.name}</CardTitle>
            <CardDescription>{offer.price}</CardDescription>
          </CardHeader>
          <CardContent>
            {state === "sent" ? (
              <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5" />
                  <div>
                    <div className="font-semibold">Request received</div>
                    <p className="text-sm">{message}</p>
                    <p className="mt-2 text-sm">No payment has been charged yet.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/ethical-agent-farm">Back to agent farm</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/billing">Review billing</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)
                  void onSubmit(formData)
                }}
              >
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required maxLength={120} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required maxLength={180} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="businessName">Business name</Label>
                  <Input id="businessName" name="businessName" required maxLength={140} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="websiteOrFacebook">Website or Facebook page</Label>
                  <Input id="websiteOrFacebook" name="websiteOrFacebook" placeholder="https://..." maxLength={240} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notesOrGoals">Notes / goals</Label>
                  <Textarea id="notesOrGoals" name="notesOrGoals" rows={5} maxLength={2000} />
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-4">
                  <input
                    id="consent"
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border accent-primary"
                  />
                  <Label htmlFor="consent" className="text-sm font-normal leading-5">
                    I understand this is an ethical marketing service request and no revenue results are guaranteed.
                  </Label>
                </div>
                <input type="hidden" name="selectedOffer" value={offer.slug} />
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={state === "sending" || !agreed}>
                    {state === "sending" ? "Sending..." : "Submit request"}
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={offer.slug === "monthly-marketing-support" ? "/billing" : `/ethical-agent-farm/offers/${offer.slug}`}>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Review offer
                    </Link>
                  </Button>
                </div>
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    No payment is charged on this page.
                  </p>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
