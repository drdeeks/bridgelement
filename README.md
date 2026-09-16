# Bridgelement

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg?style=flat-square)](https://workers.cloudflare.com/)
[![D1 Database](https://img.shields.io/badge/D1-Database-blue.svg?style=flat-square)](https://developers.cloudflare.com/d1/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg?style=flat-square)](https://modelcontextprotocol.io/)
[![Provider Agnostic](https://img.shields.io/badge/Provider-Agnostic-success.svg?style=flat-square)](#)

**Bridgelement** is a standalone, provider-agnostic MCP (Model Context Protocol) bridge that delivers policy enforcement, identity resolution, persistent storage, and telemetry collection for any LLM provider, agent framework, or local daemon. It is a complete, independently deployable product.

The bridge works with any MCP-compatible client.

## Endpoints

**Production:** `https://bridgelement.drdeeks.xyz/mcp`

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/mcp` | GET | Public | Tools discovery (MCP `tools/list`) |
| `/mcp` | POST | Required | MCP JSON-RPC (`tools/call`, `initialize`, etc.) |
| `/health` | GET | Public | Health check + version |
| `/.well-known/oauth-authorization-server` | GET | Public | OAuth 2.0 Authorization Server Metadata (RFC 8414) |
| `/.well-known/mcp` | GET | Public | MCP Server Metadata |
| `/.well-known/jwks.json` | GET | Public | JSON Web Key Set |
| `/oauth/register` | POST | Public | Dynamic Client Registration (RFC 7591) |
| `/oauth/authorize` | GET | User | Authorization Endpoint (PKCE) |
| `/oauth/token` | POST | Client | Token Endpoint |
| `/oauth/introspect` | POST | Client | Token Introspection (RFC 7662) |
| `/events` | POST | Required | Batch telemetry ingestion |

## Quick Start

### Local Development

```bash
# From the plugin directory
cd plugins/bridgelement
npm install
npm test
```

### Deploy to Cloudflare Workers

1. **Create D1 database** and note its ID
2. **Configure `wrangler.jsonc`** with the D1 database ID
3. **Run migrations**:
   ```bash
   npx wrangler d1 migrations apply ack-universal
   ```
4. **Set Worker secrets** (via `wrangler secret put` or dashboard):
   - `ACK_BOOTSTRAP_TOKEN` — Admin bootstrap token (NOT a user identity)
   - `ACK_PROVIDER` — Provider identity (default: `agnostic`)
   - `ACK_DEFAULT_AGENT` — Default agent ID (default: `default-agent`)
5. **Deploy**:
   ```bash
   npx wrangler deploy
   ```
6. **Point any MCP client** at `https://bridgelement.drdeeks.xyz/mcp`

### MCP Client Configuration

```json
{
  "mcpServers": {
    "bridgelement": {
      "command": "npx",
      "args": ["mcp-remote", "https://bridgelement.drdeeks.xyz/mcp"]
    }
  }
}
```

Or via HTTP transport directly.

## What This Is

- **Cloudflare Worker** `fetch` handler at `POST /mcp` (and `GET /mcp` for tools discovery)
- **D1 schema** in `migrations/` (MemoryStore for local testing)
- **Identity** derived from the authenticated connection, never from `user_id` arguments supplied by the model
- **Enforcement** via vendored `evaluatePolicy` engine — same logic as local daemons
- **Fail-closed** storage/worker failures return `decision: unavailable`, never `allow`
- **No** `@modelcontextprotocol/sdk`, **no** Apps SDK widget, **no** nested MCP server

## Why It Exists

LLM providers and agent frameworks need a neutral, auditable enforcement layer that:
1. **Resolves identity** from the actual authenticated connection (OAuth, JWT, Access, etc.)
2. **Evaluates policy** against versioned profiles stored in durable storage
3. **Emits canonical telemetry** for RL, evaluation, analytics, replay, and dataset generation
4. **Runs anywhere** — Cloudflare Workers, Node.js, Deno, Bun — with the same logic
5. **Depends on nothing** — zero external npm dependencies for core enforcement

## Contracts, Schemas & Protocols

### MCP Contract (`vendor/mcp-contract`)

Defines the complete MCP tool surface exposed by the bridge:

| Tool | Purpose |
|------|---------|
| `ack_get_status` | Current mode, profile, provider, installation |
| `ack_get_active_profile` | Full active profile |
| `ack_list_profiles` | All profiles for the tenant |
| `ack_get_policy` | Resolved policy for a profile |
| `ack_get_recent_decisions` | Decision history |
| `ack_create_profile` / `ack_update_profile` / `ack_select_profile` | Profile management |
| `ack_configure_habit` | Habit configuration |
| `ack_set_enforcement_mode` | Switch enforcement mode |
| `ack_check_action` | **Core enforcement** — evaluates tool/command against policy |
| `ack_acknowledge_hold` | Acknowledge a held action |
| `ack_record_decision` | Record an external decision |
| `ack_ingest_event` / `ack_list_events` | Telemetry ingestion & query |
| `ack_register_component` / `ack_list_components` | Component registry |
| `ack_register_attribute` / `ack_list_attributes` | Attribute registry |
| `ack_register_event_schema` / `ack_list_event_schemas` | Event schema registry |
| `ack_record_intervention` / `ack_list_interventions` | Intervention log |
| `ack_report_watchdog_state` | Watchdog lease reporting |
| `ack_export_user_data` / `ack_delete_user_data` | GDPR/export |
| `ack_revoke_installation` | Revoke installation |

Each tool has a complete JSON Schema (`inputSchema` / `outputSchema`) for MCP introspection.

### Config Schema (`vendor/config-schema`)

Validates and normalizes profile structures:

- `defaultProfile(input)` — Returns a complete profile with defaults
- `validateProfile(input)` — Returns `{ ok, profile?, errors[] }`
- `profileToPolicy(profile)` — Compiles profile → policy for `evaluatePolicy`

### Protocol (`vendor/protocol`)

Core protocol constants and effects:

- `EFFECTS = { ALLOW, DENY, HOLD }`
- `EVENT_TYPE` — Canonical event type enum
- Policy evaluation result shape

### Events (`vendor/events`)

Telemetry event infrastructure:

- `EVENT_TYPE` — All canonical event types (session, episode, task, run, policy, tool, habit, ack, protocol, component, attribute, schema, intervention, watchdog)
- `createEventSink(service, env, store, identity)` — Creates a sink for appending events
- `redact(payload)` — PII redaction for event payloads

### Core (`vendor/core`)

Policy engine:

- `evaluatePolicy({ tool, command }, policy)` — Returns `{ effect, decisionId, reasonCodes }`
- `profileToPolicy(profile)` — Compiles profile → policy object

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Bridgelement                          │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │   Identity   │  │   Enforcement    │  │     Storage      │   │
│  │  Resolution  │──▶│  (evaluatePolicy)│◀──│  (D1 / Memory)   │   │
│  │  (agnostic)  │  │   (vendored)     │  │   (pluggable)    │   │
│  └──────────────┘  └──────────────────┘  └──────────────────┘   │
│         │                  │                     │               │
│         ▼                  ▼                     ▼               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Telemetry Collection                   │   │
│  │  enforcement_events (D1) / JSONL (local) / custom sink   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Request arrives** at `POST /mcp` with MCP JSON-RPC
2. **Identity resolved** from headers (OAuth, CF Access, test header, etc.)
3. **Tool dispatched** to handler in `tools.js`
4. **Profile loaded** from storage (D1 or Memory)
5. **Policy evaluated** via vendored `evaluatePolicy`
6. **Decision recorded** in `tool_decisions` table
7. **RL event emitted** to `enforcement_events` with hierarchical IDs
8. **Response returned** to client with decision + telemetry metadata

### Hierarchical Event IDs

Every event carries full hierarchy for RL traceability:
```
sessionId → episodeId → taskId → runId
```

Counterfactual `proposedAction` is always recorded alongside the actual decision.

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `ACK_EVENT_SERVICE` | Service identity for telemetry | `agnostic` |
| `ACK_EVENT_SINK` | Event sink: `local`, `d1`, `both` | `d1` (bridge) |
| `ACK_EVENT_URL` | D1 Worker endpoint for local→hosted | — |
| `ACK_BOOTSTRAP_TOKEN` | Admin bootstrap token (NOT user identity) | — |
| `ACK_PROVIDER` | Provider identity for identity resolution | `agnostic` |
| `ACK_DEFAULT_AGENT` | Default agent ID when not provided | `default-agent` |
| `ACK_DEFAULT_WORKSPACE_ID` | Default workspace for CF Access auth | — |

## Project Structure

```
plugins/bridgelement/
├── src/
│   ├── index.js              # Worker entry point (fetch handler)
│   ├── mcp.js                # MCP protocol handler (JSON-RPC)
│   ├── auth.js               # Identity extraction from request
│   ├── oauth.js              # OAuth 2.0 / OIDC endpoints
│   ├── enforcement.js        # Policy evaluation (vendored engine)
│   ├── ids.js                # ID generation utilities
│   ├── rl-events.js          # Telemetry event building & emission
│   ├── tools.js              # MCP tool definitions & handlers
│   └── storage/
│       ├── d1.js             # D1 storage adapter (production)
│       └── memory.js         # In-memory storage (tests/local)
├── migrations/
│   ├── 0001_init.sql         # Core schema (workspaces, users, profiles, decisions)
│   ├── 0001_init_down.sql    # Rollback for 0001
│   ├── 0002_rl_events.sql    # RL events table (enforcement_events)
│   ├── 0002_rl_events_down.sql  # Rollback for 0002
│   ├── 0003_universal_telemetry.sql  # Telemetry registry
│   └── 0003_universal_telemetry_down.sql  # Rollback for 0003
├── vendor/
│   ├── mcp-contract/         # MCP tool definitions & schemas
│   ├── config-schema/        # Profile validation & policy compilation
│   ├── protocol/             # Core protocol constants & effects
│   ├── events/               # Event types, sinks, redaction
│   └── core/                 # Policy engine (evaluatePolicy)
├── wrangler.jsonc            # Cloudflare Worker configuration
├── package.json
├── AGENTS.md                 # Agent-facing architecture & gotchas
└── README.md                 # This file
```

## Integration

### As an MCP Server

Any MCP-compatible client can connect:

```json
{
  "mcpServers": {
    "bridgelement": {
      "command": "npx",
      "args": ["mcp-remote", "https://bridgelement.drdeeks.xyz/mcp"]
    }
  }
}
```

Or via HTTP transport directly.

### As a Library

Import individual modules for custom integrations:

```javascript
import { evaluatePolicy } from './vendor/core/src/index.js';
import { defaultProfile, validateProfile } from './vendor/config-schema/src/profile.js';
import { EVENT_TYPE, createEventSink } from './vendor/events/src/index.js';
```

### Identity Integration

The bridge extracts identity from:
- **OAuth 2.0 Bearer tokens** (via `/.well-known/oauth-authorization-server` discovery)
- **Cloudflare Access**: `cf-access-authenticated-user-email` + `x-ack-workspace-id`
- **Test header**: `x-ack-test-identity` (when `ACK_ALLOW_TEST_IDENTITY=1`)
- **Bootstrap token**: `Authorization: Bearer <token>` (admin only, NOT user identity)

Model-supplied `user_id` / `workspace_id` in tool arguments are **always ignored**.

## Authentication & Discovery

The bridge implements OAuth 2.0 / OIDC discovery for MCP clients:

- `GET /.well-known/oauth-authorization-server` — Authorization server metadata
- `GET /.well-known/mcp` — MCP server metadata and capabilities
- `GET /.well-known/jwks.json` — JSON Web Key Set
- `POST /oauth/register` — Dynamic client registration
- `GET /oauth/authorize` — Authorization endpoint
- `POST /oauth/token` — Token endpoint (authorization_code, refresh_token, client_credentials)
- `POST /oauth/introspect` — Token introspection

Supported scopes: `mcp:read`, `mcp:write`, `mcp:tools`

## Telemetry

All enforcement decisions emit canonical events to `enforcement_events` (D1) with:

- Full hierarchical IDs: `sessionId → episodeId → taskId → runId`
- Counterfactual `proposedAction` for RL training
- Redacted payloads (PII stripped via `redact()`)
- Versioned schemas via telemetry registry

Query via `ack_list_events` MCP tool or `POST /events` for batch ingestion.

## License

MIT © @the-federation/bridgelement
