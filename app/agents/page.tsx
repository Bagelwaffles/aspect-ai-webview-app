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
        <h1 className="relative z-10 text-4xl font-bold">Our Agents</h1>
      </header>

      {/* Agents Section */}
      <section className="py-16 px-8">
        <h2 className="text-3xl font-bold text-center mb-4 text-gray-800">Workflow Agents</h2>
        <p className="max-w-4xl mx-auto text-center text-gray-600 mb-12">
          Aspect Marketing Solutions utilises a series of specialised agents to automate the app build and distribution
          process. Each agent performs a distinct function within the workflow.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">▶️</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Trigger</h3>
            <p className="text-gray-600">
              Accepts a POST request at{" "}
              <code className="bg-gray-100 px-2 py-1 rounded text-sm">/build-apk-extended</code> and initiates the build
              workflow.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">📦</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Decode & Save ZIP</h3>
            <p className="text-gray-600">
              Decodes a base64‑encoded ZIP file, saves it to a temporary location and extracts the source code for
              processing.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">📱</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Build APK & AAB</h3>
            <p className="text-gray-600">
              Executes Gradle tasks to assemble release builds for both APK and AAB formats and returns their file
              paths.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">🖼️</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Generate Play Store Assets</h3>
            <p className="text-gray-600">
              Creates placeholder icons, banners and screenshots, along with a privacy policy and metadata required for
              Play Store submission.
            </p>
          </div>
          <div className="bg-white p-8 rounded-lg text-center shadow-sm">
            <div className="text-3xl text-blue-600 mb-4">⬆️</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Upload Results</h3>
            <p className="text-gray-600">
              Returns the base64‑encoded APK and AAB files together with generated assets, metadata and privacy policy
              text ready for distribution.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
