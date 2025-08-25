export interface AgentDeployment {
  id: string
  agentId: string
  agentName: string
  agentType: string
  name: string
  status: "active" | "inactive" | "deploying" | "error"
  config: DeploymentConfig
  embedCode: string
  webhookUrl: string
  analytics: DeploymentAnalytics
  createdAt: Date
  updatedAt: Date
}

export interface DeploymentConfig {
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center" | "inline"
  theme: "light" | "dark" | "auto" | "custom"
  size: "small" | "medium" | "large"
  autoOpen: boolean
  greeting: string
  placeholder: string
  primaryColor: string
  backgroundColor: string
  textColor: string
  borderRadius: number
  showBranding: boolean
  allowedDomains: string[]
  rateLimiting: {
    enabled: boolean
    maxMessages: number
    timeWindow: number
  }
  customCSS?: string
}

export interface DeploymentAnalytics {
  totalInteractions: number
  uniqueVisitors: number
  averageSessionLength: number
  conversionRate: number
  topPages: Array<{ page: string; interactions: number }>
  userSatisfaction: number
  responseTime: number
}

export const DEFAULT_DEPLOYMENT_CONFIG: DeploymentConfig = {
  position: "bottom-right",
  theme: "light",
  size: "medium",
  autoOpen: false,
  greeting: "Hi! How can I help you today?",
  placeholder: "Type your message...",
  primaryColor: "#0ea5e9",
  backgroundColor: "#ffffff",
  textColor: "#1f2937",
  borderRadius: 12,
  showBranding: true,
  allowedDomains: [],
  rateLimiting: {
    enabled: true,
    maxMessages: 50,
    timeWindow: 3600, // 1 hour in seconds
  },
}

export class DeploymentManager {
  private deployments: Map<string, AgentDeployment> = new Map()

  constructor() {
    // Load mock deployments
    this.loadMockDeployments()
  }

  private loadMockDeployments() {
    const mockDeployments: AgentDeployment[] = [
      {
        id: "deploy-1",
        agentId: "grok-support",
        agentName: "Customer Support Agent",
        agentType: "customer-service",
        name: "Main Website Support",
        status: "active",
        config: {
          ...DEFAULT_DEPLOYMENT_CONFIG,
          position: "bottom-right",
          greeting: "Need help? I'm here to assist you!",
          primaryColor: "#0ea5e9",
        },
        embedCode: `<script src="https://aspectmarketingsolutions.app/embed/deploy-1.js"></script>`,
        webhookUrl: "https://aspectmarketingsolutions.app/api/agents/deploy-1/webhook",
        analytics: {
          totalInteractions: 1247,
          uniqueVisitors: 892,
          averageSessionLength: 4.2,
          conversionRate: 12.3,
          topPages: [
            { page: "/", interactions: 456 },
            { page: "/products", interactions: 321 },
            { page: "/pricing", interactions: 234 },
          ],
          userSatisfaction: 4.6,
          responseTime: 1.8,
        },
        createdAt: new Date("2024-01-15"),
        updatedAt: new Date(),
      },
      {
        id: "deploy-2",
        agentId: "grok-sales",
        agentName: "Sales Assistant",
        agentType: "sales",
        name: "Landing Page Sales Bot",
        status: "active",
        config: {
          ...DEFAULT_DEPLOYMENT_CONFIG,
          position: "bottom-left",
          theme: "dark",
          greeting: "Ready to boost your business? Let's talk!",
          primaryColor: "#f59e0b",
        },
        embedCode: `<script src="https://aspectmarketingsolutions.app/embed/deploy-2.js"></script>`,
        webhookUrl: "https://aspectmarketingsolutions.app/api/agents/deploy-2/webhook",
        analytics: {
          totalInteractions: 678,
          uniqueVisitors: 543,
          averageSessionLength: 6.1,
          conversionRate: 18.7,
          topPages: [
            { page: "/landing", interactions: 234 },
            { page: "/demo", interactions: 189 },
            { page: "/contact", interactions: 156 },
          ],
          userSatisfaction: 4.4,
          responseTime: 2.1,
        },
        createdAt: new Date("2024-01-20"),
        updatedAt: new Date(),
      },
    ]

    mockDeployments.forEach((deployment) => {
      this.deployments.set(deployment.id, deployment)
    })
  }

  getAllDeployments(): AgentDeployment[] {
    return Array.from(this.deployments.values())
  }

  getDeployment(id: string): AgentDeployment | undefined {
    return this.deployments.get(id)
  }

  createDeployment(
    agentId: string,
    agentName: string,
    agentType: string,
    name: string,
    config: Partial<DeploymentConfig>,
  ): AgentDeployment {
    const id = `deploy-${Date.now()}`
    const deployment: AgentDeployment = {
      id,
      agentId,
      agentName,
      agentType,
      name,
      status: "deploying",
      config: { ...DEFAULT_DEPLOYMENT_CONFIG, ...config },
      embedCode: `<script src="https://aspectmarketingsolutions.app/embed/${id}.js"></script>`,
      webhookUrl: `https://aspectmarketingsolutions.app/api/agents/${id}/webhook`,
      analytics: {
        totalInteractions: 0,
        uniqueVisitors: 0,
        averageSessionLength: 0,
        conversionRate: 0,
        topPages: [],
        userSatisfaction: 0,
        responseTime: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    this.deployments.set(id, deployment)

    // Simulate deployment process
    setTimeout(() => {
      deployment.status = "active"
      deployment.updatedAt = new Date()
    }, 3000)

    return deployment
  }

  updateDeployment(id: string, updates: Partial<AgentDeployment>): AgentDeployment | null {
    const deployment = this.deployments.get(id)
    if (!deployment) return null

    const updatedDeployment = {
      ...deployment,
      ...updates,
      updatedAt: new Date(),
    }

    this.deployments.set(id, updatedDeployment)
    return updatedDeployment
  }

  deleteDeployment(id: string): boolean {
    return this.deployments.delete(id)
  }

  generateEmbedScript(deployment: AgentDeployment): string {
    const config = deployment.config

    return `
<!-- Aspect Marketing Solutions Agent Embed -->
<script>
(function() {
  var config = ${JSON.stringify(config, null, 2)};
  var agentId = "${deployment.agentId}";
  var deploymentId = "${deployment.id}";
  
  // Create chat widget
  var widget = document.createElement('div');
  widget.id = 'ams-chat-widget-' + deploymentId;
  widget.style.cssText = \`
    position: fixed;
    z-index: 9999;
    \${config.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
    \${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
    width: \${config.size === 'small' ? '300px' : config.size === 'large' ? '400px' : '350px'};
    height: \${config.size === 'small' ? '400px' : config.size === 'large' ? '500px' : '450px'};
    background: \${config.backgroundColor};
    border-radius: \${config.borderRadius}px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: none;
  \`;
  
  // Create toggle button
  var button = document.createElement('button');
  button.style.cssText = \`
    position: fixed;
    z-index: 10000;
    \${config.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
    \${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: none;
    background: \${config.primaryColor};
    color: white;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    font-size: 24px;
  \`;
  button.innerHTML = '💬';
  
  // Toggle functionality
  button.onclick = function() {
    if (widget.style.display === 'none') {
      widget.style.display = 'block';
      button.style.display = 'none';
    }
  };
  
  // Close functionality
  widget.innerHTML = \`
    <div style="padding: 20px; height: 100%; display: flex; flex-direction: column;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3 style="margin: 0; color: \${config.textColor};">\${config.greeting}</h3>
        <button onclick="this.parentElement.parentElement.parentElement.style.display='none'; document.querySelector('button[onclick*=\\"💬\\"]').style.display='block';" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
      </div>
      <div id="chat-messages-\${deploymentId}" style="flex: 1; overflow-y: auto; margin-bottom: 15px; padding: 10px; background: #f9f9f9; border-radius: 8px;"></div>
      <div style="display: flex; gap: 10px;">
        <input type="text" id="chat-input-\${deploymentId}" placeholder="\${config.placeholder}" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; outline: none;" />
        <button onclick="sendMessage('\${deploymentId}', '\${agentId}')" style="padding: 10px 15px; background: \${config.primaryColor}; color: white; border: none; border-radius: 6px; cursor: pointer;">Send</button>
      </div>
      \${config.showBranding ? '<div style="text-align: center; margin-top: 10px; font-size: 12px; color: #666;">Powered by Aspect Marketing Solutions</div>' : ''}
    </div>
  \`;
  
  // Add to page
  document.body.appendChild(button);
  document.body.appendChild(widget);
  
  // Auto-open if configured
  if (config.autoOpen) {
    setTimeout(function() {
      widget.style.display = 'block';
      button.style.display = 'none';
    }, 2000);
  }
  
  // Send message function
  window.sendMessage = function(deploymentId, agentId) {
    var input = document.getElementById('chat-input-' + deploymentId);
    var messages = document.getElementById('chat-messages-' + deploymentId);
    var message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    messages.innerHTML += '<div style="margin-bottom: 10px; text-align: right;"><div style="display: inline-block; background: ' + config.primaryColor + '; color: white; padding: 8px 12px; border-radius: 12px; max-width: 80%;">' + message + '</div></div>';
    input.value = '';
    messages.scrollTop = messages.scrollHeight;
    
    // Send to API
    fetch('https://aspectmarketingsolutions.app/api/grok/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agentId, message: message })
    })
    .then(response => response.json())
    .then(data => {
      messages.innerHTML += '<div style="margin-bottom: 10px;"><div style="display: inline-block; background: #f0f0f0; color: #333; padding: 8px 12px; border-radius: 12px; max-width: 80%;">' + data.response + '</div></div>';
      messages.scrollTop = messages.scrollHeight;
    })
    .catch(error => {
      messages.innerHTML += '<div style="margin-bottom: 10px;"><div style="display: inline-block; background: #fee; color: #c33; padding: 8px 12px; border-radius: 12px; max-width: 80%;">Sorry, I encountered an error. Please try again.</div></div>';
      messages.scrollTop = messages.scrollHeight;
    });
  };
  
  // Enter key support
  document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && e.target.id === 'chat-input-' + deploymentId) {
      sendMessage(deploymentId, agentId);
    }
  });
})();
</script>
<!-- End Aspect Marketing Solutions Agent Embed -->
    `.trim()
  }
}

export const deploymentManager = new DeploymentManager()
