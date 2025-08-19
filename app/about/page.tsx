import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import Image from "next/image"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Page Header */}
      <header
        className="min-h-[40vh] bg-cover bg-center flex items-center justify-center text-center text-white relative"
        style={{ backgroundImage: "url(/images/hero-bg.png)" }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-50"></div>
        <h1 className="relative z-10 text-4xl font-bold">About Us</h1>
      </header>

      {/* About Section */}
      <section className="py-16 px-8">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-bold mb-6 text-gray-800">Our Story</h2>
          <p className="text-lg text-gray-600 mb-6">
            Aspect Marketing Solutions was founded with a vision to bridge the gap between traditional marketing and
            modern technology. We combine creative marketing strategies with cutting-edge automation tools to deliver
            exceptional results for our clients.
          </p>
          <p className="text-lg text-gray-600">
            Our team of experts specializes in both traditional marketing services and advanced workflow automation,
            helping businesses streamline their processes while building stronger connections with their customers.
          </p>
        </div>

        {/* Team Section */}
        <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">Our Team</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="bg-white rounded-lg p-6 text-center shadow-sm">
            <Image
              src="/images/avatar1.png"
              alt="Team Member"
              width={120}
              height={120}
              className="rounded-full mx-auto mb-4"
            />
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Marketing Director</h3>
            <p className="text-gray-600 text-sm">
              Leading our creative marketing initiatives and brand strategy development.
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 text-center shadow-sm">
            <Image
              src="/images/avatar2.png"
              alt="Team Member"
              width={120}
              height={120}
              className="rounded-full mx-auto mb-4"
            />
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Technical Lead</h3>
            <p className="text-gray-600 text-sm">Overseeing our automation workflows and technical integrations.</p>
          </div>
          <div className="bg-white rounded-lg p-6 text-center shadow-sm">
            <Image
              src="/images/avatar3.png"
              alt="Team Member"
              width={120}
              height={120}
              className="rounded-full mx-auto mb-4"
            />
            <h3 className="text-xl font-semibold mb-2 text-gray-800">Client Success Manager</h3>
            <p className="text-gray-600 text-sm">Ensuring our clients achieve their goals and maximize their ROI.</p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
