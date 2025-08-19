# Aspect Marketing Solutions Platform

Professional marketing automation platform built with Next.js 14, integrating AI agents, payment processing, and workflow automation.

## Tech Stack

- **Frontend**: Next.js 14 + App Router, Tailwind CSS, TypeScript
- **Payments**: Stripe integration with subscription management
- **AI Integration**: Relevance AI agents (AspectBot, Aspect AGI Commander)
- **Workflow Automation**: n8n with webhook-based triggers
- **Deployment**: Vercel with custom domain
- **Infrastructure**: Docker + Caddy for n8n hosting

## Prerequisites

\`\`\`bash
node -v   # 18.x or 20.x
pnpm -v   # recommended (or yarn/npm)
\`\`\`

## 1. Installation & Bootstrap

\`\`\`bash
pnpm dlx create-next-app@latest aspect-ms --ts --app --eslint --tailwind --src-dir=false --import-alias "@/*"
cd aspect-ms
pnpm add stripe
\`\`\`

## 2. Environment Variables

Create `.env.local` with the following variables:

\`\`\`env
# App Configuration
NEXT_PUBLIC_APP_URL=https://aspectmarketingsolutions.app

# n8n Integration
N8N_BASE_URL=https://flow.aspectmarketingsolutions.app
N8N_WEBHOOK_PATH=/webhook/vo-app
N8N_WEBHOOK_SECRET=your-webhook-secret

# Relevance AI
RELEVANCE_API_KEY=sk-YWM2NjExMjQtN2U1Zi00NDY3LWFiYmUtZGlyNWEyOTg3MzNm
RELEVANCE_AUTH_TOKEN=1c756995-3667-41b6-9ff2-18abbb0e844d:sk-YWM2NjExMjQtN2U1Zi00NDY3LWFiYmUtZGlyNWEyOTg3MzNm
RELEVANCE_PROJECT_ID=1c756995-3667-41b6-9ff2-18abbb0e844d
RELEVANCE_REGION=f1db6c

# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_1RxhkIHYEXbsfw5T8E6GChC4
\`\`\`

## 3. DNS Configuration

Add A record for n8n subdomain:

\`\`\`
Type: A
Host: flow
Value: [YOUR_SERVER_IP]
TTL: 300
\`\`\`

Verify DNS resolution:
\`\`\`bash
dig +short flow.aspectmarketingsolutions.app
\`\`\`

## 4. n8n + Caddy Server Setup

Deploy n8n with Docker Compose and Caddy reverse proxy:

\`\`\`yaml
# docker-compose.yml
version: '3.8'
services:
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    environment:
      - N8N_HOST=flow.aspectmarketingsolutions.app
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://flow.aspectmarketingsolutions.app
    volumes:
      - n8n_data:/home/node/.n8n
    networks:
      - n8n_network

  caddy:
    image: caddy:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - n8n_network

volumes:
  n8n_data:
  caddy_data:
  caddy_config:

networks:
  n8n_network:
\`\`\`

\`\`\`
# Caddyfile
flow.aspectmarketingsolutions.app {
    # Protect editor with basic auth
    @editor path /editor* /rest* /assets* /static*
    basicauth @editor {
        admin $2a$10$[BCRYPT_HASH]
    }
    
    # Public webhooks (no auth)
    @webhooks path /webhook* /health*
    
    reverse_proxy n8n:5678
}
\`\`\`

## 5. Development

\`\`\`bash
pnpm dev
# Open http://localhost:3000
\`\`\`

## 6. Deployment

1. Set environment variables in Vercel Project Settings
2. Deploy to Vercel
3. Configure custom domain: aspectmarketingsolutions.app

## 7. n8n Workflow Setup

Import and activate these workflows in your n8n instance:

1. **Health Check Workflow** - Basic health monitoring
2. **VO App Workflow** - Main webhook handler with actions:
   - `status.ping` - Health check
   - `relevance.ask.app` - AI agent integration
   - `credits.use` - Credit management
   - `credits.add` - Credit addition

## 8. Testing & Validation

### n8n Direct Test
\`\`\`bash
curl -sS -X POST https://flow.aspectmarketingsolutions.app/webhook/vo-app \
  -H "content-type: application/json" \
  -H "x-vo-secret: $N8N_WEBHOOK_SECRET" \
  -d '{"action":"status.ping"}' | jq .
\`\`\`

### App → n8n Status
\`\`\`bash
curl -s https://aspectmarketingsolutions.app/api/n8n/status | jq .
\`\`\`

### Relevance AI Test
\`\`\`bash
curl -sS -X POST https://aspectmarketingsolutions.app/api/ai/ask \
  -H "content-type: application/json" \
  -d '{"assistantId":"AspectBot","message":"Hello"}' | jq .
\`\`\`

### Credits Test
\`\`\`bash
curl -sS -X POST https://flow.aspectmarketingsolutions.app/webhook/vo-app \
  -H "content-type: application/json" \
  -H "x-vo-secret: $N8N_WEBHOOK_SECRET" \
  -d '{"action":"credits.add","email":"test@example.com","amount":5}' | jq .
\`\`\`

## 9. Troubleshooting

### Common Issues

**NXDOMAIN for flow.aspectmarketingsolutions.app**
- Confirm A record points to correct server IP
- Wait 5-10 minutes for DNS propagation

**401/403 on webhook calls**
- Verify `x-vo-secret` header matches `N8N_WEBHOOK_SECRET`

**502 from app to n8n**
- Check n8n workflow is active
- Verify Caddy is routing correctly: `curl https://flow.aspectmarketingsolutions.app/health`
- Check containers: `docker compose ps`

**Stripe integration issues**
- Use test keys for development
- Verify webhook endpoints are configured
- Check Stripe dashboard for failed payments

## Platform Features

- **Lead Capture**: Automated lead intake with n8n processing
- **AI Chat**: Subscription-gated chat with Relevance AI agents
- **Payment Processing**: Stripe checkout with subscription management
- **Credit System**: PostgreSQL-backed credit tracking
- **Workflow Automation**: n8n-powered business process automation
- **Professional Design**: Responsive Tailwind CSS interface

## Architecture

\`\`\`
User → aspectmarketingsolutions.app → Vercel Functions → n8n workflows → Relevance AI
                                   ↘ Stripe API
                                   ↘ PostgreSQL (credits)
\`\`\`

## Support

For technical support or deployment assistance, contact the development team or refer to the dashboard at `/dashboard` for real-time system status and configuration guides.
