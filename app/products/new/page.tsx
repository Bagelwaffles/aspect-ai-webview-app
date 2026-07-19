import { PlaceholderPage } from "@/components/ams-placeholder-page"

export default function NewProductPage() {
  return (
    <PlaceholderPage
      title="Create New Product"
      description="Product creation is routed safely to the catalog workflow. The page exists so the button never dead-ends."
      bullets={[
        "The launch flow continues in the product catalog.",
        "This route is intentionally honest about being in progress.",
        "No fake product creation is exposed here.",
      ]}
      secondaryActionLabel="Open products"
      secondaryActionHref="/products"
    />
  )
}
