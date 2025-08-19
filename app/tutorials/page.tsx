import { YouTubeTutorial } from "@/components/youtube-tutorial"

export default function TutorialsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Marketing Tutorials</h1>
          <p className="text-xl text-gray-600">Learn essential marketing skills with our curated video tutorials</p>
        </div>

        <div className="grid gap-8">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <YouTubeTutorial />
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Why Link-in-Bio Websites Matter</h2>
            <div className="prose prose-gray max-w-none">
              <p>
                Link-in-bio websites have become essential tools for businesses and creators looking to maximize their
                social media presence. This tutorial shows you how to create professional, mobile-optimized landing
                pages that convert visitors into customers.
              </p>
              <ul>
                <li>Drive traffic from social media to multiple destinations</li>
                <li>Showcase products, services, and content in one place</li>
                <li>Track engagement and optimize conversion rates</li>
                <li>Maintain brand consistency across platforms</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
