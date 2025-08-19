import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Hero Section */}
      <section
        className="min-h-[80vh] bg-cover bg-center flex items-center justify-center text-center text-white relative"
        style={{ backgroundImage: "url(/images/hero-bg.png)" }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-50"></div>
        <div className="relative z-10 max-w-4xl mx-auto px-8">
          <h1 className="text-5xl font-bold mb-6">Marketing Solutions for the Modern Business</h1>
          <p className="text-xl mb-8">
            We provide integrated marketing strategies that help your brand connect with customers and thrive.
          </p>
          <Link
            href="/about"
            className="inline-block bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 rounded font-medium transition-colors"
          >
            Learn More
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-8 bg-white">
        <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">Why Choose Us</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="bg-gray-50 p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">💡</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Creative Ideas</h3>
            <p className="text-gray-600">
              We bring fresh ideas and innovative approaches to every project to ensure your business stands out.
            </p>
          </div>
          <div className="bg-gray-50 p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">💻</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Technical Expertise</h3>
            <p className="text-gray-600">
              Our team is experienced in modern technologies and frameworks to build scalable solutions.
            </p>
          </div>
          <div className="bg-gray-50 p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">👥</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Collaborative Approach</h3>
            <p className="text-gray-600">
              We work closely with clients, keeping communication open and transparent throughout the process.
            </p>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-12 px-8 bg-blue-600 text-white text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Business?</h2>
        <p className="text-lg mb-6">Contact us today to discuss how we can help you achieve your goals.</p>
        <Link
          href="/contact"
          className="inline-block bg-white text-blue-600 hover:bg-gray-100 px-6 py-3 rounded font-medium transition-colors"
        >
          Get Started
        </Link>
      </section>

      <Footer />
    </div>
  )
}
