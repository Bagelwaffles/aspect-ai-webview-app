import { env } from "./env"

const PRINTIFY_BASE_URL = "https://api.printify.com/v1"

class PrintifyAPI {
  private apiKey: string

  constructor() {
    this.apiKey = env.PRINTIFY_API_KEY
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${PRINTIFY_BASE_URL}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Printify API Error: ${response.status} ${response.statusText} - ${error}`)
    }

    return response.json()
  }

  // Shop Management
  async getShops() {
    return this.request("/shops.json")
  }

  async getShop(shopId: number) {
    return this.request(`/shops/${shopId}.json`)
  }

  // Product Management
  async getProducts(shopId: number, page = 1, limit = 10) {
    return this.request(`/shops/${shopId}/products.json?page=${page}&limit=${limit}`)
  }

  async getProduct(shopId: number, productId: string) {
    return this.request(`/shops/${shopId}/products/${productId}.json`)
  }

  async createProduct(shopId: number, productData: any) {
    return this.request(`/shops/${shopId}/products.json`, {
      method: "POST",
      body: JSON.stringify(productData),
    })
  }

  async updateProduct(shopId: number, productId: string, productData: any) {
    return this.request(`/shops/${shopId}/products/${productId}.json`, {
      method: "PUT",
      body: JSON.stringify(productData),
    })
  }

  async deleteProduct(shopId: number, productId: string) {
    return this.request(`/shops/${shopId}/products/${productId}.json`, {
      method: "DELETE",
    })
  }

  async publishProduct(shopId: number, productId: string, publishData: any) {
    return this.request(`/shops/${shopId}/products/${productId}/publish.json`, {
      method: "POST",
      body: JSON.stringify(publishData),
    })
  }

  // Image Management
  async uploadImage(imageData: { file_name: string; contents: string }) {
    return this.request("/uploads/images.json", {
      method: "POST",
      body: JSON.stringify(imageData),
    })
  }

  async getUploadedImages() {
    return this.request("/uploads/images.json")
  }

  // Catalog Management
  async getCatalog() {
    return this.request("/catalog/blueprints.json")
  }

  async getBlueprint(blueprintId: number) {
    return this.request(`/catalog/blueprints/${blueprintId}.json`)
  }

  async getPrintProviders(blueprintId: number) {
    return this.request(`/catalog/blueprints/${blueprintId}/print_providers.json`)
  }

  async getVariants(blueprintId: number, printProviderId: number) {
    return this.request(`/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`)
  }

  // Orders Management
  async getOrders(shopId: number, page = 1, limit = 10) {
    return this.request(`/shops/${shopId}/orders.json?page=${page}&limit=${limit}`)
  }

  async getOrder(shopId: number, orderId: string) {
    return this.request(`/shops/${shopId}/orders/${orderId}.json`)
  }
}

export const printifyAPI = new PrintifyAPI()
