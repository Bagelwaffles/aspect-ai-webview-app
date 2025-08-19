import Navbar from "@/components/navbar"
import Footer from "@/components/footer"

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Page Header */}
      <header
        className="min-h-[40vh] bg-cover bg-center flex items-center justify-center text-center text-white relative"
        style={{ backgroundImage: "url(/images/hero-bg.png)" }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-50"></div>
        <h1 className="relative z-10 text-4xl font-bold">Our AI Agents</h1>
      </header>

      {/* Agents Section */}
      <section className="py-16 px-8">
        <h2 className="text-3xl font-bold text-center mb-4 text-gray-800">Marketing Automation Agents</h2>
        <p className="max-w-4xl mx-auto text-center text-gray-600 mb-12">
          Our specialized AI agents automate your marketing workflows, from content creation to e-commerce management.
          Each agent is designed to handle specific aspects of your digital marketing strategy.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">AspectBot</h3>
            <p className="text-gray-600">
              Our primary AI assistant that handles customer inquiries, generates marketing content, and manages
              automated responses across multiple channels.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">⚡</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Aspect AGI Commander</h3>
            <p className="text-gray-600">
              Advanced workflow orchestrator that coordinates complex marketing campaigns, manages multi-platform
              publishing, and optimizes content distribution timing.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">👕</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Printify Integration Agent</h3>
            <p className="text-gray-600">
              Automates print-on-demand product creation, manages inventory updates, and synchronizes product listings
              across multiple e-commerce platforms.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">🛒</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">E-commerce Manager</h3>
            <p className="text-gray-600">
              Handles order processing, customer communications, and inventory management across Etsy, Shopify, and
              other e-commerce platforms.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Analytics & Insights Agent</h3>
            <p className="text-gray-600">
              Monitors campaign performance, generates detailed reports, and provides actionable insights to optimize
              your marketing ROI and customer engagement.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Content Strategy Agent</h3>
            <p className="text-gray-600">
              Creates targeted content calendars, generates social media posts, and optimizes content for SEO and
              audience engagement across all marketing channels.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
