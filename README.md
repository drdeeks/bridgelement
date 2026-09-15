# MCP Bridgelement

[![npm version](https://img.shields.io/npm/v/@the-federation/mcp-bridgelement.svg?style=flat-square)](https://www.npmjs.com/package/@the-federation/mcp-bridgelement)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg?style=flat-square)](https://workers.cloudflare.com/)
[![D1 Database](https://img.shields.io/badge/D1-Database-blue.svg?style=flat-square)](https://developers.cloudflare.com/d1/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg?style=flat-square)](https://modelcontextprotocol.io/)
[![Provider Agnostic](https://img.shields.io/badge/Provider-Agnostic-success.svg?style=flat-square)](#)

Global MCP Bridge for standalone applications and agent systems. It provides
provider-neutral policy enforcement, identity, persistent storage, and
telemetry collection for RL, evaluation, analytics, replay, and downstream
dataset generation. ChatGPT is one adapter; it is not the service identity.

Spec: [`../agent-character-kit/GPT-INTEGRATION-SPEC.md`](../agent-character-kit/GPT-INTEGRATION-SPEC.md)

## What this is

- Cloudflare Worker `fetch` handler at `POST /mcp`
- D1 schema in `migrations/0001_init.sql` (MemoryStore in tests)
- Identity from the authenticated connection, never from `user_id` args
- Enforcement via `packages/core` `evaluatePolicy` (same engine as local)
- Fail-closed storage/worker failures return `decision: unavailable`
- No `@modelcontextprotocol/sdk`, no Apps SDK widget, no nested `mcp-server/src`

## Local tests

From the kit root after `npm install`:

```bash
node --test plugins/mcp-bridgelement/src/*.test.js packages/config-schema/src/*.test.js
```

Or from this directory:

```bash
npm test
```

## Deploy (not done until secrets exist)

1. Create a D1 database; put its id in `wrangler.jsonc`.
2. `npx wrangler d1 migrations apply ack-universal`
3. Set Worker secrets (`ACK_BOOTSTRAP_TOKEN` is not a user identity).
4. Deploy a stable HTTPS hostname.
5. Point any compatible MCP client, including ChatGPT, at `https://<host>/mcp`.

Do not put access tokens in D1. Do not present `install.sh` as a ChatGPT
prerequisite.

Telemetry: `ack_ingest_event` / `POST /events` print canonical facts into
D1 (`enforcement_events`). `ack_list_events` lists the workspace.
The bridge defaults to D1; local services default to JSONL and may select
`ACK_EVENT_SINK=local|d1|both`. See `docs/universal-service.md`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Bridgelement                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │   Identity  │  │  Enforcement │  │     Storage        │  │
│  │  (agnostic) │──▶│  (evaluatePolicy)│◀──│  (D1 / Memory)   │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│         │                  │                     │           │
│         ▼                  ▼                     ▼           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Telemetry Collection                    │    │
│  │  enforcement_events (D1) / JSONL (local)            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `ACK_EVENT_SERVICE` | Service identity for telemetry | `agnostic` |
| `ACK_EVENT_SINK` | Event sink: `local`, `d1`, `both` | `d1` (bridge) / `local` (daemon) |
| `ACK_EVENT_URL` | D1 Worker endpoint for local→hosted | — |
| `ACK_BOOTSTRAP_TOKEN` | Admin bootstrap token (not user identity) | — |

## Project Structure

```
plugins/mcp-bridgelement/
├── src/
│   ├── index.js              # Worker entry point
│   ├── mcp.js                # MCP protocol handler
│   ├── auth.js               # Identity extraction
│   ├── enforcement.js        # Policy evaluation
│   ├── ids.js                # ID utilities
│   ├── rl-events.js          # Telemetry events
│   ├── tools.js              # MCP tool definitions
│   └── storage/
│       ├── d1.js             # D1 storage adapter
│       └── memory.js         # In-memory storage (tests)
├── migrations/
│   ├── 0001_init.sql         # Core schema
│   ├── 0002_rl_events.sql    # RL events
│   └── 0003_universal_telemetry.sql  # Universal telemetry
├── wrangler.jsonc            # Cloudflare Worker config
├── package.json
└── README.md
```

## License

MIT © The Federation Society