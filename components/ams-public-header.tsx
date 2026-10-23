import Link from "next/link"
import Image from "next/image"
import { AMS_BRAND_ASSETS } from "@/lib/ams-brand-assets"

export function AmsPublicHeader() {
  return (
    <header className="ams-public-header">
      <div className="ams-public-header__inner">
        <Link href="/" className="ams-public-brand" aria-label="Aspect Marketing Solutions home">
          <span className="ams-public-brand__mark"><Image src={AMS_BRAND_ASSETS.icon} alt="" width={42} height={42} unoptimized /></span>
          <span className="ams-public-brand__name">Aspect <strong>Marketing Solutions</strong></span>
        </Link>
        <nav className="ams-public-nav" aria-label="Primary navigation">
          <Link href="/agents">Agents</Link>
          <Link href="/creators">Creators</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/quick-marketing-audit">Marketing Audit</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <details className="ams-public-mobile-menu">
          <summary>Menu <span aria-hidden="true">☰</span></summary>
          <nav aria-label="Mobile navigation">
            <Link href="/agents">Agent Store</Link>
            <Link href="/creators">Creator OS</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/quick-marketing-audit">Marketing Audit</Link>
            <Link href="/contact">Contact</Link>
          </nav>
        </details>
        <Link href="/login?next=/dashboard" className="ams-public-signin">Sign in</Link>
      </div>
    </header>
  )
}
