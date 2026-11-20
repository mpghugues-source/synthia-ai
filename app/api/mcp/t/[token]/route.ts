import { userFromToken } from '@/lib/api-auth';
import { mcpPost, mcpGet } from '@/lib/mcp-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/**
 * Same MCP server with the token in the URL, for clients that cannot send a header (some ChatGPT / no-code
 * connectors). Treat this URL like a password; revoking the token disables it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return mcpPost(req, await userFromToken(token));
}
export const GET = mcpGet;
