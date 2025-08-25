# Aspect Marketing Solutions Dashboard Deployment Guide

## Prerequisites
- Vercel account connected to your GitHub repository
- Domain `aspectmarketingsolutions.app` configured in your DNS provider
- Production API keys for Stripe, Printify, and n8n

## Deployment Steps

### 1. Vercel Project Setup
\`\`\`bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to Vercel
vercel --prod
\`\`\`

### 2. Domain Configuration
1. Go to your Vercel dashboard
2. Navigate to your project settings
3. Go to "Domains" section
4. Add `vo.aspectmarketingsolutions.app` as a custom domain
5. Configure DNS records as instructed by Vercel

### 3. Environment Variables
In your Vercel dashboard, add these environment variables:
- `NEXT_PUBLIC_APP_NAME`: Aspect Marketing Solutions
- `NEXT_PUBLIC_APP_URL`: https://vo.aspectmarketingsolutions.app
- `N8N_BASE_URL`: https://flow.aspectmarketingsolutions.app
- `N8N_WEBHOOK_PATH`: /webhook/vo-app
- `N8N_WEBHOOK_SECRET`: [Your secure webhook secret]
- `STRIPE_SECRET_KEY`: [Your production Stripe secret key]
- `STRIPE_PRICE_ID`: [Your production Stripe price ID]
- `STRIPE_WEBHOOK_SECRET`: [Your production Stripe webhook secret]
- `PRINTIFY_API_KEY`: [Your production Printify API key]

### 4. DNS Configuration
Add these DNS records to your domain provider:
\`\`\`
Type: CNAME
Name: vo
Value: cname.vercel-dns.com
\`\`\`

### 5. SSL Certificate
Vercel automatically provisions SSL certificates for custom domains.

### 6. Webhook Configuration
Update your Stripe webhook endpoint to:
`https://vo.aspectmarketingsolutions.app/api/billing/webhook`

## Post-Deployment Checklist
- [ ] Test health endpoint: `https://vo.aspectmarketingsolutions.app/api/health`
- [ ] Verify n8n webhook connectivity
- [ ] Test Stripe checkout flow
- [ ] Confirm Printify API integration
- [ ] Test all dashboard functionality

## Monitoring
- Monitor logs in Vercel dashboard
- Set up alerts for API failures
- Monitor webhook delivery success rates
