import { NextResponse } from 'next/server';
import type { SessionUser } from './session';
import { handleRpc } from './mcp';
import { APP_URL } from './social/accounts';
import { rateLimit } from './rate-limit';

/** HTTP side of the MCP server (POST JSON-RPC, single message or batch). */
export async function mcpPost(req: Request, user: SessionUser | null): Promise<Response> {
  if (!user) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: `Unauthorized: create a token in ${APP_URL}/fr/dashboard/integrations and send it as "Authorization: Bearer syn_…"` } },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="synthia"' } });
  }
  if (!rateLimit(`mcp:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32002, message: 'Too many requests' } }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
  const list = Array.isArray(body) ? body.slice(0, 20) : [body];
  const out = (await Promise.all(list.map((m) => handleRpc(user, m as never)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? out : out[0], { headers: { 'Cache-Control': 'no-store' } });
}

/** This server does not push messages: no SSE stream (allowed by the Streamable HTTP spec). */
export const mcpGet = () => new Response('Synthia MCP endpoint: send JSON-RPC with POST.', {
  status: 405, headers: { Allow: 'POST', 'Content-Type': 'text/plain' } });
