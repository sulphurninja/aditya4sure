import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildBrainServer } from "@/lib/mcp/brain-server";
import { safeEqual } from "@/lib/server/crypto";
import { env } from "@/lib/server/env";

export const maxDuration = 300;

/**
 * MCP endpoint Claude connects to. Two ways to authenticate with MCP_TOKEN:
 *   - Authorization: Bearer <token>        (Claude Code, Claude desktop via config)
 *   - secret path /api/mcp/<token>         (Claude app custom connectors, which can't send headers)
 * Stateless: a fresh server per request, nothing kept in memory between calls.
 */
async function serve(req: Request, ctx: { params: Promise<{ key?: string[] }> }) {
  const token = env().MCP_TOKEN;
  if (!token) return Response.json({ error: "MCP is off. Set MCP_TOKEN in .env.local." }, { status: 503 });

  const { key } = await ctx.params;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const given = bearer ?? key?.[0] ?? "";
  if ((key?.length ?? 0) > 1 || !given || !safeEqual(given, token)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > 256_000) return Response.json({ error: "too large" }, { status: 413 });

  const server = buildBrainServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } catch (err) {
    console.error("[mcp] error:", err instanceof Error ? err.message.slice(0, 200) : "unknown");
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null }, { status: 500 });
  }
}

export { serve as GET, serve as POST, serve as DELETE };
