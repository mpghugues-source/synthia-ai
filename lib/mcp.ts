import type { SessionUser } from './session';
import { APP_URL } from './social/accounts';
import { VIDEO_PROVIDERS, TEXT_PROVIDERS } from './ai/providers';
import {
  AgentError, agentListVideos, agentGetVideo, agentAccounts, agentImportUrl, agentGenerate, agentPublish, agentWrite,
} from './agent-api';

/**
 * Synthia MCP server (Model Context Protocol, "Streamable HTTP" transport, stateless JSON responses).
 * Any MCP client can connect: Claude Code, Claude Desktop / claude.ai, ChatGPT (connectors), Gemini CLI,
 * Cursor, VS Code / Copilot, Windsurf, n8n… Auth: personal access token (Bearer syn_…).
 */

export const MCP_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = { name: 'synthia', title: 'Synthia AI', version: '1.0.0' };

const INSTRUCTIONS = `Synthia is a video studio. With these tools you can: see the user's connected social networks and AI keys,
list their videos, import a finished video (made by you, Remotion, Higgsfield, CapCut, Kling…) from a public https URL,
generate a new AI video with the user's own key (${VIDEO_PROVIDERS.join(', ')}), write hooks/titles/captions/hashtags,
and publish or schedule a ready video on YouTube, TikTok, Instagram, Facebook and X.
To upload a LOCAL file instead of a URL, run:
  curl -H "Authorization: Bearer $SYNTHIA_TOKEN" -F file=@video.mp4 -F title="My title" ${APP_URL}/api/v1/videos/upload
(max 100 MB; returns the video id). Videos are processed asynchronously: call get_video until status is "ready"
before publishing. Always confirm with the user before publishing publicly.`;

type Json = Record<string, unknown>;
interface Tool { name: string; title: string; description: string; inputSchema: Json; annotations?: Json; run: (u: SessionUser, a: Json) => Promise<unknown> }

const PLATFORM_ENUM = ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter'];

const TOOLS: Tool[] = [
  {
    name: 'get_connections', title: 'Connected accounts and AIs',
    description: 'Which social networks the user can publish to and which AI providers (with their own API keys) are connected.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: (u) => agentAccounts(u),
  },
  {
    name: 'list_videos', title: 'List videos',
    description: "List the user's most recent Synthia videos with their status (rendering, ready, failed) and publication state.",
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: (u, a) => agentListVideos(u, Number(a.limit) || 20),
  },
  {
    name: 'get_video', title: 'Get a video',
    description: 'Status of one video (poll this after import, generation or publication; publishResults holds the links to the posts).',
    inputSchema: { type: 'object', properties: { videoId: { type: 'string' } }, required: ['videoId'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: (u, a) => agentGetVideo(u, String(a.videoId)),
  },
  {
    name: 'import_video_from_url', title: 'Import a video',
    description: 'Import a finished video from a public https URL (mp4, mov, webm; max 1 GB) into the user\'s Synthia library, ready to publish.',
    inputSchema: { type: 'object', properties: {
      url: { type: 'string', description: 'Public https link to the video file' },
      title: { type: 'string' }, description: { type: 'string', description: 'Text used as the post description' },
      hashtags: { type: 'array', items: { type: 'string' } },
      source: { type: 'string', description: 'Tool that made it, e.g. claude-code, higgsfield, capcut' },
    }, required: ['url'], additionalProperties: false },
    run: (u, a) => agentImportUrl(u, a),
  },
  {
    name: 'generate_ai_video', title: 'Generate an AI video',
    description: `Generate a video from a text prompt with one of the user's connected video AIs (${VIDEO_PROVIDERS.join(', ')}); billed by that provider on the user's own key.`,
    inputSchema: { type: 'object', properties: {
      provider: { type: 'string', enum: VIDEO_PROVIDERS },
      prompt: { type: 'string', description: 'Scene description (subject, action, camera, style, lighting)' },
      aspect: { type: 'string', enum: ['9:16', '16:9', '1:1'], default: '9:16' },
      duration: { type: 'integer', minimum: 3, maximum: 30, default: 5, description: 'Seconds (each model rounds to what it supports)' },
      model: { type: 'string', description: 'Optional model (e.g. kling-4.0, or a Replicate slug like google/veo-3)' },
      title: { type: 'string' },
    }, required: ['provider', 'prompt'], additionalProperties: false },
    run: (u, a) => agentGenerate(u, a),
  },
  {
    name: 'write_copy', title: 'Write hooks, titles, captions',
    description: 'Viral copywriting: hooks, titles (A/B), captions per network, 14-day ideas, rewrite, translate, hashtags.',
    inputSchema: { type: 'object', properties: {
      tool: { type: 'string', enum: ['hooks', 'titles', 'captions', 'ideas', 'rewrite', 'translate', 'hashtags'] },
      input: { type: 'string', description: 'Topic or script' },
      lang: { type: 'string', enum: ['fr', 'en', 'es', 'pt', 'sw', 'de', 'it', 'ar'], default: 'fr' },
      platform: { type: 'string' }, targetLang: { type: 'string' },
      engine: { type: 'string', enum: ['synthia', ...TEXT_PROVIDERS], default: 'synthia', description: 'Which AI writes (the user\'s own key)' },
    }, required: ['tool', 'input'], additionalProperties: false },
    run: (u, a) => agentWrite(u, a),
  },
  {
    name: 'publish_video', title: 'Publish or schedule a video',
    description: 'Publish a ready video now, or at scheduledAt, on the user\'s connected networks. Ask the user before publishing publicly.',
    inputSchema: { type: 'object', properties: {
      videoId: { type: 'string' },
      platforms: { type: 'array', items: { type: 'string', enum: PLATFORM_ENUM }, minItems: 1 },
      caption: { type: 'string', description: 'Post text / description' },
      youtubePrivacy: { type: 'string', enum: ['public', 'unlisted', 'private'], default: 'public' },
      tiktokPrivacy: { type: 'string', description: 'TikTok privacy level (PUBLIC_TO_EVERYONE, SELF_ONLY…). Omit to send it to the TikTok inbox as a draft.' },
      scheduledAt: { type: 'string', description: 'ISO date-time in the future to schedule instead of publishing now' },
    }, required: ['videoId', 'platforms'], additionalProperties: false },
    annotations: { destructiveHint: false, openWorldHint: true },
    run: (u, a) => agentPublish(u, a),
  },
];

interface RpcReq { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json }

const ok = (id: RpcReq['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: RpcReq['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Handle one JSON-RPC message; returns null for notifications (no response). */
export async function handleRpc(user: SessionUser, m: RpcReq): Promise<Json | null> {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return fail(m?.id, -32600, 'Invalid Request');
  const isNotification = m.id === undefined || m.id === null;
  if (m.method.startsWith('notifications/')) return null;
  switch (m.method) {
    case 'initialize': {
      const asked = String(m.params?.protocolVersion ?? '');
      return ok(m.id, {
        protocolVersion: MCP_PROTOCOLS.includes(asked) ? asked : MCP_PROTOCOLS[1],
        capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return ok(m.id, {});
    case 'tools/list':
      return ok(m.id, { tools: TOOLS.map(({ run: _run, ...t }) => t) });
    case 'tools/call': {
      const name = String(m.params?.name ?? '');
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(m.id, -32602, `Unknown tool: ${name}`);
      const args = (m.params?.arguments && typeof m.params.arguments === 'object' ? m.params.arguments : {}) as Json;
      try {
        const out = await tool.run(user, args);
        return ok(m.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: (Array.isArray(out) ? { items: out } : out) as Json, isError: false });
      } catch (e) {
        const msg = e instanceof AgentError ? `${e.code}: ${e.message}` : 'Internal error, please retry';
        if (!(e instanceof AgentError)) console.error('[mcp]', name, e);
        return ok(m.id, { content: [{ type: 'text', text: msg }], isError: true });
      }
    }
    default:
      return isNotification ? null : fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}
