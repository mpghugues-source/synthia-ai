import axios, { type AxiosError } from 'axios';
import type { RowDataPacket } from 'mysql2';
import pool from '../db';
import { encrypt, decrypt } from '../social/accounts';
import type { JsonEngine } from '../groq';

/**
 * Connections to other AIs with the user's OWN API key ("bring your own key"): Synthia calls the provider
 * on the user's behalf and the provider bills the user. Keys are encrypted at rest and never returned.
 *
 *  - Text (scripts, Viral Lab, titles): Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google), Mistral, DeepSeek,
 *    Grok (xAI), Groq, and OpenRouter (one key, hundreds of models from every lab)
 *  - Video generation: Kling AI, Google Veo (Gemini API), Replicate (Kling, Veo, Hailuo, Luma, Wan, Seedance…)
 *  - Every other AI: through the MCP server (/api/mcp) or by importing the video it made
 *
 * Sources checked 2026-11-19: Kling API docs (api-singapore.klingai.com, Bearer API key, POST /text-to-video/<model>,
 * GET /tasks?task_ids=), Gemini API Veo docs (predictLongRunning + operation polling). OpenAI's Sora/Videos API was
 * shut down on 2026-09-24, so ChatGPT is text-only here.
 */

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'mistral' | 'deepseek' | 'xai' | 'groq' | 'openrouter'
  | 'kling' | 'replicate';
export const PROVIDERS: Provider[] = ['anthropic', 'openai', 'gemini', 'mistral', 'deepseek', 'xai', 'groq', 'openrouter', 'kling', 'replicate'];
export const TEXT_PROVIDERS: Provider[] = ['anthropic', 'openai', 'gemini', 'mistral', 'deepseek', 'xai', 'groq', 'openrouter'];
export const VIDEO_PROVIDERS: Provider[] = ['kling', 'gemini', 'replicate'];

/** Providers speaking the OpenAI chat-completions protocol (models list at GET {base}/models). */
const OAI_BASE: Partial<Record<Provider, string>> = {
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com',
  xai: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

const REPLICATE = 'https://api.replicate.com/v1';
/** Popular video models on Replicate (any other "owner/model" slug can be typed in). */
export const REPLICATE_VIDEO_MODELS = [
  'kwaivgi/kling-v2.1', 'google/veo-3', 'google/veo-3-fast', 'minimax/hailuo-02', 'luma/ray-2-720p',
  'wan-video/wan-2.2-t2v-fast', 'bytedance/seedance-1-pro', 'pixverse/pixverse-v4.5',
];
export const isReplicateSlug = (s: string) => /^[a-z0-9][\w.-]{0,60}\/[\w.-]{1,80}$/i.test(s);

const KLING = 'https://api-singapore.klingai.com';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
export const KLING_MODELS = ['kling-4.0', 'kling-2.5-turbo'];

export interface Connection {
  provider: Provider; key: string; textModel: string | null; videoModel: string | null; models: string[];
}
export interface PublicConnection {
  provider: Provider; keyHint: string | null; textModel: string | null; videoModel: string | null;
  textModels: string[]; videoModels: string[]; connectedAt: string; lastUsedAt: string | null;
}

interface Row extends RowDataPacket {
  provider: Provider; key_enc: string; key_hint: string | null; text_model: string | null; video_model: string | null;
  models_json: string | null; created_at: Date; last_used_at: Date | null;
}

const parse = (s: string | null): string[] => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

// ── Model discovery (each provider's own list, so new models appear without a code change) ──────────────

interface Discovered { text: string[]; video: string[] }

async function discover(provider: Provider, key: string): Promise<Discovered> {
  if (provider === 'anthropic') {
    const r = await axios.get('https://api.anthropic.com/v1/models', {
      params: { limit: 100 }, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, timeout: 15_000 });
    return { text: (r.data?.data ?? []).map((m: { id: string }) => m.id), video: [] };
  }
  if (OAI_BASE[provider]) {
    const r = await axios.get(`${OAI_BASE[provider]}/models`, { headers: { Authorization: `Bearer ${key}` }, timeout: 15_000 });
    let ids: string[] = (r.data?.data ?? []).map((m: { id: string }) => m.id);
    ids = ids.filter((id) => !/(audio|realtime|transcri|tts|whisper|image|embed|moderation|guard|dall-e|sora|ocr)/i.test(id));
    if (provider === 'openai') ids = ids.filter((id) => /^(gpt-|o\d|chatgpt)/.test(id) && !/(search|instruct)/.test(id)).sort().reverse();
    if (provider === 'openrouter') {
      // OpenRouter lists hundreds of models; check the key itself (the list is public)
      const k = await axios.get(`${OAI_BASE.openrouter}/key`, { headers: { Authorization: `Bearer ${key}` }, timeout: 15_000 });
      if (!k.data?.data) throw Object.assign(new Error('invalid_key'), { status: 401 });
    }
    return { text: ids, video: [] };
  }
  if (provider === 'replicate') {
    await axios.get(`${REPLICATE}/account`, { headers: { Authorization: `Bearer ${key}` }, timeout: 15_000 });
    return { text: [], video: REPLICATE_VIDEO_MODELS };
  }
  if (provider === 'gemini') {
    const r = await axios.get(`${GEMINI}/models`, { params: { pageSize: 200 }, headers: { 'x-goog-api-key': key }, timeout: 15_000 });
    const models: { name: string; supportedGenerationMethods?: string[] }[] = r.data?.models ?? [];
    const short = (n: string) => n.replace(/^models\//, '');
    return {
      text: models.filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name)
        && !/(embedding|image|tts|audio|live)/.test(m.name)).map((m) => short(m.name)).reverse(),
      video: models.filter((m) => m.supportedGenerationMethods?.includes('predictLongRunning')).map((m) => short(m.name)).reverse(),
    };
  }
  // Kling has no model list: a status query with an unknown id is rejected with 401/403 only when the key is bad.
  const r = await axios.get(`${KLING}/tasks`, {
    params: { task_ids: 'synthia-key-check' }, headers: { Authorization: `Bearer ${key}` }, timeout: 15_000,
    validateStatus: () => true });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('invalid_key'), { status: 401 });
  return { text: [], video: KLING_MODELS };
}

/** Best default: the provider's strongest everyday model among those the key can use. */
function pickText(provider: Provider, list: string[]): string | null {
  const pref: Record<string, RegExp[]> = {
    anthropic: [/^claude-sonnet-5-5/, /^claude-sonnet/, /^claude-opus/, /^claude/],
    openai: [/^gpt-5(\.\d)?$/, /^gpt-5/, /^gpt-4\.1$/, /^gpt-4o$/, /^gpt/],
    gemini: [/^gemini-\d(\.\d)?-flash$/, /flash$/, /pro$/, /^gemini/],
    mistral: [/^mistral-large-latest$/, /^mistral-medium-latest$/, /^mistral-large/, /latest$/],
    deepseek: [/^deepseek-chat$/, /^deepseek/],
    xai: [/^grok-\d(\.\d)?$/, /^grok-\d/, /^grok/],
    groq: [/gpt-oss-120b/, /llama-3\.3-70b/, /70b/],
    openrouter: [/^anthropic\/claude-sonnet/, /^openai\/gpt-5/, /^google\/gemini/, /./],
  };
  for (const re of pref[provider] ?? []) { const hit = list.find((m) => re.test(m)); if (hit) return hit; }
  return list[0] ?? null;
}

// ── Storage ──────────────────────────────────────────────────────────────────

/** Check the key with the provider, then store it encrypted. Throws 'invalid_key' when rejected. */
export async function saveConnection(userId: number, provider: Provider, key: string): Promise<PublicConnection> {
  const clean = key.trim();
  if (clean.length < 16 || clean.length > 400 || /\s/.test(clean)) throw new Error('invalid_key');
  let found: Discovered;
  try {
    found = await discover(provider, clean);
  } catch (e) {
    const st = (e as AxiosError).response?.status ?? (e as { status?: number }).status;
    if (st === 400 || st === 401 || st === 403) throw new Error('invalid_key');
    throw new Error('provider_unreachable');
  }
  const textModel = pickText(provider, found.text);
  const videoModel = found.video[0] ?? null;
  const models = { text: found.text.slice(0, 80), video: found.video.slice(0, 20) };
  await pool.query(
    `INSERT INTO ai_connections (user_id, provider, key_enc, key_hint, text_model, video_model, models_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE key_enc = VALUES(key_enc), key_hint = VALUES(key_hint), text_model = VALUES(text_model),
       video_model = VALUES(video_model), models_json = VALUES(models_json)`,
    [userId, provider, encrypt(clean), clean.slice(-4), textModel, videoModel, JSON.stringify(models)]);
  return (await listConnections(userId)).find((c) => c.provider === provider)!;
}

export async function setModels(userId: number, provider: Provider, textModel?: string, videoModel?: string): Promise<void> {
  const [rows] = await pool.query<Row[]>('SELECT * FROM ai_connections WHERE user_id = ? AND provider = ?', [userId, provider]);
  const r = rows[0];
  if (!r) throw new Error('not_connected');
  const m = JSON.parse(r.models_json ?? '{}') as { text?: string[]; video?: string[] };
  const t = textModel && m.text?.includes(textModel) ? textModel : r.text_model;
  const v = videoModel && (m.video?.includes(videoModel) || (provider === 'replicate' && isReplicateSlug(videoModel)))
    ? videoModel : r.video_model;
  await pool.query('UPDATE ai_connections SET text_model = ?, video_model = ? WHERE user_id = ? AND provider = ?', [t, v, userId, provider]);
}

export async function listConnections(userId: number): Promise<PublicConnection[]> {
  const [rows] = await pool.query<Row[]>('SELECT * FROM ai_connections WHERE user_id = ?', [userId]);
  return rows.map((r) => {
    const m = JSON.parse(r.models_json ?? '{}') as { text?: string[]; video?: string[] };
    return {
      provider: r.provider, keyHint: r.key_hint, textModel: r.text_model, videoModel: r.video_model,
      textModels: m.text ?? [], videoModels: m.video ?? [], connectedAt: new Date(r.created_at).toISOString(),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    };
  });
}

export async function getConnection(userId: number, provider: Provider): Promise<Connection | null> {
  const [rows] = await pool.query<Row[]>('SELECT * FROM ai_connections WHERE user_id = ? AND provider = ? LIMIT 1', [userId, provider]);
  const r = rows[0];
  if (!r) return null;
  const m = JSON.parse(r.models_json ?? '{}') as { text?: string[]; video?: string[] };
  return { provider, key: decrypt(r.key_enc), textModel: r.text_model, videoModel: r.video_model,
    models: [...(m.text ?? []), ...(m.video ?? [])] };
}

export async function deleteConnection(userId: number, provider: Provider): Promise<void> {
  await pool.query('DELETE FROM ai_connections WHERE user_id = ? AND provider = ?', [userId, provider]);
}

const touch = (userId: number, provider: Provider) =>
  void pool.query('UPDATE ai_connections SET last_used_at = NOW() WHERE user_id = ? AND provider = ?', [userId, provider]).catch(() => {});

// ── Text: one JSON call, same contract as the Groq helpers ───────────────────

function jsonFrom(text: string): Record<string, unknown> {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* ignore */ } }
  return {};
}

async function textJson(c: Connection, system: string, user: string, maxTokens: number): Promise<Record<string, unknown>> {
  const sys = `${system} Reply with one valid JSON object only.`;
  const max = Math.min(Math.max(maxTokens, 600) + 1000, 8000);
  if (c.provider === 'anthropic') {
    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: c.textModel, max_tokens: max, system: sys, messages: [{ role: 'user', content: user }],
    }, { headers: { 'x-api-key': c.key, 'anthropic-version': '2023-06-01' }, timeout: 90_000 });
    return jsonFrom((r.data?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join(''));
  }
  const base = OAI_BASE[c.provider];
  if (base) {
    const body: Record<string, unknown> = {
      model: c.textModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
    };
    body[c.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = max;
    const headers: Record<string, string> = { Authorization: `Bearer ${c.key}` };
    if (c.provider === 'openrouter') { headers['HTTP-Referer'] = 'https://synthia.ikelyane.com'; headers['X-Title'] = 'Synthia AI'; }
    let r = await axios.post(`${base}/chat/completions`, body, { headers, timeout: 90_000, validateStatus: () => true });
    if (r.status === 400) {                     // some models refuse response_format: retry without it
      delete body.response_format;
      r = await axios.post(`${base}/chat/completions`, body, { headers, timeout: 90_000, validateStatus: () => true });
    }
    if (r.status >= 400) throw new Error(`${c.provider} ${r.status}`);
    return jsonFrom(r.data?.choices?.[0]?.message?.content ?? '{}');
  }
  if (c.provider === 'gemini') {
    const r = await axios.post(`${GEMINI}/models/${encodeURIComponent(c.textModel ?? '')}:generateContent`, {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: max },
    }, { headers: { 'x-goog-api-key': c.key }, timeout: 90_000 });
    const parts: { text?: string }[] = r.data?.candidates?.[0]?.content?.parts ?? [];
    return jsonFrom(parts.map((p) => p.text ?? '').join(''));
  }
  throw new Error('not_a_text_provider');
}

/**
 * Text engine for a request: null keeps Synthia's built-in model (Groq). Throws 'not_connected' when the user
 * picked an engine they have not connected.
 */
export async function textEngineFor(userId: number, engine: unknown): Promise<JsonEngine | null> {
  if (typeof engine !== 'string' || !TEXT_PROVIDERS.includes(engine as Provider)) return null;
  const c = await getConnection(userId, engine as Provider);
  if (!c || !c.textModel) throw new Error('not_connected');
  return async (system, user, maxTokens) => { touch(userId, c.provider); return textJson(c, system, user, maxTokens); };
}

// ── Video generation ─────────────────────────────────────────────────────────

export interface VideoRequest { prompt: string; aspect: '9:16' | '16:9' | '1:1'; duration: number; model?: string }
export type VideoPoll = { state: 'running' } | { state: 'failed'; error: string } | { state: 'done'; url: string; headers?: Record<string, string> };

export function videoModelFor(c: Connection, asked?: string): string | null {
  if (asked && (c.models.includes(asked) || (c.provider === 'replicate' && isReplicateSlug(asked)))) return asked;
  return c.videoModel;
}

/** Start a generation; returns the provider's task/operation id. */
export async function startVideo(c: Connection, req: VideoRequest): Promise<{ externalId: string; model: string }> {
  const model = videoModelFor(c, req.model);
  if (!model) throw new Error('no_video_model');
  if (c.provider === 'kling') {
    const turbo = model === 'kling-2.5-turbo';
    const duration = turbo ? (req.duration > 7 ? 10 : 5) : Math.min(30, Math.max(3, Math.round(req.duration)));
    const aspect = turbo && !['16:9', '9:16', '1:1'].includes(req.aspect) ? '9:16' : req.aspect;
    const r = await axios.post(`${KLING}/text-to-video/${model}`, {
      prompt: req.prompt.slice(0, turbo ? 2500 : 11000),
      settings: { duration, resolution: '1080p', aspect_ratio: aspect },
      options: { watermark_info: { enabled: false } },
    }, { headers: { Authorization: `Bearer ${c.key}` }, timeout: 30_000, validateStatus: () => true });
    if (r.status === 401 || r.status === 403) throw new Error('invalid_key');
    if (r.data?.code !== 0 || !r.data?.data?.id) throw new Error(`kling: ${String(r.data?.message ?? r.status).slice(0, 200)}`);
    return { externalId: r.data.data.id, model };
  }
  if (c.provider === 'gemini') {
    const r = await axios.post(`${GEMINI}/models/${encodeURIComponent(model)}:predictLongRunning`, {
      instances: [{ prompt: req.prompt.slice(0, 4000) }],
      parameters: { aspectRatio: req.aspect === '16:9' ? '16:9' : '9:16' },
    }, { headers: { 'x-goog-api-key': c.key }, timeout: 30_000, validateStatus: () => true });
    if (r.status === 401 || r.status === 403) throw new Error('invalid_key');
    if (r.status >= 400 || !r.data?.name) throw new Error(`gemini: ${String(r.data?.error?.message ?? r.status).slice(0, 200)}`);
    return { externalId: r.data.name, model };
  }
  if (c.provider === 'replicate') {
    const input: Record<string, unknown> = { prompt: req.prompt.slice(0, 4000), aspect_ratio: req.aspect };
    const r = await axios.post(`${REPLICATE}/models/${model}/predictions`, { input },
      { headers: { Authorization: `Bearer ${c.key}` }, timeout: 30_000, validateStatus: () => true });
    if (r.status === 401 || r.status === 403) throw new Error('invalid_key');
    if (r.status >= 400 || !r.data?.id) throw new Error(`replicate: ${String(r.data?.detail ?? r.status).slice(0, 200)}`);
    return { externalId: r.data.id, model };
  }
  throw new Error('not_a_video_provider');
}

export async function pollVideo(c: Connection, externalId: string): Promise<VideoPoll> {
  if (c.provider === 'kling') {
    const r = await axios.get(`${KLING}/tasks`, { params: { task_ids: externalId }, headers: { Authorization: `Bearer ${c.key}` }, timeout: 20_000 });
    const t = r.data?.data?.[0];
    if (!t || t.status === 'submitted' || t.status === 'processing') return { state: 'running' };
    if (t.status === 'failed') return { state: 'failed', error: String(t.message ?? 'kling failed').slice(0, 300) };
    const v = (t.outputs ?? []).find((o: { type: string; url?: string }) => o.type === 'video' && o.url);
    return v ? { state: 'done', url: v.url } : { state: 'failed', error: 'no video in result' };
  }
  if (c.provider === 'gemini') {
    if (!/^[\w./-]+$/.test(externalId)) return { state: 'failed', error: 'bad operation id' };
    const r = await axios.get(`${GEMINI}/${externalId}`, { headers: { 'x-goog-api-key': c.key }, timeout: 20_000 });
    if (!r.data?.done) return { state: 'running' };
    if (r.data.error) return { state: 'failed', error: String(r.data.error.message ?? 'veo failed').slice(0, 300) };
    const uri = r.data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    return uri ? { state: 'done', url: uri, headers: { 'x-goog-api-key': c.key } } : { state: 'failed', error: 'no video (blocked by safety filters?)' };
  }
  if (c.provider === 'replicate') {
    if (!/^[\w-]+$/.test(externalId)) return { state: 'failed', error: 'bad prediction id' };
    const r = await axios.get(`${REPLICATE}/predictions/${externalId}`, { headers: { Authorization: `Bearer ${c.key}` }, timeout: 20_000 });
    const st = r.data?.status;
    if (st === 'starting' || st === 'processing') return { state: 'running' };
    if (st !== 'succeeded') return { state: 'failed', error: String(r.data?.error ?? st ?? 'replicate failed').slice(0, 300) };
    const out = r.data.output;
    const url = typeof out === 'string' ? out : Array.isArray(out) ? out.find((x: unknown) => typeof x === 'string') : out?.video ?? out?.url;
    return typeof url === 'string' ? { state: 'done', url } : { state: 'failed', error: 'no video in result' };
  }
  return { state: 'failed', error: 'unsupported' };
}

export { touch as markUsed };
