export default function N8nSetupPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">n8n Workflow Setup Guide</h1>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Step 1: Access Your n8n Instance</h2>
              <p className="text-gray-600 mb-4">
                Go to your n8n instance at:{" "}
                <a
                  href="https://flow.aspectmarketingsolutions.app"
                  className="text-blue-600 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://flow.aspectmarketingsolutions.app
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Step 2: Create a Webhook Workflow</h2>
              <div className="bg-gray-50 p-4 rounded-lg">
                <ol className="list-decimal list-inside space-y-2 text-gray-700">
                  <li>Click "Add workflow" in n8n</li>
                  <li>Add a "Webhook" trigger node</li>
                  <li>
                    Set the webhook path to: <code className="bg-gray-200 px-2 py-1 rounded">/webhook/vo-app</code>
                  </li>
                  <li>Set HTTP Method to "POST"</li>
                  <li>Enable "Respond to Webhook" option</li>
                </ol>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Step 3: Add Relevance AI Integration</h2>
              <div className="bg-gray-50 p-4 rounded-lg">
                <ol className="list-decimal list-inside space-y-2 text-gray-700">
                  <li>Add an "HTTP Request" node after the webhook</li>
                  <li>Set URL to your Relevance AI endpoint</li>
                  <li>Add your Relevance API key in headers</li>
                  <li>Configure the request body to trigger your agents</li>
                </ol>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Step 4: Configure Workflow Actions</h2>
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-blue-800 mb-2">Your workflow should handle these actions:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>
                    <code>workflows.list</code> - Return available workflows
                  </li>
                  <li>
                    <code>printify.shops.list</code> - List Printify shops
                  </li>
                  <li>
                    <code>agent.trigger</code> - Trigger specific AI agents
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Step 5: Test the Connection</h2>
              <p className="text-gray-600 mb-4">
                Once your workflow is active, return to your{" "}
                <a href="/dashboard" className="text-blue-600 hover:underline">
                  dashboard
                </a>{" "}
                and click "View Workflows" to test the connection.
              </p>
            </section>

            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Important:</strong> Make sure your n8n workflow is activated (toggle switch in top-right)
                    and the webhook secret matches your environment variable.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
