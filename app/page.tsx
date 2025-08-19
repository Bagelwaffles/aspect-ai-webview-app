export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">VO.app Starter</h1>
          <p className="text-xl text-gray-600 mb-8">
            Complete Next.js starter with n8n workflow automation, Stripe payments, and Printify integration
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="/pricing"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              View Pricing
            </a>
            <a
              href="/dashboard"
              className="bg-gray-200 text-gray-800 px-8 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Dashboard
            </a>
          </div>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">n8n Integration</h3>
            <p className="text-gray-600">
              Secure webhook proxy for workflow automation with authentication and error handling.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Stripe Payments</h3>
            <p className="text-gray-600">Complete subscription billing with checkout sessions and webhook handling.</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Printify API</h3>
            <p className="text-gray-600">Print-on-demand integration for product creation and shop management.</p>
          </div>
        </div>
      </div>
    </main>
  )
}
