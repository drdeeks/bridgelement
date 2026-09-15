import { HOSTED_TOOLS } from "../vendor/mcp-contract/src/hosted-tools.js";
import { MemoryStore } from "./storage/memory.js";
import { D1Store } from "./storage/d1.js";
import { handleMcpJsonRpc } from "./mcp.js";
import { resolveIdentity, AuthError } from "./auth.js";
import { buildRlEvent } from "./rl-events.js";

const ACK_VERSION = "1.9.1";

export function createStore(env) {
  if (env.ACK_STORE) return env.ACK_STORE;
  if (env.ACK_DB && typeof env.ACK_DB.prepare === "function") return new D1Store(env.ACK_DB, { provider: env.ACK_PROVIDER });
  return new MemoryStore();
}

async function mcpHandler(request, env) {
  const identity = resolveIdentity(request, env);
  const store = createStore(env);
  const body = await request.json();
  const result = await handleMcpJsonRpc(body, { identity, store, env });
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
}

async function eventsHandler(request, env) {
  const identity = resolveIdentity(request, env);
  const store = createStore(env);
  const body = await request.json();
  const events = body.events || [];
  let accepted = 0;
  for (const e of events) {
    try {
      const event = buildRlEvent(identity, e.eventType, {
        sessionId: e.sessionId,
        episodeId: e.episodeId,
        taskId: e.taskId,
        runId: e.runId,
        source: e.source || "external",
        component: e.component || "ingest",
        payload: e.payload,
      });
      await store.appendEvent(identity, event);
      accepted++;
    } catch {
    }
  }
  return new Response(JSON.stringify({ accepted }), { headers: { "content-type": "application/json" } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, version: ACK_VERSION }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/mcp" || url.pathname === "/mcp/tools") {
      if (request.method === "GET") {
        return new Response(
          JSON.stringify({
            tools: HOSTED_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
          }),
          { headers: { "content-type": "application/json" } }
        );
      }
      if (request.method === "POST") {
        const identity = resolveIdentity(request, env);
        if (!identity) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
        }
        return mcpHandler(request, env);
      }
    }

    if (url.pathname === "/events" && request.method === "POST") {
      const identity = resolveIdentity(request, env);
      if (!identity) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
      }
      return eventsHandler(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};