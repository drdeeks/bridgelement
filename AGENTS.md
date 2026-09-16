# MCP Bridgelement - Agent Architecture & Operations Guide

## Role & Purpose

**MCP Bridgelement** (`@the-federation/mcp-bridgelement@0.1.0`) is a **standalone, provider-agnostic MCP bridge** — a complete, independently deployable product. It has zero required dependencies on any external ecosystem.

It provides:
1. **Identity Resolution** — Maps provider-specific auth (OAuth, JWT, CF Access, custom headers) to universal tenant/user/installation IDs
2. **Policy Enforcement** — Runs vendored `evaluatePolicy` engine against versioned profiles
3. **Telemetry Collection** — Emits canonical RL events with hierarchical IDs to durable storage
4. **Storage Abstraction** — Pluggable adapters (D1 production, Memory tests, custom)

## Critical Architecture Invariants

| Invariant | Enforcement |
|-----------|-------------|
| **Identity from connection, never model args** | `auth.js` ignores `user_id`/`workspace_id` in tool args; `ignoreModelIdentity()` strips them |
| **Fail-closed on storage failure** | `enforcement.js` returns `decision: unavailable` on any storage error |
| **Zero npm deps for core** | All enforcement/schema/protocol/events/core code is **vendored** under `vendor/` |
| **Hierarchical event IDs** | Every event: `sessionId → episodeId → taskId → runId` + counterfactual `proposedAction` |
| **Provider-agnostic** | No provider-specific logic; `ACK_PROVIDER` defaults to `agnostic` |

## Repository State (v0.1.0)

- **Package**: `@the-federation/mcp-bridgelement@0.1.0`
- **Worker endpoint**: `bridgelement.drdeeks.xyz` (via `ack-universal.drdeeks.workers.dev`)
- **D1 database**: `ack-universal`
- **All 14 tests pass**: `npm test` → green

## Gotchas & Overlooked Details

### 1. Auth Middleware Placement
`resolveIdentity()` is called in `index.js` **per-route**, not globally. `/health` and `GET /mcp` return `null` identity (public). POST `/mcp` and POST `/events` **require** valid identity → 401 if missing.

### 2. Test Identity Header
Tests **must** pass `x-ack-test-identity` header AND `ACK_ALLOW_TEST_IDENTITY=1` in env. The test helper in `hosted.test.js` does this via `mcp()` wrapper.

### 3. Vendored Imports Are Absolute From Source Root
```
src/tools.js          →  ../vendor/mcp-contract/src/hosted-tools.js
src/rl-events.js      →  ../vendor/events/src/index.js
src/enforcement.js    →  ../vendor/core/src/index.js, ../vendor/protocol/src/index.js, ../vendor/config-schema/src/profile.js
src/storage/*.js      →  ../../vendor/config-schema/src/profile.js
```
**Never** use external package specifiers — they don't exist in this package.

### 4. D1 Migrations Must Match Storage Code
- `0001_init.sql` — core tables (workspaces, users, profiles, decisions, holds, acks, agents, bindings, watchdog, audit)
- `0002_rl_events.sql` — `enforcement_events` with ALL hierarchical columns
- `0003_universal_telemetry.sql` — component/attribute/schema/intervention registry
Storage code (`d1.js`) assumes exact column names. Drift = runtime errors.

### 5. Rate Limiting Is Per-User/Minute In-Memory
`D1Store.rateLimitWrite()` uses a `Map` keyed by `${userId}:${minute}`. Resets on worker restart. Not distributed.

### 6. Bootstrap Token ≠ User Identity
`ACK_BOOTSTRAP_TOKEN` in `Authorization: Bearer` header throws `AuthError("bootstrap token is not a user identity")`. It's for admin setup only.

### 7. Event Redaction Happens At Sink, Not Build
`buildRlEvent()` calls `redact()` on payload fields. The sink (`createEventSink`) may apply additional redaction. Don't assume raw payloads reach storage.

### 8. `profileToPolicy` Is The Single Compilation Path
`enforcement.js` imports `profileToPolicy` from vendored `config-schema`. Profiles → Policy → `evaluatePolicy`. No alternate paths.

### 9. Watchdog Lease Is Monotonic
`reportWatchdog()` only increments `lease_version`. Clients sending stale versions get current state back (no update).

### 10. Component/Attribute/Schema Registry Is Workspace-Scoped
Telemetry registry tables are keyed by `workspace_id`. No cross-workspace visibility.

## Key Files Quick Reference

| File | Responsibility |
|------|----------------|
| `src/index.js` | Worker fetch handler, routing, per-route auth |
| `src/auth.js` | Identity extraction, test header, CF Access, bootstrap token |
| `src/mcp.js` | JSON-RPC dispatch, `tools/list`, `tools/call` |
| `src/tools.js` | 26 MCP tool implementations, all tenant-scoped |
| `src/enforcement.js` | `checkAction`, `acknowledge`, `unavailable` — thin wrapper over vendored engine |
| `src/rl-events.js` | `buildRlEvent`, `emitRlEvent`, `decisionEventType` mapping |
| `src/storage/d1.js` | Production D1 adapter, all SQL, tenant enforcement |
| `src/storage/memory.js` | Test/local adapter, same interface as D1 |
| `src/ids.js` | `newId(prefix)`, `nowIso()` |
| `vendor/*/src/*.js` | **Vendored** — do not edit; update by re-vendoring from source |

## Test Coverage (Hosted Tests)

| Test | What It Verifies |
|------|------------------|
| `tools/list` | All 26 tools exposed with schemas |
| `identity from connection` | Model `user_id` ignored; connection identity wins |
| `tenant isolation` | User A cannot read User B's profiles |
| `rm -rf denied` | Hard rule via shared PolicyEngine |
| `fail-closed hold/ack` | Habit requires ack → hold → valid ack → acknowledge |
| `missing auth = 401` | POST `/mcp` without identity → 401; `/health` → 200 |
| `storage failure = unavailable` | Mock storage error → `decision: unavailable` |
| `export/delete tenant-scoped` | User A delete doesn't affect User B |
| `check_action → RL events` | Events written to `enforcement_events` with correct type |
| `ingest workspace-visible` | Events visible to workspace, not cross-tenant |
| `telemetry registry` | Components, attributes, schemas, interventions CRUD |
| `POST /events batch` | Batch ingest with partial acceptance |
| `store factory` | Injected > D1 > Memory fallback |
| `provider/agent configurable` | `ACK_PROVIDER`, `ACK_DEFAULT_AGENT` env vars work |

## Deployment Checklist

- [ ] D1 database created, ID in `wrangler.jsonc`
- [ ] Migrations applied: `wrangler d1 migrations apply ack-universal`
- [ ] Secrets set: `ACK_BOOTSTRAP_TOKEN`, `ACK_PROVIDER`, `ACK_DEFAULT_AGENT`
- [ ] `npm test` passes locally
- [ ] `wrangler deploy` succeeds
- [ ] `GET https://<host>/health` → `{ ok: true, version: "1.9.1" }`
- [ ] `GET https://<host>/mcp` → tools list with 26 entries
- [ ] `POST https://<host>/mcp` without auth → 401
- [ ] `POST https://<host>/mcp` with test header → works

## Version Lock

| Component | Version | Source |
|-----------|---------|--------|
| `@the-federation/mcp-bridgelement` | 0.1.0 | This package |
| Vendored core | snapshot | Internal vendored copy |
| `ACK_VERSION` constant | 1.9.1 | Returned by `/health`, used in telemetry |

**Never** publish a bridge version that doesn't match its vendored snapshot.