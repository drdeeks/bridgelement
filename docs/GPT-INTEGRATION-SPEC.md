# Agent Character Kit: ChatGPT Integration Specification

Status: definitive implementation target
Date: 2026-09-13

## 1. Purpose

Agent Character Kit (ACK) must integrate with ChatGPT as a hosted application. ChatGPT users must not need a local daemon, `install.sh`, localhost ports, Cloudflare CLI knowledge, or an understanding of MCP.

The ChatGPT integration is a remote, authenticated MCP application backed by a Cloudflare Worker and persistent per-user configuration. The existing local installer remains valid for Codex and local harnesses, but it is not the ChatGPT execution path.

## 2. Required Architecture

```text
ChatGPT custom app
        |
        | HTTPS + OAuth/authenticated MCP
        v
ACK ChatGPT Worker / MCP endpoint
        |
        +-- authenticated tenant and user resolution
        +-- policy/profile lookup
        +-- enforcement engine
        +-- audit and watchdog events
        |
        +--> D1: durable relational configuration and audit records
        +--> Durable Object: serialized session/hold/watchdog state when needed
        +--> Queues/Workflows: asynchronous retries, notifications, repair jobs
```

### Implementation Details
The implementation is hosted in `plugins/mcp-bridgelement/`. It implements the "Required Architecture" defined here, ensuring that identity is derived from OAuth and configuration is stored in D1.

### Deployment Path
1. **Endpoint**: Must be publicly reachable over HTTPS (e.g., `https://ack.example.com/mcp`).
2. **Authentication**: OAuth identity determines the ACK user and workspace automatically.
3. **Tooling**: ChatGPT connects via the MCP protocol; the Bridge scans tools and enforces the ACK contract.
