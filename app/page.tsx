import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Page() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">A</span>
              </div>
              <h1 className="text-xl font-bold">Aspect Marketing Solutions</h1>
            </div>
            <Button>Get Started</Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            Transform Your Business with
            <span className="text-primary"> Professional Marketing</span>
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Strategic marketing solutions that drive growth, increase visibility, and deliver measurable results for
            your business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-lg px-8 py-6">
              Start Your Consultation
            </Button>
            <Button variant="outline" size="lg" className="text-lg px-8 py-6 bg-transparent">
              View Our Services
            </Button>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-16 px-4 bg-muted/50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">Our Marketing Solutions</h3>
            <p className="text-muted-foreground text-lg">Comprehensive strategies tailored to your business needs</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Digital Marketing</CardTitle>
                <CardDescription>Comprehensive online campaigns and optimization</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• SEO and search marketing</li>
                  <li>• Social media management</li>
                  <li>• Content creation and strategy</li>
                  <li>• Paid advertising campaigns</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Brand Development</CardTitle>
                <CardDescription>Build a strong, recognizable brand identity</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• Brand strategy and positioning</li>
                  <li>• Visual identity design</li>
                  <li>• Brand messaging and voice</li>
                  <li>• Market differentiation</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lead Generation</CardTitle>
                <CardDescription>Convert prospects into paying customers</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• Conversion optimization</li>
                  <li>• Landing page design</li>
                  <li>• Email marketing campaigns</li>
                  <li>• Sales funnel development</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Market Analysis</CardTitle>
                <CardDescription>Data-driven insights for strategic decisions</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• Competitive research</li>
                  <li>• Market opportunity analysis</li>
                  <li>• Customer behavior insights</li>
                  <li>• Performance tracking</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Strategic Planning</CardTitle>
                <CardDescription>Long-term marketing roadmaps for growth</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• Marketing strategy development</li>
                  <li>• Goal setting and KPIs</li>
                  <li>• Budget allocation planning</li>
                  <li>• Timeline and milestone tracking</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Analytics</CardTitle>
                <CardDescription>Measure success and optimize results</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• ROI measurement and reporting</li>
                  <li>• Campaign performance analysis</li>
                  <li>• Data visualization dashboards</li>
                  <li>• Continuous optimization</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h3 className="text-3xl font-bold mb-8">Why Choose Aspect Marketing?</h3>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📈</span>
              </div>
              <h4 className="text-xl font-semibold mb-2">Proven Results</h4>
              <p className="text-muted-foreground">
                Track record of delivering measurable growth and ROI for our clients
              </p>
            </div>
            <div>
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎯</span>
              </div>
              <h4 className="text-xl font-semibold mb-2">Targeted Approach</h4>
              <p className="text-muted-foreground">
                Customized strategies designed specifically for your industry and goals
              </p>
            </div>
            <div>
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🤝</span>
              </div>
              <h4 className="text-xl font-semibold mb-2">Expert Partnership</h4>
              <p className="text-muted-foreground">Experienced team dedicated to your success and long-term growth</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 bg-primary text-primary-foreground">
        <div className="container mx-auto max-w-4xl text-center">
          <h3 className="text-3xl font-bold mb-4">Ready to Accelerate Your Growth?</h3>
          <p className="text-xl mb-8 opacity-90">
            Get started with a free consultation and discover how we can transform your marketing strategy.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="text-lg px-8 py-6">
              Schedule Free Consultation
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6 border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary bg-transparent"
            >
              Contact Us Today
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xs">A</span>
              </div>
              <span className="font-semibold">Aspect Marketing Solutions</span>
            </div>
            <div className="flex space-x-6 text-sm text-muted-foreground">
              <a href="/privacy-policy" className="hover:text-foreground">
                Privacy Policy
              </a>
              <a href="/terms-of-service" className="hover:text-foreground">
                Terms of Service
              </a>
              <a href="mailto:support@aspectmarketingsolutions.app" className="hover:text-foreground">
                Contact
              </a>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
            <p>&copy; 2024 Aspect Marketing Solutions. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
