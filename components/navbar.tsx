"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function Navbar() {
  const pathname = usePathname()

  const isActive = (path: string) => pathname === path

  return (
    <nav className="flex justify-between items-center px-8 py-4 bg-gray-50 sticky top-0 z-50 shadow-sm">
      <Link href="/" className="text-2xl font-semibold text-blue-600 hover:text-blue-700 transition-colors">
        Aspect Marketing Solutions
      </Link>
      <ul className="flex space-x-6">
        <li>
          <Link
            href="/"
            className={`font-medium transition-colors ${
              isActive("/") ? "text-blue-600" : "text-gray-700 hover:text-blue-600"
            }`}
          >
            Home
          </Link>
        </li>
        <li>
          <Link
            href="/about"
            className={`font-medium transition-colors ${
              isActive("/about") ? "text-blue-600" : "text-gray-700 hover:text-blue-600"
            }`}
          >
            About
          </Link>
        </li>
        <li>
          <Link
            href="/services"
            className={`font-medium transition-colors ${
              isActive("/services") ? "text-blue-600" : "text-gray-700 hover:text-blue-600"
            }`}
          >
            Services
          </Link>
        </li>
        <li>
          <Link
            href="/agents"
            className={`font-medium transition-colors ${
              isActive("/agents") ? "text-blue-600" : "text-gray-700 hover:text-blue-600"
            }`}
          >
            Agents
          </Link>
        </li>
        <li>
          <Link
            href="/pricing"
            className={`font-medium transition-colors ${
              isActive("/pricing") ? "text-blue-600" : "text-gray-700 hover:text-blue-600"
            }`}
          >
            Pricing
          </Link>
        </li>
        <li>
          <Link
            href="/contact"
            className={`font-medium transition-colors ${
              isActive("/contact") ? "text-blue-600" : "text-gray-700 hover:text-blue-600"
            }`}
          >
            Contact
          </Link>
        </li>
        <li>
          <Link
            href="/dashboard"
            className={`font-medium transition-colors ${
              isActive("/dashboard") ? "text-blue-600" : "text-gray-700 hover:text-blue-600"
            }`}
          >
            Dashboard
          </Link>
        </li>
      </ul>
    </nav>
  )
}
