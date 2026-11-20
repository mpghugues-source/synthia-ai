'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader, inputCls, btnPrimary, btnGhost } from '@/components/dashboard/Shell';

type Lang = 'fr' | 'en';
interface Conn { provider: string; keyHint: string | null; textModel: string | null; videoModel: string | null; textModels: string[]; videoModels: string[]; lastUsedAt: string | null }
interface Token { id: number; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'https://synthia.ikelyane.com';

const TEXT_AI = [
  { id: 'anthropic', name: 'Claude', by: 'Anthropic', color: 'from-orange-500 to-amber-600', keyUrl: 'https://console.anthropic.com/settings/keys', ph: 'sk-ant-…' },
  { id: 'openai', name: 'ChatGPT', by: 'OpenAI', color: 'from-emerald-600 to-teal-500', keyUrl: 'https://platform.openai.com/api-keys', ph: 'sk-…' },
  { id: 'gemini', name: 'Gemini', by: 'Google', color: 'from-blue-600 to-violet-500', keyUrl: 'https://aistudio.google.com/apikey', ph: 'AIza…', video: true },
  { id: 'mistral', name: 'Mistral', by: 'Mistral AI', color: 'from-orange-600 to-red-500', keyUrl: 'https://console.mistral.ai/api-keys', ph: '' },
  { id: 'deepseek', name: 'DeepSeek', by: 'DeepSeek', color: 'from-indigo-600 to-blue-500', keyUrl: 'https://platform.deepseek.com/api_keys', ph: 'sk-…' },
  { id: 'xai', name: 'Grok', by: 'xAI', color: 'from-zinc-700 to-zinc-500', keyUrl: 'https://console.x.ai', ph: 'xai-…' },
  { id: 'groq', name: 'Groq', by: 'Groq (Llama, Qwen…)', color: 'from-rose-600 to-orange-500', keyUrl: 'https://console.groq.com/keys', ph: 'gsk_…' },
  { id: 'openrouter', name: 'OpenRouter', by: 'des centaines de modèles · hundreds of models', color: 'from-slate-700 to-violet-600', keyUrl: 'https://openrouter.ai/settings/keys', ph: 'sk-or-…' },
];
const VIDEO_AI = [
  { id: 'kling', name: 'Kling AI', by: 'Kuaishou', color: 'from-lime-500 to-emerald-600', keyUrl: 'https://kling.ai/dev/api-key', ph: '' },
  { id: 'replicate', name: 'Replicate', by: 'Veo, Kling, Hailuo, Luma, Wan, Seedance…', color: 'from-neutral-800 to-neutral-600', keyUrl: 'https://replicate.com/account/api-tokens', ph: 'r8_…' },
];
const IMPORT_SOURCES = ['claude-code', 'higgsfield', 'kling', 'runway', 'luma', 'pika', 'capcut', 'canva', 'heygen', 'synthesia', 'invideo', 'phone', 'other'];
const NAMES: Record<string, string> = Object.fromEntries([...TEXT_AI, ...VIDEO_AI].map((a) => [a.id, a.name]));

function Copy({ text, lang }: { text: string; lang: Lang }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={btnGhost} onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>
      {done ? '✓' : lang === 'fr' ? 'Copier' : 'Copy'}
    </button>
  );
}

function Snippet({ title, code, lang }: { title: string; code: string; lang: Lang }) {
  return (
    <div className="rounded-xl border border-[#2A2A45] bg-black/30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2A2A45]">
        <span className="text-xs font-semibold text-slate-300">{title}</span><Copy text={code} lang={lang} />
      </div>
      <pre className="p-3 text-[11px] leading-relaxed text-slate-300 overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
}

function AiCard({ a, conn, lang, onChange }: { a: typeof TEXT_AI[number]; conn?: Conn; lang: Lang; onChange: () => void }) {
  const fr = lang === 'fr';
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const connect = async () => {
    setBusy(true); setErr('');
    const r = await fetch('/api/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: a.id, key }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error === 'invalid_key' ? (fr ? 'Clé refusée par le fournisseur.' : 'Key rejected by the provider.') : (fr ? 'Fournisseur injoignable, réessayez.' : 'Provider unreachable, retry.')); return; }
    setKey(''); onChange();
  };
  const patch = async (body: Record<string, string>) => {
    await fetch('/api/integrations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: a.id, ...body }) });
    onChange();
  };
  const remove = async () => {
    if (!confirm(fr ? `Retirer la clé ${a.name} de Synthia ?` : `Remove the ${a.name} key from Synthia?`)) return;
    await fetch(`/api/integrations?provider=${a.id}`, { method: 'DELETE' }); onChange();
  };
  return (
    <div className="rounded-3xl border border-[#2A2A45] bg-[#13132A] p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${a.color} flex items-center justify-center text-white font-black`}>{a.name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-white font-semibold">{a.name}</div>
          <div className="text-xs text-slate-400 truncate">{a.by}</div>
        </div>
        {conn && <span className="text-[11px] text-green-400">● {fr ? 'Connecté' : 'Connected'} ···{conn.keyHint}</span>}
      </div>
      {conn ? (
        <div className="space-y-2">
          {conn.textModels.length > 0 && (
            <label className="block text-xs text-slate-400">{fr ? 'Modèle (texte)' : 'Model (text)'}
              <select value={conn.textModel ?? ''} onChange={(e) => patch({ textModel: e.target.value })} className={`${inputCls} mt-1 py-2`}>
                {conn.textModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
          {conn.videoModels.length > 0 && (
            <label className="block text-xs text-slate-400">{fr ? 'Modèle (vidéo)' : 'Model (video)'}
              <select value={conn.videoModel ?? ''} onChange={(e) => patch({ videoModel: e.target.value })} className={`${inputCls} mt-1 py-2`}>
                {conn.videoModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
          <div className="flex justify-end"><button onClick={remove} className={`${btnGhost} hover:border-red-500 hover:text-red-300`}>{fr ? 'Retirer' : 'Remove'}</button></div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={a.ph || (fr ? 'Clé API' : 'API key')} className={`${inputCls} py-2`} />
            <button disabled={busy || key.trim().length < 16} onClick={connect} className={`${btnPrimary} py-2 shrink-0`}>{busy ? '…' : fr ? 'Connecter' : 'Connect'}</button>
          </div>
          {err && <p className="text-xs text-amber-300">{err}</p>}
          <a href={a.keyUrl} target="_blank" rel="noreferrer" className="text-[11px] text-violet-400">{fr ? 'Obtenir une clé →' : 'Get a key →'}</a>
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const params = useParams();
  const lang: Lang = params?.lang === 'en' ? 'en' : 'fr';
  const fr = lang === 'fr';
  const [conns, setConns] = useState<Conn[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newToken, setNewToken] = useState('');
  const [tokenName, setTokenName] = useState('Claude Code');

  const load = useCallback(() => {
    fetch('/api/integrations').then((r) => r.json()).then((j) => setConns(j.connections ?? [])).catch(() => {});
    fetch('/api/integrations/tokens').then((r) => r.json()).then((j) => setTokens(j.tokens ?? [])).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const createToken = async () => {
    const r = await fetch('/api/integrations/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tokenName }) });
    const j = await r.json();
    if (j.token) { setNewToken(j.token); load(); } else alert(fr ? 'Maximum 10 jetons actifs.' : 'Maximum 10 active tokens.');
  };
  const revoke = async (id: number) => {
    if (!confirm(fr ? 'Révoquer ce jeton ? Les IA qui l’utilisent perdront l’accès.' : 'Revoke this token? AIs using it will lose access.')) return;
    await fetch(`/api/integrations/tokens?id=${id}`, { method: 'DELETE' }); load();
  };

  const tok = newToken || 'syn_VOTRE_JETON';
  const mcpUrl = `${ORIGIN}/api/mcp`;

  // ── AI video generation ──
  const videoConns = conns.filter((c) => ['kling', 'gemini', 'replicate'].includes(c.provider) && (c.videoModel || c.provider === 'replicate'));
  const [gen, setGen] = useState({ provider: '', prompt: '', aspect: '9:16', duration: 5, model: '' });
  const [genState, setGenState] = useState<{ id?: string; status?: string; error?: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);
  const follow = (id: string, set: (s: { id?: string; status?: string; error?: string }) => void) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const j = await fetch(`/api/projects/${id}`).then((r) => r.json()).catch(() => null);
      const p = j?.project ?? j;
      if (!p?.status) return;
      set({ id, status: p.status, error: p.error ?? undefined });
      if (p.status === 'ready' || p.status === 'failed') { if (pollRef.current) clearInterval(pollRef.current); }
    }, 5000);
  };
  const generate = async () => {
    setGenState({ status: 'starting' });
    const r = await fetch('/api/ai/video', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...gen, provider: gen.provider || videoConns[0]?.provider, model: gen.model || undefined }) });
    const j = await r.json();
    if (!r.ok) { setGenState({ status: 'failed', error: j.message ?? j.error }); return; }
    setGenState({ id: j.id, status: 'rendering' }); follow(j.id, setGenState);
  };

  // ── Import ──
  const [imp, setImp] = useState({ url: '', title: '', source: 'claude-code' });
  const [file, setFile] = useState<File | null>(null);
  const [impState, setImpState] = useState<{ id?: string; status?: string; error?: string } | null>(null);
  const doImport = async () => {
    setImpState({ status: 'uploading' });
    let r: Response;
    if (file) {
      const fd = new FormData(); fd.append('file', file); fd.append('title', imp.title); fd.append('source', imp.source);
      r = await fetch('/api/media/import', { method: 'POST', body: fd });
    } else {
      r = await fetch('/api/media/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(imp) });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setImpState({ status: 'failed', error: j.message ?? j.error }); return; }
    setImpState({ id: j.id, status: 'rendering' });
    const t = setInterval(async () => {
      const p = await fetch(`/api/projects/${j.id}`).then((x) => x.json()).catch(() => null);
      const q = p?.project ?? p;
      if (q?.status === 'ready' || q?.status === 'failed') { clearInterval(t); setImpState({ id: j.id, status: q.status, error: q.error }); }
    }, 4000);
  };

  const statusText = (s?: string) => ({ starting: fr ? 'Envoi…' : 'Sending…', uploading: fr ? 'Envoi du fichier…' : 'Uploading…',
    rendering: fr ? '⏳ En cours… (vous pouvez quitter la page, la vidéo arrivera dans la Bibliothèque)' : '⏳ Working… (you can leave, the video will land in the Library)',
    ready: fr ? '✓ Prête : elle est dans la Bibliothèque, publiez-la quand vous voulez.' : '✓ Ready: it is in the Library, publish it whenever you want.',
    failed: fr ? 'Échec' : 'Failed' } as Record<string, string>)[s ?? ''] ?? s;

  const section = 'rounded-3xl border border-[#2A2A45] bg-[#101024] p-5 sm:p-6 mb-8';
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader title={fr ? 'Connexions IA' : 'AI connections'}
        subtitle={fr
          ? 'Branchez Synthia sur toutes vos IA : Claude Code, ChatGPT, Gemini, Cursor… pilotent Synthia par MCP ; vos clés Claude, ChatGPT, Gemini, Mistral, Grok, OpenRouter écrivent vos textes ; Kling, Veo et Replicate créent vos vidéos ; et toute vidéo faite ailleurs s’importe en un clic, prête à publier.'
          : 'Plug Synthia into all your AIs: Claude Code, ChatGPT, Gemini, Cursor… drive Synthia over MCP; your Claude, ChatGPT, Gemini, Mistral, Grok, OpenRouter keys write your copy; Kling, Veo and Replicate make your videos; and any video made elsewhere imports in one click, ready to publish.'} />

      {/* 1. MCP */}
      <section className={section}>
        <h2 className="text-lg font-bold text-white mb-1">🔌 {fr ? 'Connecteur MCP — Claude Code, ChatGPT, Gemini, Cursor et toute IA compatible' : 'MCP connector — Claude Code, ChatGPT, Gemini, Cursor and any compatible AI'}</h2>
        <p className="text-sm text-slate-400 mb-4">
          {fr ? 'Votre IA pourra lister vos vidéos, en importer, en générer, écrire les textes et publier ou programmer sur vos réseaux connectés — toujours avec votre accord. Créez un jeton, puis collez la configuration de votre outil.'
            : 'Your AI can list, import and generate videos, write copy and publish or schedule on your connected networks — always with your consent. Create a token, then paste your tool’s config.'}
        </p>
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} maxLength={80} className={`${inputCls} py-2 w-56`} />
          <button onClick={createToken} className={`${btnPrimary} py-2`}>{fr ? 'Créer un jeton' : 'Create a token'}</button>
        </div>
        {newToken && (
          <div className="mb-4 p-4 rounded-2xl border border-green-500/30 bg-green-500/10">
            <div className="text-sm text-green-200 mb-2">{fr ? 'Votre jeton (affiché une seule fois — gardez-le secret comme un mot de passe) :' : 'Your token (shown once — keep it secret like a password):'}</div>
            <div className="flex gap-2 items-center"><code className="text-xs text-white break-all flex-1">{newToken}</code><Copy text={newToken} lang={lang} /></div>
          </div>
        )}
        <div className="grid lg:grid-cols-2 gap-3 mb-4">
          <Snippet lang={lang} title="Claude Code" code={`claude mcp add --transport http synthia ${mcpUrl} \\\n  --header "Authorization: Bearer ${tok}"`} />
          <Snippet lang={lang} title="Gemini CLI (~/.gemini/settings.json)" code={JSON.stringify({ mcpServers: { synthia: { httpUrl: mcpUrl, headers: { Authorization: `Bearer ${tok}` } } } }, null, 2)} />
          <Snippet lang={lang} title="Cursor / Windsurf / VS Code (mcp.json)" code={JSON.stringify({ mcpServers: { synthia: { url: mcpUrl, headers: { Authorization: `Bearer ${tok}` } } } }, null, 2)} />
          <Snippet lang={lang} title={fr ? 'ChatGPT, claude.ai, n8n… (URL du connecteur, sans en-tête)' : 'ChatGPT, claude.ai, n8n… (connector URL, no header)'} code={`${ORIGIN}/api/mcp/t/${tok}`} />
          <Snippet lang={lang} title={fr ? 'Envoyer un fichier local (curl, depuis Claude Code ou un script)' : 'Upload a local file (curl, from Claude Code or a script)'}
            code={`curl -H "Authorization: Bearer ${tok}" \\\n  -F file=@video.mp4 -F title="Mon titre" -F source=claude-code \\\n  ${ORIGIN}/api/v1/videos/upload`} />
          <Snippet lang={lang} title="API REST" code={`GET  ${ORIGIN}/api/v1/videos\nPOST ${ORIGIN}/api/v1/videos            {url, title}\nPOST ${ORIGIN}/api/v1/videos/generate   {provider, prompt}\nPOST ${ORIGIN}/api/v1/publish           {videoId, platforms}\nGET  ${ORIGIN}/api/v1/connections`} />
        </div>
        {tokens.length > 0 && (
          <div className="space-y-2">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm">
                <span className="text-white flex-1 truncate">{t.name} <span className="text-slate-500">{t.prefix}…</span></span>
                <span className="text-[11px] text-slate-500">{t.lastUsedAt ? `${fr ? 'utilisé' : 'used'} ${new Date(t.lastUsedAt).toLocaleString(lang)}` : fr ? 'jamais utilisé' : 'never used'}</span>
                <button onClick={() => revoke(t.id)} className={`${btnGhost} hover:border-red-500 hover:text-red-300`}>{fr ? 'Révoquer' : 'Revoke'}</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Text AIs */}
      <section className={section}>
        <h2 className="text-lg font-bold text-white mb-1">✍️ {fr ? 'IA qui écrivent (vos propres clés)' : 'Writing AIs (your own keys)'}</h2>
        <p className="text-sm text-slate-400 mb-4">{fr ? 'Choisissez ensuite l’IA dans le Viral Lab ou par MCP. Le fournisseur vous facture directement ; vos clés sont vérifiées puis chiffrées, jamais affichées.' : 'Then pick the AI in the Viral Lab or over MCP. The provider bills you directly; keys are checked, then encrypted and never shown.'}</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEXT_AI.map((a) => <AiCard key={a.id} a={a} conn={conns.find((c) => c.provider === a.id)} lang={lang} onChange={load} />)}
        </div>
      </section>

      {/* 3. Video AIs */}
      <section className={section}>
        <h2 className="text-lg font-bold text-white mb-1">🎬 {fr ? 'IA qui créent des vidéos' : 'Video-generating AIs'}</h2>
        <p className="text-sm text-slate-400 mb-4">{fr ? 'Kling AI, Google Veo (avec votre clé Gemini) et, via Replicate, presque tous les modèles vidéo du marché.' : 'Kling AI, Google Veo (with your Gemini key) and, through Replicate, nearly every video model on the market.'}</p>
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          {VIDEO_AI.map((a) => <AiCard key={a.id} a={a} conn={conns.find((c) => c.provider === a.id)} lang={lang} onChange={load} />)}
        </div>
        {videoConns.length > 0 ? (
          <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
            <div className="text-sm font-semibold text-white">{fr ? 'Générer une vidéo' : 'Generate a video'}</div>
            <textarea value={gen.prompt} onChange={(e) => setGen({ ...gen, prompt: e.target.value })} rows={3} className={inputCls}
              placeholder={fr ? 'Ex : plan rapproché d’un café fumant au lever du soleil, caméra qui glisse lentement, style cinéma' : 'E.g. close-up of a steaming coffee at sunrise, slow dolly shot, cinematic'} />
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-xs text-slate-400">IA
                <select value={gen.provider || videoConns[0].provider} onChange={(e) => setGen({ ...gen, provider: e.target.value })} className={`${inputCls} mt-1 py-2 w-40`}>
                  {videoConns.map((c) => <option key={c.provider} value={c.provider}>{c.provider === 'gemini' ? 'Veo (Gemini)' : NAMES[c.provider]}</option>)}
                </select>
              </label>
              {(gen.provider || videoConns[0].provider) === 'replicate' && (
                <label className="text-xs text-slate-400">{fr ? 'Modèle Replicate' : 'Replicate model'}
                  <input list="rep-models" value={gen.model} onChange={(e) => setGen({ ...gen, model: e.target.value })} placeholder="google/veo-3" className={`${inputCls} mt-1 py-2 w-56`} />
                  <datalist id="rep-models">{(conns.find((c) => c.provider === 'replicate')?.videoModels ?? []).map((m) => <option key={m} value={m} />)}</datalist>
                </label>
              )}
              <label className="text-xs text-slate-400">Format
                <select value={gen.aspect} onChange={(e) => setGen({ ...gen, aspect: e.target.value })} className={`${inputCls} mt-1 py-2 w-36`}>
                  <option value="9:16">9:16 (Shorts)</option><option value="16:9">16:9 (YouTube)</option><option value="1:1">1:1</option>
                </select>
              </label>
              <label className="text-xs text-slate-400">{fr ? 'Durée (s)' : 'Length (s)'}
                <input type="number" min={3} max={30} value={gen.duration} onChange={(e) => setGen({ ...gen, duration: Number(e.target.value) })} className={`${inputCls} mt-1 py-2 w-24`} />
              </label>
              <button disabled={gen.prompt.trim().length < 5 || genState?.status === 'rendering'} onClick={generate} className={btnPrimary}>{fr ? 'Générer' : 'Generate'}</button>
            </div>
            {genState && <p className={`text-sm ${genState.status === 'failed' ? 'text-amber-300' : 'text-slate-300'}`}>{statusText(genState.status)} {genState.error ?? ''}
              {genState.status === 'ready' && <a href={`/${lang}/dashboard/library`} className="ml-2 text-violet-400">{fr ? 'Ouvrir la Bibliothèque →' : 'Open the Library →'}</a>}</p>}
          </div>
        ) : <p className="text-xs text-slate-500">{fr ? 'Connectez Kling, Gemini ou Replicate pour générer des vidéos ici.' : 'Connect Kling, Gemini or Replicate to generate videos here.'}</p>}
      </section>

      {/* 4. Import */}
      <section className={section}>
        <h2 className="text-lg font-bold text-white mb-1">📥 {fr ? 'Importer une vidéo faite avec une autre IA' : 'Import a video made with another AI'}</h2>
        <p className="text-sm text-slate-400 mb-4">{fr ? 'Higgsfield, Runway, Luma, Pika, CapCut, Canva, HeyGen, Claude Code + Remotion, votre téléphone… La vidéo rejoint la Bibliothèque et se publie sur YouTube, TikTok, Instagram, Facebook et X.' : 'Higgsfield, Runway, Luma, Pika, CapCut, Canva, HeyGen, Claude Code + Remotion, your phone… The video joins the Library and publishes to YouTube, TikTok, Instagram, Facebook and X.'}</p>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-xs text-slate-400">{fr ? 'Fichier (100 Mo max)' : 'File (100 MB max)'}
            <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`${inputCls} mt-1 py-2`} />
          </label>
          <label className="text-xs text-slate-400">{fr ? '… ou lien https (1 Go max)' : '… or https link (1 GB max)'}
            <input value={imp.url} disabled={Boolean(file)} onChange={(e) => setImp({ ...imp, url: e.target.value })} placeholder="https://…/video.mp4" className={`${inputCls} mt-1 py-2`} />
          </label>
          <label className="text-xs text-slate-400">{fr ? 'Titre' : 'Title'}
            <input value={imp.title} onChange={(e) => setImp({ ...imp, title: e.target.value })} maxLength={255} className={`${inputCls} mt-1 py-2`} />
          </label>
          <label className="text-xs text-slate-400">{fr ? 'Faite avec' : 'Made with'}
            <select value={imp.source} onChange={(e) => setImp({ ...imp, source: e.target.value })} className={`${inputCls} mt-1 py-2`}>
              {IMPORT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button disabled={!file && !imp.url.startsWith('https://')} onClick={doImport} className={btnPrimary}>{fr ? 'Importer' : 'Import'}</button>
          {impState && <span className={`text-sm ${impState.status === 'failed' ? 'text-amber-300' : 'text-slate-300'}`}>{statusText(impState.status)} {impState.error ?? ''}
            {impState.status === 'ready' && <a href={`/${lang}/dashboard/library`} className="ml-2 text-violet-400">{fr ? 'Publier depuis la Bibliothèque →' : 'Publish from the Library →'}</a>}</span>}
        </div>
      </section>
    </div>
  );
}
