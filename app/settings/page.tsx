import { PlaceholderPage } from "@/components/ams-placeholder-page"

export default function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Account, organization, and integration settings live here. The page is available now, and the deeper controls are still being finished safely."
      bullets={[
        "Manage account preferences and organization details from one place.",
        "Integration and security controls are being expanded next.",
        "Billing, Stripe, and reviewer access remain separate and working.",
      ]}
      secondaryActionLabel="View billing"
      secondaryActionHref="/billing"
    />
  )
}
