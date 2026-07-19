import { PlaceholderPage } from "@/components/ams-placeholder-page"

export default function DeleteAccountPage() {
  return (
    <PlaceholderPage
      title="Delete account and data"
      description="Use this page to request deletion of your AMS account and associated data. We keep the instructions clear so users and reviewers know exactly how to request removal."
      status="Account request"
      bullets={[
        "Email kimberleyaversbiz@gmail.com with the subject line: Delete my AMS account.",
        "Include the email address used for the account and enough detail to identify the workspace or subscription.",
        "We review deletion requests and remove eligible account data as part of the request process.",
        "Billing records may be retained where needed for tax, legal, or fraud-prevention obligations.",
      ]}
      primaryActionLabel="Back to dashboard"
      primaryActionHref="/"
      secondaryActionLabel="Review privacy policy"
      secondaryActionHref="/privacy"
    />
  )
}
