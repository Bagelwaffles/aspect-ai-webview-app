import Link from "next/link"
import Image from "next/image"
import { AMS_BRAND_ASSETS } from "@/lib/ams-brand-assets"

export function AmsPublicFooter() {
  return (
    <footer className="ams-public-footer">
      <div className="ams-public-footer__inner">
        <div className="ams-public-footer__brand">
          <Link href="/" className="ams-public-brand" aria-label="Aspect Marketing Solutions home">
            <span className="ams-public-brand__mark"><Image src={AMS_BRAND_ASSETS.icon} alt="" width={42} height={42} unoptimized /></span>
            <span className="ams-public-brand__name">Aspect <strong>Marketing Solutions</strong></span>
          </Link>
          <p>Always on. Always working. Built to grow your brand.</p>
        </div>
        <nav className="ams-public-footer__nav" aria-label="Footer navigation">
          <Link href="/agents">Agents</Link>
          <Link href="/creators">Creators</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/quick-marketing-audit">$49 Audit</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <p>© 2026 Aspect Marketing Solutions</p>
      </div>
    </footer>
  )
}
