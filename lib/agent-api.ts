import type { SessionUser } from './session';
import { listProjects, getProject, updateProject, getBrandKit, type Project } from './projects';
import { publishProject, sanitizePlatforms, sanitizeOptions, connectedPlatforms } from './publish';
import { importFromUrl } from './media-import';
import { startGeneration } from './ai/video-jobs';
import { listConnections, textEngineFor, VIDEO_PROVIDERS, PROVIDERS, type Provider } from './ai/providers';
import { viralTool, withTextEngine, LANG_NAMES, type ViralTool } from './groq';
import { APP_URL } from './social/accounts';
import { rateLimit } from './rate-limit';

/**
 * What an external AI (Claude Code, ChatGPT, Gemini CLI, Cursor… through MCP or the REST API v1) can do
 * for a user. Every call is scoped to that user, exactly like the dashboard.
 */

export class AgentError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function videoSummary(p: Project) {
  return {
    id: p.id, title: p.title, status: p.status, origin: p.mode, source: p.source, duration: p.duration,
    qualityCheck: p.qaStatus, approved: Boolean(p.approvedAt), qaReport: p.qaReport,
    resolution: p.resolution, error: p.error, publishStatus: p.publishStatus, scheduledAt: p.scheduledAt,
    platforms: p.platforms, publishResults: p.publishResults, createdAt: p.createdAt,
    libraryUrl: `${APP_URL}/fr/dashboard/library`,
  };
}

export async function agentListVideos(u: SessionUser, limit = 20) {
  return (await listProjects(u.id, { limit: Math.min(Math.max(limit, 1), 100) })).map(videoSummary);
}

export async function agentGetVideo(u: SessionUser, id: string) {
  const p = typeof id === 'string' ? await getProject(id, u.id) : null;
  if (!p) throw new AgentError('not_found', 'Video not found', 404);
  return videoSummary(p);
}

export async function agentAccounts(u: SessionUser) {
  const [social, ai] = await Promise.all([connectedPlatforms(u.id), listConnections(u.id)]);
  return {
    social, // which networks can be published to
    ai: ai.map((c) => ({ provider: c.provider, textModel: c.textModel, videoModel: c.videoModel })),
    videoProviders: ai.filter((c) => VIDEO_PROVIDERS.includes(c.provider) && c.videoModel).map((c) => c.provider),
    connectMoreAt: `${APP_URL}/fr/dashboard/integrations`,
  };
}

export async function agentImportUrl(u: SessionUser, a: { url?: unknown; title?: unknown; description?: unknown; hashtags?: unknown; source?: unknown }) {
  if (!rateLimit(`import:${u.id}`, 30, 60 * 60_000)) throw new AgentError('rate_limited', 'Too many imports, retry later', 429);
  if (typeof a.url !== 'string') throw new AgentError('bad_request', 'url (https) is required');
  try {
    const id = await importFromUrl(u.id, a.url, {
      title: typeof a.title === 'string' ? a.title : null, description: typeof a.description === 'string' ? a.description : null,
      hashtags: Array.isArray(a.hashtags) ? a.hashtags.filter((h): h is string => typeof h === 'string') : [],
      source: typeof a.source === 'string' ? a.source.slice(0, 40) : 'url',
    });
    return { id, status: 'rendering', note: 'Downloading and checking the video; poll get_video until status is "ready".' };
  } catch (e) {
    throw new AgentError((e as Error).message, `Import refused: ${(e as Error).message}`);
  }
}

export async function agentGenerate(u: SessionUser, a: { provider?: unknown; prompt?: unknown; aspect?: unknown; duration?: unknown; model?: unknown; title?: unknown }) {
  if (!rateLimit(`gen:${u.id}`, 20, 60 * 60_000)) throw new AgentError('rate_limited', 'Too many generations, retry later', 429);
  const provider = a.provider as Provider;
  if (!PROVIDERS.includes(provider) || !VIDEO_PROVIDERS.includes(provider)) throw new AgentError('bad_request', `provider must be one of ${VIDEO_PROVIDERS.join(', ')}`);
  if (typeof a.prompt !== 'string' || a.prompt.trim().length < 5) throw new AgentError('bad_request', 'prompt is required');
  const aspect = a.aspect === '16:9' || a.aspect === '1:1' ? a.aspect : '9:16';
  const duration = Math.min(30, Math.max(3, Number(a.duration) || 5));
  try {
    const id = await startGeneration(u.id, provider, { prompt: a.prompt.trim(), aspect, duration,
      model: typeof a.model === 'string' ? a.model : undefined, title: typeof a.title === 'string' ? a.title : undefined });
    return { id, status: 'rendering', note: 'The AI is generating the video (usually 1 to 10 minutes); poll get_video.' };
  } catch (e) {
    const m = (e as Error).message;
    if (m === 'not_connected') throw new AgentError(m, `Connect your ${provider} API key first: ${APP_URL}/fr/dashboard/integrations`, 409);
    if (m === 'invalid_key') throw new AgentError(m, `The ${provider} key was refused; reconnect it in Synthia`, 409);
    throw new AgentError('provider_error', m.slice(0, 300), 502);
  }
}

export async function agentPublish(u: SessionUser, a: {
  videoId?: unknown; platforms?: unknown; caption?: unknown; youtubePrivacy?: unknown; tiktokPrivacy?: unknown; scheduledAt?: unknown;
}) {
  if (!rateLimit(`publish:${u.id}`, 10, 10 * 60_000)) throw new AgentError('rate_limited', 'Too many publications, retry in a few minutes', 429);
  const p = typeof a.videoId === 'string' ? await getProject(a.videoId, u.id) : null;
  if (!p) throw new AgentError('not_found', 'Video not found', 404);
  if (p.status !== 'ready') throw new AgentError('not_ready', `Video is ${p.status}, wait until it is ready`, 409);
  if (!p.approvedAt) {
    throw new AgentError('approval_required', `The creator must watch and approve this video in Synthia before it can be published: ${APP_URL}/fr/dashboard/library (an AI cannot approve).`, 409);
  }
  const list = sanitizePlatforms(a.platforms);
  if (!list.length) throw new AgentError('bad_request', 'platforms: youtube, tiktok, instagram, facebook, twitter');
  const connected = await connectedPlatforms(u.id);
  const missing = list.filter((x) => !connected[x]);
  if (missing.length) throw new AgentError('not_connected', `Not connected: ${missing.join(', ')} (${APP_URL}/fr/dashboard/accounts)`, 409);
  // TikTok: without an explicit privacy choice the video goes to the creator's TikTok inbox as a draft.
  const opts = sanitizeOptions({
    caption: a.caption, youtube: { privacy: a.youtubePrivacy },
    tiktok: typeof a.tiktokPrivacy === 'string' ? { mode: 'direct', privacy: a.tiktokPrivacy } : { mode: 'draft' },
  });
  if (typeof a.scheduledAt === 'string' && a.scheduledAt) {
    const when = new Date(a.scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) throw new AgentError('bad_request', 'scheduledAt must be a future ISO date');
    await updateProject(p.id, { platforms: list, publishOptions: opts, scheduledAt: when.toISOString(), publishStatus: 'scheduled', publishResults: null });
    return { id: p.id, publishStatus: 'scheduled', scheduledAt: when.toISOString(), platforms: list };
  }
  await updateProject(p.id, { publishStatus: 'publishing', platforms: list, publishOptions: opts, publishResults: null });
  void publishProject(p, list, opts).catch(async () => {
    await updateProject(p.id, { publishStatus: 'failed', publishResults: [{ success: false, error: 'upload_failed' }] }).catch(() => {});
  });
  return { id: p.id, publishStatus: 'publishing', platforms: list, note: 'Uploading; poll get_video for publishResults (links to the posts).' };
}

const TOOLS: ViralTool[] = ['hooks', 'titles', 'captions', 'ideas', 'rewrite', 'translate', 'hashtags'];

export async function agentWrite(u: SessionUser, a: { tool?: unknown; input?: unknown; lang?: unknown; platform?: unknown; targetLang?: unknown; engine?: unknown }) {
  if (!rateLimit(`viral:${u.id}`, 40, 10 * 60_000)) throw new AgentError('rate_limited', 'Too many requests', 429);
  if (!TOOLS.includes(a.tool as ViralTool)) throw new AgentError('bad_request', `tool must be one of ${TOOLS.join(', ')}`);
  if (typeof a.input !== 'string' || !a.input.trim()) throw new AgentError('bad_request', 'input is required');
  const lang = typeof a.lang === 'string' && LANG_NAMES[a.lang] ? a.lang : 'fr';
  let engine;
  try { engine = await textEngineFor(u.id, a.engine); } catch { throw new AgentError('not_connected', `Text engine ${String(a.engine)} is not connected`, 409); }
  const brand = await getBrandKit(u.id).catch(() => null);
  return withTextEngine(engine, () => viralTool({
    tool: a.tool as ViralTool, input: a.input as string, lang,
    platform: typeof a.platform === 'string' ? a.platform : undefined,
    targetLang: typeof a.targetLang === 'string' && LANG_NAMES[a.targetLang] ? a.targetLang : undefined,
    tone: brand?.tone ?? undefined,
  }));
}
