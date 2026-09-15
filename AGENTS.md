# MCP Bridgelement - Agent & Architecture Guide

## Role & Purpose
The **MCP Bridgelement** is the central, provider-agnostic gateway for the Agent Character Kit (ACK) ecosystem. It decouples the enforcement logic and telemetry collection from any specific LLM provider (ChatGPT, Claude, etc.) or local daemon.

It acts as a "Universal Bridge" that handles:
1. **Identity Resolution:** Mapping provider-specific auth (OAuth/JWT) to universal tenant/user IDs.
2. **Policy Enforcement:** Running the `evaluatePolicy` engine to determine if a tool call is allowed, denied, or held.
3. **Telemetry Sink:** Collecting all enforcement events into a durable D1 database for RL, analytics, and audit.
4. **Storage abstraction:** Managing the persistence of profiles and habits across different environments.

## Architecture

### High-Level Flow
`Client (ChatGPT/Claude/etc.)` $\rightarrow$ `Bridgelement (Worker)` $\rightarrow$ `D1 (Storage)` $\rightarrow$ `Enforcement Engine`

### Key Components
- **`auth.js`**: Extracts identity from the authenticated connection. Defaults to `agnostic` for standalone use.
- **`enforcement.js`**: The core decision engine. It consumes policies from D1 and applies them to the current request context.
- **`rl-events.js`**: The telemetry pipeline. Every decision is recorded as an event for downstream dataset generation and evaluation.
- **`storage/d1.js`**: The production adapter for Cloudflare D1.
- **`mcp.js`**: Implements the Model Context Protocol to expose tools to the LLM.

## Integration for Consumers (e.g., Character Kit)

Other systems access the Bridgelement as a remote MCP server. 

### Configuration
Consumers must provide:
- `ACK_EVENT_SERVICE`: The identity of the service (e.g., `character-kit`).
- `ACK_EVENT_URL`: The endpoint of the Bridgelement Worker.

### Access Pattern
1. **Authentication**: The consumer handles the OAuth flow; the Bridgelement derives the `user_id` from the request.
2. **Enforcement**: The consumer calls the MCP tools (e.g., `ack_check_action`) to verify if a specific action is permitted by the current profile.
3. **Telemetry**: The Bridgelement automatically logs the event; the consumer only needs to provide the context.

## Operational Identity
- **Package**: `@the-federation/mcp-bridgelement`
- **Endpoint**: `bridgelement.drdeeks.xyz` (via `ack-universal.drdeeks.workers.dev`)
- **Database**: `ack-universal` (D1)
