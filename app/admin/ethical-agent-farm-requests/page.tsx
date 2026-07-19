import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type RequestItem = {
  id: string;
  name: string;
  email: string;
  businessName: string;
  websiteOrFacebook: string | null;
  selectedOffer: string;
  notes: string | null;
  consent: boolean;
  status: "new" | "reviewed" | "contacted" | "won" | "lost";
  emailNotificationStatus: string;
  createdAt: string;
  updatedAt: string;
};

type ResponsePayload = {
  items?: RequestItem[];
  summary?: Record<string, number>;
  error?: string;
};

const OFFER_LABELS: Record<string, string> = {
  "quick-marketing-audit": "Quick Marketing Audit",
  "social-content-pack": "Social Content Pack",
  "website-profile-review": "Website / Profile Review",
  "business-cleanup-plan": "Business Cleanup Plan",
  "monthly-marketing-support": "Monthly Marketing Support"
};

function getBackendUrl() {
  return (process.env.AMS_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "https://aspectapi-production.up.railway.app").replace(/\/$/, "");
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusTone(status: RequestItem["status"]) {
  switch (status) {
    case "won":
      return "default";
    case "lost":
      return "destructive";
    case "contacted":
      return "secondary";
    case "reviewed":
      return "outline";
    default:
      return "outline";
  }
}

export default async function EthicalAgentFarmRequestsAdminPage() {
  const cookieStore = await cookies();
  const adminAccess = cookieStore.get("ams_internal_admin_access")?.value;
  if (adminAccess !== "verified") {
    redirect("/admin/login?next=/admin/ethical-agent-farm-requests");
  }

  const fulfillmentSecret = process.env.AMS_STRIPE_FULFILLMENT_SECRET?.trim();
  if (!fulfillmentSecret) {
    return (
      <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Ethical Agent Farm Requests</CardTitle>
              <CardDescription>Admin visibility is not configured yet.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                The backend fulfillment secret is missing from the storefront runtime, so request listing is unavailable.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const response = await fetch(`${getBackendUrl()}/internal/ethical-agent-farm/requests?limit=100`, {
    method: "GET",
    headers: {
      "x-ams-fulfillment-secret": fulfillmentSecret
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => null)) as ResponsePayload | null;
  const items = Array.isArray(payload?.items) ? payload!.items : [];
  const summary = payload?.summary || {};

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ethical Agent Farm Requests</h1>
            <Badge variant="outline">Internal</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Request submissions from the one-time ethical agent farm offers. Review leads, update status, and follow up without exposing secrets or charging upfront.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="text-primary underline-offset-4 hover:underline" href="/ethical-agent-farm">
              Back to ethical agent farm
            </Link>
            <Link className="text-primary underline-offset-4 hover:underline" href="/admin/login?next=/admin/ethical-agent-farm-requests">
              Re-open admin access
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          {(["new", "reviewed", "contacted", "won", "lost"] as const).map((status) => (
            <Card key={status}>
              <CardHeader className="pb-2">
                <CardDescription className="capitalize">{status}</CardDescription>
                <CardTitle className="text-2xl">{summary[status] ?? 0}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lead queue</CardTitle>
            <CardDescription>Most recent requests first. Status updates are handled in the backend.</CardDescription>
          </CardHeader>
          <CardContent>
            {!response.ok ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                Could not load requests right now. The backend returned {response.status}.
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No requests have been captured yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <th className="py-3 pr-4 font-medium">Date</th>
                      <th className="py-3 pr-4 font-medium">Name</th>
                      <th className="py-3 pr-4 font-medium">Email</th>
                      <th className="py-3 pr-4 font-medium">Business</th>
                      <th className="py-3 pr-4 font-medium">Website / Facebook</th>
                      <th className="py-3 pr-4 font-medium">Offer</th>
                      <th className="py-3 pr-4 font-medium">Notes</th>
                      <th className="py-3 pr-4 font-medium">Consent</th>
                      <th className="py-3 pr-4 font-medium">Status</th>
                      <th className="py-3 pr-4 font-medium">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b align-top last:border-b-0">
                        <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{formatDate(item.createdAt)}</td>
                        <td className="py-3 pr-4 font-medium">{item.name}</td>
                        <td className="py-3 pr-4">{item.email}</td>
                        <td className="py-3 pr-4">{item.businessName}</td>
                        <td className="py-3 pr-4 max-w-[18rem] break-words text-muted-foreground">
                          {item.websiteOrFacebook || "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {OFFER_LABELS[item.selectedOffer] || item.selectedOffer}
                        </td>
                        <td className="py-3 pr-4 max-w-[24rem] break-words text-muted-foreground">
                          {item.notes || "—"}
                        </td>
                        <td className="py-3 pr-4">{item.consent ? "Yes" : "No"}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={statusTone(item.status)} className="capitalize">
                            {item.status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{item.emailNotificationStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
