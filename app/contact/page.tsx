import Navbar from "@/components/navbar"
import Footer from "@/components/footer"

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Page Header */}
      <header
        className="min-h-[40vh] bg-cover bg-center flex items-center justify-center text-center text-white relative"
        style={{ backgroundImage: "url(/images/hero-bg.png)" }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-50"></div>
        <h1 className="relative z-10 text-4xl font-bold">Contact Us</h1>
      </header>

      {/* Contact Section */}
      <section className="py-16 px-8">
        <div className="max-w-4xl mx-auto">
          {/* Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-2 text-gray-800">Address</h3>
              <p className="text-gray-600">
                6515 Greensburg Rd
                <br />
                Edmonton, KY 42129
              </p>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-2 text-gray-800">Phone</h3>
              <a href="tel:+12703921461" className="text-gray-600 hover:text-blue-600">
                270-392-1461
              </a>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-2 text-gray-800">Email</h3>
              <a href="mailto:info@aspectmarketingsolutions.com" className="text-gray-600 hover:text-blue-600">
                info@aspectmarketingsolutions.com
              </a>
            </div>
          </div>

          {/* Contact Form */}
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-8 text-gray-800">Get In Touch</h2>
            <form className="space-y-6">
              <div>
                <input
                  type="text"
                  placeholder="Your Name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <input
                  type="email"
                  placeholder="Your Email"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Subject"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <textarea
                  placeholder="Your Message"
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                ></textarea>
              </div>
              <div>
                <button
                  type="submit"
                  className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Send Message
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
