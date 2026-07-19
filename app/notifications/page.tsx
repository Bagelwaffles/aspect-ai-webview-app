import { PlaceholderPage } from "@/components/ams-placeholder-page"

export default function NotificationsPage() {
  return (
    <PlaceholderPage
      title="Notifications"
      description="System alerts and inbox-style notifications will appear here. For now, the page is live and keeps the flow from breaking."
      bullets={[
        "No unread alerts are being shown yet.",
        "Notification delivery and preferences are still staged.",
        "Use the dashboard to continue working while this area is built out.",
      ]}
      secondaryActionLabel="Go to pricing"
      secondaryActionHref="/pricing"
    />
  )
}
