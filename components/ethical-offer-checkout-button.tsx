import Link from "next/link"

import { Button } from "@/components/ui/button"

type EthicalOfferCheckoutButtonProps = {
  label?: string
  fallbackHref: string
  variant?: "default" | "outline"
}

export function EthicalOfferCheckoutButton({
  label = "Request this service",
  fallbackHref,
  variant = "default",
}: EthicalOfferCheckoutButtonProps) {
  return (
    <Button asChild variant={variant}>
      <Link href={fallbackHref}>{label}</Link>
    </Button>
  )
}
