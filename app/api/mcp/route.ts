import { userFromToken } from '@/lib/api-auth';
import { mcpPost, mcpGet } from '@/lib/mcp-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/**
 * MCP endpoint: https://synthia.ikelyane.com/api/mcp  — header "Authorization: Bearer syn_…".
 * Claude Code: claude mcp add --transport http synthia https://synthia.ikelyane.com/api/mcp --header "Authorization: Bearer syn_…"
 */
export async function POST(req: Request) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  return mcpPost(req, m ? await userFromToken(m[1]) : null);
}
export const GET = mcpGet;
export async function DELETE() { return new Response(null, { status: 405 }); }
