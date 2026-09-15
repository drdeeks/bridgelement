import { HOSTED_TOOLS, DECISION_OUTPUT } from './vendor/mcp-contract/src/hosted-tools.js';
import { evaluatePolicy } from './vendor/core/src/index.js'; // Assuming index.js is the entry point for core

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. MCP Tool Discovery (The "Scan")
    if (url.pathname === '/mcp/tools' || (url.pathname === '/mcp' && request.method === 'GET')) {
      return new Response(JSON.stringify({
        tools: HOSTED_TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. MCP Tool Execution (The "Enforcement")
    if (url.pathname === '/mcp' && request.method === 'POST') {
      try {
        const { method, params } = await request.json();

        if (method === 'tools/call') {
          const { name, arguments: args } = params;
          const tool = HOSTED_TOOLS.find(t => t.name === name);

          if (!tool) {
            return new Response(JSON.stringify({ error: `Tool ${name} not found` }), { status: 404 });
          }

          // Resolve User Identity from OAuth/Headers (Bridgelement Logic)
          const userProfile = await env.DB.prepare(
            "SELECT * FROM profiles WHERE user_id = ?"
          ).bind(request.headers.get('X-ACK-User-ID')).first();

          if (!userProfile) {
            return new Response(JSON.stringify({ 
              content: [{ type: "text", text: "No active ACK profile found for this user." }] 
            }), { status: 403 });
          }

          // Execute the Core Logic (Vendored Core)
          // We pass the tool call and the profile to the evaluation engine
          const decision = await evaluatePolicy({
            profile: userProfile,
            action: {
              tool: name,
              command: args.command || '',
              params: args
            }
          });

          return new Response(JSON.stringify({
            content: [{ 
              type: "text", 
              text: `ACK Decision: ${decision.decision}. Reason: ${decision.reasonCodes.join(', ')}` 
            }]
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
