import Navbar from "@/components/navbar"
import Footer from "@/components/footer"

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Page Header */}
      <header
        className="min-h-[40vh] bg-cover bg-center flex items-center justify-center text-center text-white relative"
        style={{ backgroundImage: "url(/images/hero-bg.png)" }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-50"></div>
        <h1 className="relative z-10 text-4xl font-bold">Our Services</h1>
      </header>

      {/* Services Section */}
      <section className="py-16 px-8">
        <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">What We Offer</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto mb-16">
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">💡</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Brand Strategy</h3>
            <p className="text-gray-600">
              Develop a compelling brand identity and positioning that resonates with your target market.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">🌐</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Digital Marketing</h3>
            <p className="text-gray-600">
              Integrated digital campaigns designed to increase visibility and drive engagement across channels.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">✏️</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Content Creation</h3>
            <p className="text-gray-600">
              Engaging copywriting, visuals and multimedia content tailored to tell your brand's story.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">📱</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Social Media Management</h3>
            <p className="text-gray-600">
              Strategic social media planning and execution to build community and foster brand loyalty.
            </p>
          </div>
        </div>

        {/* Our Capabilities Section */}
        <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">Our Capabilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Brand Strategy & Positioning</h3>
            <p className="text-gray-600">
              We craft a unique brand identity and positioning to connect with your target audience with clarity and
              purpose.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">📈</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Digital Marketing & SEO</h3>
            <p className="text-gray-600">
              Integrated campaigns that leverage search engine optimisation, paid advertising and social media to
              maximise your visibility.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">📄</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Content & Copywriting</h3>
            <p className="text-gray-600">
              Engaging blog posts, articles and multimedia content designed to tell your brand's story and build
              authority.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">💬</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Social Media Management</h3>
            <p className="text-gray-600">
              Strategic planning and execution across all major platforms to foster community engagement and loyalty.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Data Analytics & Reporting</h3>
            <p className="text-gray-600">
              In‑depth analysis of campaign performance with actionable insights to fine‑tune your marketing strategy.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">📧</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Email Marketing Campaigns</h3>
            <p className="text-gray-600">
              Personalised email campaigns that nurture leads and encourage customer retention with measurable results.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">🔍</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Market Research & Competitor Analysis</h3>
            <p className="text-gray-600">
              Comprehensive research into your industry and competitors to inform tactics and ensure you stay ahead of
              the curve.
            </p>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-12 px-8 bg-blue-600 text-white text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Grow Your Business?</h2>
        <p className="text-lg mb-6">Partner with Aspect Marketing Solutions to accelerate your brand's success.</p>
        <a
          href="/contact"
          className="inline-block bg-white text-blue-600 hover:bg-gray-100 px-6 py-3 rounded font-medium transition-colors"
        >
          Contact Us
        </a>
      </section>

      <Footer />
    </div>
  )
}
