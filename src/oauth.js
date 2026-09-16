/**
 * OAuth 2.0 / OIDC Discovery & MCP Auth Metadata
 * Enables ChatGPT and other MCP clients to discover auth requirements.
 */

const OAUTH_SCOPES = ["mcp:read", "mcp:write", "mcp:tools"];

export function oauthMetadataHandler(request, env) {
  const url = new URL(request.url);
  const issuer = `${url.protocol}//${url.host}`;
  
  return new Response(JSON.stringify({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    registration_endpoint: `${issuer}/oauth/register`,
    scopes_supported: OAUTH_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
  }), {
    headers: { "content-type": "application/json" },
  });
}

export function mcpMetadataHandler(request, env) {
  const url = new URL(request.url);
  const base = `${url.protocol}//${url.host}`;
  
  return new Response(JSON.stringify({
    name: "Bridgelement",
    version: "1.0.0",
    description: "Provider-agnostic MCP bridge with policy enforcement and telemetry",
    mcp_version: "2024-11-05",
    transport: ["http", "sse"],
    authentication: {
      type: "oauth",
      authorization_server: `${base}/.well-known/oauth-authorization-server`,
      scopes: OAUTH_SCOPES,
      required: true,
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
      logging: true,
    },
    tools_endpoint: `${base}/mcp`,
    events_endpoint: `${base}/events`,
  }), {
    headers: { "content-type": "application/json" },
  });
}

export function jwksHandler(request, env) {
  // In production, serve actual JWKS from your key management
  // For now, return empty - clients will validate via token introspection or CF Access
  return new Response(JSON.stringify({ keys: [] }), {
    headers: { "content-type": "application/json" },
  });
}

// Simple in-memory client registry (replace with D1 in production)
const clientRegistry = new Map();

export async function registerHandler(request, env) {
  const body = await request.json();
  const clientId = `mcp_${crypto.randomUUID().slice(0, 8)}`;
  const clientSecret = crypto.randomUUID();
  
  clientRegistry.set(clientId, {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: body.redirect_uris || [],
    grant_types: body.grant_types || ["authorization_code", "refresh_token"],
    scope: body.scope || OAUTH_SCOPES.join(" "),
    created_at: Date.now(),
  });
  
  return new Response(JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: body.redirect_uris || [],
    grant_types: ["authorization_code", "refresh_token"],
    scope: OAUTH_SCOPES.join(" "),
  }), {
    headers: { "content-type": "application/json" },
  });
}

export async function authorizeHandler(request, env) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const scope = url.searchParams.get("scope") || OAUTH_SCOPES.join(" ");
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  
  if (!clientId || !clientRegistry.has(clientId)) {
    return new Response("Invalid client_id", { status: 400 });
  }
  
  // In production: redirect to your actual OAuth consent page (Cloudflare Access, etc.)
  // For now, simulate consent and redirect back with code
  const code = `auth_${crypto.randomUUID().slice(0, 16)}`;
  
  // Store code with PKCE challenge for token exchange validation
  clientRegistry.set(`code_${code}`, {
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    expires_at: Date.now() + 600000, // 10 min
  });
  
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);
  
  return Response.redirect(redirectUrl.toString(), 302);
}

export async function tokenHandler(request, env) {
  const body = await request.json();
  const grantType = body.grant_type;
  const clientId = body.client_id;
  const clientSecret = body.client_secret;
  
  if (grantType === "authorization_code") {
    const code = body.code;
    const codeVerifier = body.code_verifier;
    const codeData = clientRegistry.get(`code_${code}`);
    
    if (!codeData || codeData.client_id !== clientId) {
      return new Response(JSON.stringify({ error: "invalid_grant" }), { 
        status: 400, headers: { "content-type": "application/json" } 
      });
    }
    
    // Verify PKCE
    if (codeData.code_challenge && codeVerifier) {
      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);
      const hash = await crypto.subtle.digest("SHA-256", data);
      const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      if (challenge !== codeData.code_challenge) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { 
          status: 400, headers: { "content-type": "application/json" } 
        });
      }
    }
    
    // Issue tokens
    const accessToken = `mcp_${crypto.randomUUID().replace(/-/g, "")}`;
    const refreshToken = `ref_${crypto.randomUUID().replace(/-/g, "")}`;
    
    // Store token -> identity mapping (in production, use D1)
    clientRegistry.set(`token_${accessToken}`, {
      client_id: clientId,
      scope: codeData.scope,
      workspace_id: codeData.workspace_id || "default",
      user_id: codeData.user_id || `user_${crypto.randomUUID().slice(0, 8)}`,
      installation_id: codeData.installation_id || `install_${crypto.randomUUID().slice(0, 8)}`,
      expires_at: Date.now() + 3600000, // 1 hour
    });
    
    clientRegistry.set(`refresh_${refreshToken}`, {
      client_id: clientId,
      access_token: accessToken,
    });
    
    clientRegistry.delete(`code_${code}`);
    
    return new Response(JSON.stringify({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: codeData.scope,
    }), {
      headers: { "content-type": "application/json" },
    });
  }
  
  if (grantType === "refresh_token") {
    const refreshToken = body.refresh_token;
    const refreshData = clientRegistry.get(`refresh_${refreshToken}`);
    
    if (!refreshData) {
      return new Response(JSON.stringify({ error: "invalid_grant" }), { 
        status: 400, headers: { "content-type": "application/json" } 
      });
    }
    
    const newAccessToken = `mcp_${crypto.randomUUID().replace(/-/g, "")}`;
    clientRegistry.set(`token_${newAccessToken}`, {
      ...clientRegistry.get(`token_${refreshData.access_token}`),
      expires_at: Date.now() + 3600000,
    });
    clientRegistry.set(`refresh_${refreshToken}`, {
      ...refreshData,
      access_token: newAccessToken,
    });
    
    return new Response(JSON.stringify({
      access_token: newAccessToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: clientRegistry.get(`token_${refreshData.access_token}`).scope,
    }), {
      headers: { "content-type": "application/json" },
    });
  }
  
  if (grantType === "client_credentials") {
    // For service-to-service (bootstrap token equivalent)
    if (clientId && env.ACK_BOOTSTRAP_TOKEN && clientSecret === env.ACK_BOOTSTRAP_TOKEN) {
      const accessToken = `mcp_${crypto.randomUUID().replace(/-/g, "")}`;
      clientRegistry.set(`token_${accessToken}`, {
        client_id: clientId,
        scope: "mcp:admin",
        workspace_id: "admin",
        user_id: "bootstrap",
        installation_id: "bootstrap",
        expires_at: Date.now() + 3600000,
        is_bootstrap: true,
      });
      
      return new Response(JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: "mcp:admin",
      }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "invalid_client" }), { 
      status: 401, headers: { "content-type": "application/json" } 
    });
  }
  
  return new Response(JSON.stringify({ error: "unsupported_grant_type" }), { 
    status: 400, headers: { "content-type": "application/json" } 
  });
}

export async function introspectHandler(request, env) {
  const body = await request.json();
  const token = body.token;
  const tokenData = clientRegistry.get(`token_${token}`);
  
  if (!tokenData || tokenData.expires_at < Date.now()) {
    return new Response(JSON.stringify({ active: false }), {
      headers: { "content-type": "application/json" },
    });
  }
  
  return new Response(JSON.stringify({
    active: true,
    scope: tokenData.scope,
    client_id: tokenData.client_id,
    username: tokenData.user_id,
    workspace_id: tokenData.workspace_id,
    installation_id: tokenData.installation_id,
    exp: Math.floor(tokenData.expires_at / 1000),
  }), {
    headers: { "content-type": "application/json" },
  });
}

export function resolveIdentityFromToken(token, env) {
  const tokenData = clientRegistry.get(`token_${token}`);
  if (!tokenData || tokenData.expires_at < Date.now()) {
    return null;
  }
  return {
    provider: "oauth",
    workspaceId: tokenData.workspace_id,
    userId: tokenData.user_id,
    installationId: tokenData.installation_id,
    agentId: tokenData.agent_id || "default-agent",
    conversationId: null,
  };
}