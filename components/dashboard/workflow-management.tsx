"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ShoppingCart, Zap, Play, CheckCircle, AlertCircle, Clock } from "lucide-react"

interface Shop {
  id: string
  title: string
  platform: string
}

interface Product {
  id: string
  title: string
  status: "draft" | "published" | "processing"
  shop: string
  createdAt: string
}

export function WorkflowManagement() {
  const [shops, setShops] = useState<Shop[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedShop, setSelectedShop] = useState("")

  // Product creation form state
  const [productForm, setProductForm] = useState({
    title: "",
    description: "",
    price: "",
    tags: "",
    imageUrl: "",
  })

  useEffect(() => {
    fetchShops()
    fetchProducts()
  }, [])

  const fetchShops = async () => {
    try {
      const response = await fetch("/api/workflows/printify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "shops", userId: "user_123" }),
      })

      const data = await response.json()
      if (data.success) {
        // Mock shops data for demo
        setShops([
          { id: "shop_1", title: "My Etsy Store", platform: "Etsy" },
          { id: "shop_2", title: "Print on Demand Shop", platform: "Printify" },
        ])
      }
    } catch (error) {
      console.error("[v0] Failed to fetch shops:", error)
    }
  }

  const fetchProducts = () => {
    // Mock products data
    setProducts([
      {
        id: "prod_1",
        title: "Custom T-Shirt Design",
        status: "published",
        shop: "My Etsy Store",
        createdAt: "2024-11-15T10:00:00Z",
      },
      {
        id: "prod_2",
        title: "Marketing Poster Template",
        status: "draft",
        shop: "Print on Demand Shop",
        createdAt: "2024-11-16T14:30:00Z",
      },
      {
        id: "prod_3",
        title: "Business Card Design",
        status: "processing",
        shop: "My Etsy Store",
        createdAt: "2024-11-16T16:45:00Z",
      },
    ])
  }

  const handleCreateProduct = async () => {
    if (!selectedShop || !productForm.title) return

    setIsLoading(true)
    try {
      const response = await fetch("/api/workflows/printify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "products.create",
          shop_id: selectedShop,
          userId: "user_123",
          body: {
            title: productForm.title,
            description: productForm.description,
            variants: [
              {
                price: Number.parseFloat(productForm.price) * 100, // Convert to cents
                is_enabled: true,
              },
            ],
            images: productForm.imageUrl ? [{ src: productForm.imageUrl }] : [],
            tags: productForm.tags.split(",").map((tag) => tag.trim()),
          },
        }),
      })

      const data = await response.json()
      if (data.success) {
        // Add new product to list
        const newProduct: Product = {
          id: `prod_${Date.now()}`,
          title: productForm.title,
          status: "draft",
          shop: shops.find((s) => s.id === selectedShop)?.title || "",
          createdAt: new Date().toISOString(),
        }
        setProducts((prev) => [newProduct, ...prev])

        // Reset form
        setProductForm({
          title: "",
          description: "",
          price: "",
          tags: "",
          imageUrl: "",
        })
      }
    } catch (error) {
      console.error("[v0] Failed to create product:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePublishProduct = async (productId: string) => {
    try {
      const response = await fetch("/api/workflows/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: selectedShop,
          product_id: productId,
          userId: "user_123",
          title: "Published Product",
          description: "Product published via workflow",
        }),
      })

      const data = await response.json()
      if (data.success) {
        // Update product status
        setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, status: "published" as const } : p)))
      }
    } catch (error) {
      console.error("[v0] Failed to publish product:", error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "published":
        return <CheckCircle className="h-4 w-4 text-chart-4" />
      case "processing":
        return <Clock className="h-4 w-4 text-chart-1" />
      case "draft":
        return <AlertCircle className="h-4 w-4 text-chart-3" />
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
        return "bg-chart-4/20 text-chart-4"
      case "processing":
        return "bg-chart-1/20 text-chart-1"
      case "draft":
        return "bg-chart-3/20 text-chart-3"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Workflow Management</h1>
        <p className="text-muted-foreground">Create and manage your Printify and Etsy automation workflows</p>
      </div>

      {/* Workflow Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
            <Play className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">+2 from last week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products Created</CardTitle>
            <ShoppingCart className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">156</div>
            <p className="text-xs text-muted-foreground">+23 this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Published Listings</CardTitle>
            <CheckCircle className="h-4 w-4 text-chart-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">89</div>
            <p className="text-xs text-muted-foreground">+15 this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Used</CardTitle>
            <Zap className="h-4 w-4 text-chart-1" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,250</div>
            <p className="text-xs text-muted-foreground">For workflows this month</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="create" className="space-y-4">
        <TabsList>
          <TabsTrigger value="create">Create Product</TabsTrigger>
          <TabsTrigger value="products">My Products</TabsTrigger>
          <TabsTrigger value="workflows">Active Workflows</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create New Product</CardTitle>
              <CardDescription>Design and create products for your Printify and Etsy stores</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shop">Select Shop</Label>
                  <Select value={selectedShop} onValueChange={setSelectedShop}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a shop" />
                    </SelectTrigger>
                    <SelectContent>
                      {shops.map((shop) => (
                        <SelectItem key={shop.id} value={shop.id}>
                          {shop.title} ({shop.platform})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Product Title</Label>
                  <Input
                    id="title"
                    placeholder="Enter product title"
                    value={productForm.title}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="19.99"
                    value={productForm.price}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, price: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">Tags (comma separated)</Label>
                  <Input
                    id="tags"
                    placeholder="marketing, design, business"
                    value={productForm.tags}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, tags: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe your product..."
                  value={productForm.description}
                  onChange={(e) => setProductForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="image">Image URL (optional)</Label>
                <Input
                  id="image"
                  placeholder="https://example.com/image.jpg"
                  value={productForm.imageUrl}
                  onChange={(e) => setProductForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                />
              </div>

              <Button onClick={handleCreateProduct} disabled={isLoading || !selectedShop || !productForm.title}>
                {isLoading ? "Creating..." : "Create Product"}
                <Badge variant="secondary" className="ml-2">
                  10 credits
                </Badge>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Products</CardTitle>
              <CardDescription>Manage your created products and publish them to your stores</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {products.map((product) => (
                  <div key={product.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(product.status)}
                      <div>
                        <h3 className="font-medium text-card-foreground">{product.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {product.shop} • {new Date(product.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(product.status)}>{product.status}</Badge>
                      {product.status === "draft" && (
                        <Button size="sm" onClick={() => handlePublishProduct(product.id)}>
                          Publish
                          <Badge variant="secondary" className="ml-1 text-xs">
                            20 credits
                          </Badge>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflows" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Workflows</CardTitle>
              <CardDescription>Monitor your automated workflows and their performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  {
                    name: "Auto Product Creation",
                    status: "active",
                    lastRun: "2 hours ago",
                    executions: 45,
                  },
                  {
                    name: "Etsy Listing Optimizer",
                    status: "active",
                    lastRun: "1 day ago",
                    executions: 23,
                  },
                  {
                    name: "Inventory Sync",
                    status: "paused",
                    lastRun: "3 days ago",
                    executions: 12,
                  },
                ].map((workflow, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div
                        className={`w-3 h-3 rounded-full ${workflow.status === "active" ? "bg-chart-4" : "bg-chart-3"}`}
                      />
                      <div>
                        <h3 className="font-medium text-card-foreground">{workflow.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Last run: {workflow.lastRun} • {workflow.executions} executions
                        </p>
                      </div>
                    </div>
                    <Badge
                      className={
                        workflow.status === "active" ? "bg-chart-4/20 text-chart-4" : "bg-chart-3/20 text-chart-3"
                      }
                    >
                      {workflow.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
