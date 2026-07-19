import { PlaceholderPage } from "@/components/ams-placeholder-page"

export default function RequestAccessPage() {
  return (
    <PlaceholderPage
      title="Request Access"
      description="Use this page to get routed to the right access path without exposing admin controls publicly. Reviewer access stays separate from internal admin access."
      bullets={[
        "Reviewer access is for safe demo and review flows only.",
        "Internal admin access is protected and separate.",
        "No lead data is exposed from this page.",
      ]}
      primaryActionLabel="Open reviewer access"
      primaryActionHref="/reviewer-access"
      secondaryActionLabel="Open admin login"
      secondaryActionHref="/admin/login"
    />
  )
}
