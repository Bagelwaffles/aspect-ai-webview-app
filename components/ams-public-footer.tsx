import Link from "next/link"

export function AmsPublicFooter() {
  return (
    <footer className="ams-public-footer">
      <div className="ams-public-footer__inner">
        <div className="ams-public-footer__brand">
          <Link href="/" className="ams-public-brand" aria-label="Aspect Marketing Solutions home">
            <span className="ams-public-brand__mark">A</span>
            <span className="ams-public-brand__name">Aspect <strong>Marketing Solutions</strong></span>
          </Link>
          <p>Practical AI agents for small-business marketing and growth.</p>
        </div>
        <div className="ams-public-footer__groups">
          <nav className="ams-public-footer__nav" aria-label="Product navigation">
            <strong>Product</strong>
            <Link href="/agents">Agent Store</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/quick-marketing-audit">$49 Audit</Link>
          </nav>
          <nav className="ams-public-footer__nav" aria-label="Company navigation">
            <strong>Company</strong>
            <Link href="/creators">Creators</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/login?next=/dashboard">Sign in</Link>
          </nav>
          <nav className="ams-public-footer__nav" aria-label="Legal navigation">
            <strong>Legal</strong>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/refund">Refunds</Link>
          </nav>
        </div>
        <div className="ams-public-footer__bottom">
          <p>© 2026 Aspect Marketing Solutions</p>
          <span>AI agents. Real business growth.</span>
        </div>
      </div>
    </footer>
  )
}
