"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Package, Plus, Upload, Eye, Edit, ExternalLink, Store, TrendingUp, DollarSign } from "lucide-react"

interface Shop {
  id: number
  title: string
  sales_channel: string
}

interface Product {
  id: string
  title: string
  description: string
  tags: string[]
  images: string[]
  variants: any[]
  created_at: string
  updated_at: string
  visible: boolean
  is_locked: boolean
  blueprint_id: number
  print_provider_id: number
  shop_id: number
}

export default function ProductsPage() {
  const [shops, setShops] = useState<Shop[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedShop, setSelectedShop] = useState<number | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<string[]>([])

  // Mock data for demonstration
  useEffect(() => {
    // Simulate API calls
    setShops([
      { id: 1, title: "Main Store", sales_channel: "etsy" },
      { id: 2, title: "Premium Collection", sales_channel: "storefront" },
      { id: 3, title: "Seasonal Items", sales_channel: "etsy" },
    ])

    setProducts([
      {
        id: "1",
        title: "Custom T-Shirt Design",
        description: "High-quality cotton t-shirt with custom print",
        tags: ["apparel", "custom", "cotton"],
        images: ["/placeholder-d5aye.png"],
        variants: [
          { id: 1, title: "Small", price: 2499 },
          { id: 2, title: "Medium", price: 2499 },
        ],
        created_at: "2024-01-15T10:30:00Z",
        updated_at: "2024-01-20T14:45:00Z",
        visible: true,
        is_locked: false,
        blueprint_id: 5,
        print_provider_id: 1,
        shop_id: 1,
      },
      {
        id: "2",
        title: "Motivational Poster",
        description: "Inspirational wall art for home and office",
        tags: ["poster", "motivational", "wall-art"],
        images: ["/placeholder-ne3w4.png"],
        variants: [
          { id: 3, title: "12x16", price: 1999 },
          { id: 4, title: "18x24", price: 2999 },
        ],
        created_at: "2024-01-10T09:15:00Z",
        updated_at: "2024-01-18T16:20:00Z",
        visible: true,
        is_locked: false,
        blueprint_id: 2,
        print_provider_id: 1,
        shop_id: 2,
      },
      {
        id: "3",
        title: "Coffee Mug Collection",
        description: "Ceramic mugs with unique designs",
        tags: ["mug", "ceramic", "coffee"],
        images: ["/placeholder-wujfc.png"],
        variants: [
          { id: 5, title: "11oz", price: 1499 },
          { id: 6, title: "15oz", price: 1699 },
        ],
        created_at: "2024-01-05T11:00:00Z",
        updated_at: "2024-01-22T13:30:00Z",
        visible: false,
        is_locked: true,
        blueprint_id: 3,
        print_provider_id: 2,
        shop_id: 1,
      },
    ])
  }, [])

  const handleCreateProduct = async (formData: FormData) => {
    setIsLoading(true)
    try {
      // Simulate API call to create product
      await new Promise((resolve) => setTimeout(resolve, 2000))
      setIsCreateDialogOpen(false)
      // Refresh products list
    } catch (error) {
      console.error("Failed to create product:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImageUpload = async (file: File) => {
    setIsLoading(true)
    try {
      // Simulate image upload
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const mockImageUrl = `/placeholder.svg?height=200&width=200&query=${file.name}`
      setUploadedImages((prev) => [...prev, mockImageUrl])
    } catch (error) {
      console.error("Failed to upload image:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredProducts = selectedShop ? products.filter((product) => product.shop_id === selectedShop) : products

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Package className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-card-foreground font-[family-name:var(--font-work-sans)]">
                Product Management
              </h1>
              <p className="text-sm text-muted-foreground">Manage your print-on-demand products</p>
            </div>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Product</DialogTitle>
                <DialogDescription>Add a new product to your print-on-demand catalog</DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)
                  handleCreateProduct(formData)
                }}
              >
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Product Title</Label>
                    <Input id="title" name="title" placeholder="Enter product title" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" placeholder="Product description" rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="shop">Shop</Label>
                      <Select name="shop" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select shop" />
                        </SelectTrigger>
                        <SelectContent>
                          {shops.map((shop) => (
                            <SelectItem key={shop.id} value={shop.id.toString()}>
                              {shop.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="blueprint">Product Type</Label>
                      <Select name="blueprint" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">T-Shirt</SelectItem>
                          <SelectItem value="2">Poster</SelectItem>
                          <SelectItem value="3">Mug</SelectItem>
                          <SelectItem value="7">Hoodie</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Product Images</Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        id="image-upload"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          files.forEach(handleImageUpload)
                        }}
                      />
                      <label htmlFor="image-upload" className="cursor-pointer">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Click to upload images or drag and drop</p>
                      </label>
                    </div>
                    {uploadedImages.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {uploadedImages.map((image, index) => (
                          <img
                            key={index}
                            src={image || "/placeholder.svg"}
                            alt={`Upload ${index + 1}`}
                            className="w-full h-20 object-cover rounded border"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Creating..." : "Create Product"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="p-6">
        <Tabs defaultValue="products" className="space-y-6">
          <TabsList>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="shops">Shops</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-6">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <Select
                    value={selectedShop?.toString() || "all"}
                    onValueChange={(value) => setSelectedShop(value === "all" ? null : Number.parseInt(value))}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="All Shops" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Shops</SelectItem>
                      {shops.map((shop) => (
                        <SelectItem key={shop.id} value={shop.id.toString()}>
                          {shop.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Search products..." className="max-w-sm" />
                </div>
              </CardContent>
            </Card>

            {/* Products Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => (
                <Card key={product.id} className="overflow-hidden">
                  <div className="aspect-square relative">
                    <img
                      src={product.images[0] || "/placeholder.svg"}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 flex gap-1">
                      {product.visible ? (
                        <Badge variant="default">Visible</Badge>
                      ) : (
                        <Badge variant="secondary">Hidden</Badge>
                      )}
                      {product.is_locked && <Badge variant="destructive">Locked</Badge>}
                    </div>
                  </div>
                  <CardHeader>
                    <CardTitle className="text-lg">{product.title}</CardTitle>
                    <CardDescription className="line-clamp-2">{product.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {product.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {product.variants.length} variant{product.variants.length !== 1 ? "s" : ""}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="shops" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {shops.map((shop) => (
                <Card key={shop.id}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Store className="h-8 w-8 text-primary" />
                      <div>
                        <CardTitle>{shop.title}</CardTitle>
                        <CardDescription>{shop.sales_channel === "etsy" ? "Etsy Store" : "Storefront"}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Products</span>
                        <span className="font-medium">{products.filter((p) => p.shop_id === shop.id).length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Status</span>
                        <Badge variant="default">Active</Badge>
                      </div>
                      <Button className="w-full bg-transparent" variant="outline">
                        Manage Shop
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{products.length}</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-accent">+2</span> from last week
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Products</CardTitle>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{products.filter((p) => p.visible).length}</div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round((products.filter((p) => p.visible).length / products.length) * 100)}% visible
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg. Price</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">$24.99</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-accent">+$2.50</span> from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Performance</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">94%</div>
                  <p className="text-xs text-muted-foreground">Success rate</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Top Performing Products</CardTitle>
                <CardDescription>Products with highest sales this month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {products.slice(0, 3).map((product, index) => (
                    <div key={product.id} className="flex items-center gap-4">
                      <div className="text-sm font-medium text-muted-foreground w-6">#{index + 1}</div>
                      <img
                        src={product.images[0] || "/placeholder.svg"}
                        alt={product.title}
                        className="w-12 h-12 rounded object-cover"
                      />
                      <div className="flex-1">
                        <p className="font-medium">{product.title}</p>
                        <p className="text-sm text-muted-foreground">{product.variants.length} variants</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${(Math.random() * 1000 + 500).toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground">{Math.floor(Math.random() * 50 + 10)} sales</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
