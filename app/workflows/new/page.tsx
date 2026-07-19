import { PlaceholderPage } from "@/components/ams-placeholder-page"

export default function NewWorkflowPage() {
  return (
    <PlaceholderPage
      title="Create New Workflow"
      description="Workflow creation is available as a safe landing page while the full builder continues to evolve."
      bullets={[
        "The main workflow list remains available and functional.",
        "This page keeps the route live instead of returning a 404.",
        "No destructive workflow actions are exposed here.",
      ]}
      secondaryActionLabel="Open workflows"
      secondaryActionHref="/workflows"
    />
  )
}
