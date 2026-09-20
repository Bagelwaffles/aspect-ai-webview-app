import Link from "next/link"

export function AmsPublicHeader() {
  return (
    <header className="ams-public-header">
      <div className="ams-public-header__inner">
        <Link href="/" className="ams-public-brand" aria-label="Aspect Marketing Solutions home">
          <span className="ams-public-brand__mark">A</span>
          <span className="ams-public-brand__name">Aspect <strong>Marketing Solutions</strong></span>
        </Link>
        <nav className="ams-public-nav" aria-label="Primary navigation">
          <Link href="/agents">Agents</Link>
          <Link href="/creators">Creators</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/quick-marketing-audit">Marketing Audit</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <Link href="/login?next=/dashboard" className="ams-public-signin">Sign in</Link>
      </div>
    </header>
  )
}
