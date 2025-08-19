import Link from "next/link"

export default function Footer() {
  return (
    <footer className="bg-gray-800 text-white py-8 px-8">
      <div className="flex flex-wrap justify-between mb-6">
        <div className="flex-1 min-w-[200px] mb-6">
          <h4 className="text-xl mb-4 text-gray-100">Company</h4>
          <ul className="space-y-2">
            <li>
              <Link href="/about" className="text-gray-100 hover:text-blue-400 transition-colors">
                About Us
              </Link>
            </li>
            <li>
              <Link href="/services" className="text-gray-100 hover:text-blue-400 transition-colors">
                Services
              </Link>
            </li>
            <li>
              <Link href="/agents" className="text-gray-100 hover:text-blue-400 transition-colors">
                Agents
              </Link>
            </li>
            <li>
              <Link href="/contact" className="text-gray-100 hover:text-blue-400 transition-colors">
                Contact
              </Link>
            </li>
          </ul>
        </div>
        <div className="flex-1 min-w-[200px] mb-6">
          <h4 className="text-xl mb-4 text-gray-100">Contact</h4>
          <ul className="space-y-2 text-gray-100">
            <li>6515 Greensburg Rd, Edmonton, KY 42129</li>
            <li>
              <a href="tel:+12703921461" className="hover:text-blue-400 transition-colors">
                270-392-1461
              </a>
            </li>
            <li>
              <a href="mailto:info@aspectmarketingsolutions.com" className="hover:text-blue-400 transition-colors">
                info@aspectmarketingsolutions.com
              </a>
            </li>
          </ul>
        </div>
        <div className="flex-1 min-w-[200px] mb-6">
          <h4 className="text-xl mb-4 text-gray-100">Follow Us</h4>
          <ul className="space-y-2">
            <li>
              <a href="#" className="text-gray-100 hover:text-blue-400 transition-colors">
                LinkedIn
              </a>
            </li>
            <li>
              <a href="#" className="text-gray-100 hover:text-blue-400 transition-colors">
                Twitter
              </a>
            </li>
            <li>
              <a href="#" className="text-gray-100 hover:text-blue-400 transition-colors">
                Facebook
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="text-center text-sm border-t border-gray-700 pt-4">
        &copy; 2025 Aspect Marketing Solutions. All rights reserved.
      </div>
    </footer>
  )
}
