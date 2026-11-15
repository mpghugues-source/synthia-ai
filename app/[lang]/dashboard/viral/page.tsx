'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader, inputCls, btnPrimary, btnGhost } from '@/components/dashboard/Shell';

type Lang = 'fr' | 'en';
type Tool = 'hooks' | 'titles' | 'captions' | 'ideas' | 'rewrite' | 'translate' | 'hashtags';

const LANGS = [
  ['fr', 'Français'], ['en', 'English'], ['es', 'Español'], ['pt', 'Português'],
  ['sw', 'Kiswahili'], ['de', 'Deutsch'], ['it', 'Italiano'], ['ar', 'العربية'],
] as const;
const PLATFORMS = ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'YouTube', 'Facebook', 'LinkedIn', 'X'];

const TOOLS: { id: Tool; icon: string; fr: string; en: string; dfr: string; den: string; input: 'topic' | 'script' }[] = [
  { id: 'hooks', icon: '🪝', fr: 'Accroches', en: 'Hooks', dfr: '10 accroches notées pour arrêter le scroll dès la 1re seconde.', den: '10 scored hooks that stop the scroll in the first second.', input: 'topic' },
  { id: 'titles', icon: '🏷️', fr: 'Titres A/B', en: 'A/B titles', dfr: '8 titres à tester + le texte de la miniature.', den: '8 titles to test + thumbnail text.', input: 'topic' },
  { id: 'captions', icon: '✍️', fr: 'Textes réseaux', en: 'Social copy', dfr: 'Description YouTube, légende TikTok/Instagram, thread X, post LinkedIn — en un clic.', den: 'YouTube description, TikTok/Instagram caption, X thread, LinkedIn post — in one click.', input: 'script' },
  { id: 'ideas', icon: '🗓️', fr: 'Plan 14 jours', en: '14-day plan', dfr: 'Deux semaines d’idées de vidéos prêtes à produire.', den: 'Two weeks of video ideas ready to produce.', input: 'topic' },
  { id: 'rewrite', icon: '♻️', fr: 'Réécrire', en: 'Rewrite', dfr: 'Plus court, plus percutant, en storytelling…', den: 'Shorter, punchier, as a story…', input: 'script' },
  { id: 'translate', icon: '🌍', fr: 'Traduire', en: 'Translate', dfr: 'Déclinez une vidéo dans 8 langues pour toucher de nouveaux marchés.', den: 'Localise a video into 8 languages to reach new markets.', input: 'script' },
  { id: 'hashtags', icon: '#️⃣', fr: 'Hashtags & horaires', en: 'Hashtags & timing', dfr: 'Hashtags par portée + meilleurs moments pour publier.', den: 'Hashtags by reach + best times to post.', input: 'topic' },
];

const REWRITE_STYLES = [
  ['punchier', 'Plus percutant', 'Punchier'], ['shorter', 'Plus court', 'Shorter'], ['storytelling', 'Storytelling', 'Storytelling'],
  ['simpler', 'Plus simple', 'Simpler'], ['professional', 'Professionnel', 'Professional'], ['funny', 'Avec humour', 'Funny'],
] as const;

function Copy({ text, lang }: { text: string; lang: Lang }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className={btnGhost}
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}>
      {ok ? '✓' : (lang === 'fr' ? 'Copier' : 'Copy')}
    </button>
  );
}

function sendToStudio(lang: Lang, opts: { topic?: string; script?: string }) {
  if (opts.script) {
    try { sessionStorage.setItem('synthia:script', opts.script); } catch { /* private mode */ }
    window.location.href = `/${lang}/dashboard?mode=narration&from=lab`;
  } else if (opts.topic) {
    window.location.href = `/${lang}/dashboard?topic=${encodeURIComponent(opts.topic)}`;
  }
}

type AnyObj = Record<string, unknown>;
const arr = (v: unknown): AnyObj[] => (Array.isArray(v) ? v as AnyObj[] : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function Result({ tool, r, lang }: { tool: Tool; r: AnyObj; lang: Lang }) {
  const card = 'glow-card rounded-2xl p-4';
  if (tool === 'hooks') return (
    <div className="space-y-2">
      {arr(r.hooks).map((h, i) => (
        <div key={i} className={`${card} flex items-start gap-3`}>
          <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold ${Number(h.score) >= 8 ? 'bg-green-500/20 text-green-300' : 'bg-violet-500/20 text-violet-300'}`}>{str(h.score)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium">{str(h.text)}</p>
            <p className="text-xs text-slate-500 mt-1"><span className="uppercase tracking-wide text-slate-400">{str(h.type)}</span> · {str(h.why)}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Copy text={str(h.text)} lang={lang} />
            <button className={btnGhost} onClick={() => sendToStudio(lang, { topic: str(h.text) })}>🎬</button>
          </div>
        </div>
      ))}
    </div>
  );
  if (tool === 'titles') return (
    <div className="grid sm:grid-cols-2 gap-3">
      {arr(r.titles).map((x, i) => (
        <div key={i} className={card}>
          <div className="text-[10px] uppercase tracking-wide text-violet-300 mb-1">{str(x.angle)}</div>
          <p className="text-white font-semibold">{str(x.title)}</p>
          <p className="text-xs text-slate-400 mt-2">🖼️ {str(x.thumbnail)}</p>
          <div className="mt-3"><Copy text={str(x.title)} lang={lang} /></div>
        </div>
      ))}
    </div>
  );
  if (tool === 'captions') {
    const blocks: [string, string, string][] = [];
    const yt = (r.youtube ?? {}) as AnyObj; const tk = (r.tiktok ?? {}) as AnyObj; const ig = (r.instagram ?? {}) as AnyObj;
    const fb = (r.facebook ?? {}) as AnyObj; const x = (r.x ?? {}) as AnyObj; const li = (r.linkedin ?? {}) as AnyObj;
    const tags = (o: AnyObj) => strs(o.hashtags).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    blocks.push(['▶', 'YouTube', `${str(yt.title)}\n\n${str(yt.description)}\n\n${tags(yt)}`]);
    blocks.push(['♪', 'TikTok', `${str(tk.caption)} ${tags(tk)}`]);
    blocks.push(['◉', 'Instagram', `${str(ig.caption)}\n\n${tags(ig)}`]);
    blocks.push(['f', 'Facebook', `${str(fb.post)}\n\n${tags(fb)}`]);
    blocks.push(['✕', 'X', `${strs(x.thread).map((t, i) => `${i + 1}/ ${t}`).join('\n\n')}\n\n${tags(x)}`]);
    blocks.push(['in', 'LinkedIn', `${str(li.post)}\n\n${tags(li)}`]);
    return (
      <div className="grid md:grid-cols-2 gap-3">
        {blocks.map(([icon, name, text]) => (
          <div key={name} className={card}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white"><span className="inline-block w-6 text-center text-violet-300">{icon}</span> {name}</span>
              <Copy text={text.trim()} lang={lang} />
            </div>
            <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{text.trim()}</p>
          </div>
        ))}
      </div>
    );
  }
  if (tool === 'ideas') return (
    <div className="grid sm:grid-cols-2 gap-3">
      {arr(r.ideas).map((x, i) => (
        <div key={i} className={`${card} flex flex-col`}>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200">{lang === 'fr' ? 'Jour' : 'Day'} {str(x.day)}</span>
            <span>{str(x.format)}</span><span>· {str(x.duration)}s</span>
          </div>
          <p className="text-white font-medium">{str(x.topic)}</p>
          <p className="text-xs text-slate-400 mt-1 italic">“{str(x.hook)}”</p>
          <button className={`${btnGhost} mt-3 self-start`} onClick={() => sendToStudio(lang, { topic: str(x.topic) })}>
            🎬 {lang === 'fr' ? 'Créer cette vidéo' : 'Create this video'}
          </button>
        </div>
      ))}
    </div>
  );
  if (tool === 'rewrite' || tool === 'translate') return (
    <div className={card}>
      {tool === 'translate' && r.title ? <p className="text-white font-semibold mb-2">{str(r.title)}</p> : null}
      <p className="text-slate-200 whitespace-pre-wrap leading-relaxed text-sm">{str(r.script)}</p>
      {strs(r.changes).length > 0 && (
        <ul className="mt-3 text-xs text-slate-500 list-disc pl-5">{strs(r.changes).map((c, i) => <li key={i}>{c}</li>)}</ul>
      )}
      <div className="flex flex-wrap gap-2 mt-4">
        <Copy text={str(r.script)} lang={lang} />
        <button className={btnGhost} onClick={() => sendToStudio(lang, { script: str(r.script) })}>
          🎙️ {lang === 'fr' ? 'En faire une vidéo narrée' : 'Turn into a narrated video'}
        </button>
      </div>
    </div>
  );
  // hashtags
  const group = (k: string, label: string, cls: string) => (
    <div className={card}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">{label}</span>
        <Copy text={strs(r[k]).join(' ')} lang={lang} />
      </div>
      <div className="flex flex-wrap gap-1.5">{strs(r[k]).map((h) => <span key={h} className={`text-xs px-2 py-1 rounded-lg ${cls}`}>{h.startsWith('#') ? h : `#${h}`}</span>)}</div>
    </div>
  );
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {group('broad', lang === 'fr' ? 'Large portée' : 'Broad reach', 'bg-sky-500/15 text-sky-200')}
      {group('niche', 'Niche', 'bg-violet-500/15 text-violet-200')}
      {group('micro', lang === 'fr' ? 'Micro-niche' : 'Micro-niche', 'bg-pink-500/15 text-pink-200')}
      <div className={`${card} md:col-span-3`}>
        <p className="text-sm text-white font-semibold mb-2">⏰ {lang === 'fr' ? 'Meilleurs moments pour publier' : 'Best times to post'}</p>
        <div className="flex flex-wrap gap-2">{strs(r.bestTimes).map((x) => <span key={x} className="text-xs px-2 py-1 rounded-lg bg-white/5 text-slate-200">{x}</span>)}</div>
        {r.tip ? <p className="text-xs text-slate-400 mt-3">💡 {str(r.tip)}</p> : null}
      </div>
    </div>
  );
}

export default function ViralLabPage() {
  const params = useParams();
  const lang: Lang = params?.lang === 'en' ? 'en' : 'fr';
  const [tool, setTool] = useState<Tool>('hooks');
  const [input, setInput] = useState('');
  const [outLang, setOutLang] = useState<string>(lang);
  const [targetLang, setTargetLang] = useState<string>(lang === 'fr' ? 'en' : 'fr');
  const [platform, setPlatform] = useState('TikTok');
  const [style, setStyle] = useState('punchier');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnyObj | null>(null);

  const current = TOOLS.find((x) => x.id === tool)!;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('tool') as Tool | null;
    if (t && TOOLS.some((x) => x.id === t)) setTool(t);
    const pid = q.get('project');
    if (pid) {
      fetch(`/api/projects/${encodeURIComponent(pid)}`).then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j?.project?.script) setInput(j.project.script); }).catch(() => {});
    }
    fetch('/api/brand').then((r) => (r.ok ? r.json() : null)).then((j) => j?.brand && setOutLang(j.brand.defaultLang)).catch(() => {});
  }, []);

  const run = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/ai/viral', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, input, lang: outLang, targetLang, platform, style }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Error');
      setResult(j.result ?? {});
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader title="Viral Lab 🚀"
        subtitle={lang === 'fr'
          ? 'Les outils des créateurs qui cartonnent : accroches, titres, textes pour chaque réseau, plan de contenu, traduction. Résultats en quelques secondes.'
          : 'The toolkit of top creators: hooks, titles, copy for every network, content plans, translation. Results in seconds.'} />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
        {TOOLS.map((x) => (
          <button key={x.id} onClick={() => { setTool(x.id); setResult(null); setError(''); }}
            className={`rounded-2xl border p-3 text-left transition-all ${tool === x.id ? 'border-violet-500 bg-violet-500/15' : 'border-[#2A2A45] bg-[#13132A] hover:border-violet-500/50'}`}>
            <div className="text-xl">{x.icon}</div>
            <div className="text-xs font-semibold text-white mt-1">{lang === 'fr' ? x.fr : x.en}</div>
          </button>
        ))}
      </div>

      <div className="glow-card rounded-3xl p-5 sm:p-6 mb-6">
        <p className="text-sm text-slate-400 mb-4">{lang === 'fr' ? current.dfr : current.den}</p>
        {current.input === 'topic' ? (
          <input value={input} onChange={(e) => setInput(e.target.value)} spellCheck lang={outLang} className={inputCls}
            placeholder={lang === 'fr' ? 'Votre sujet ou votre niche — ex : épargner avec un petit salaire' : 'Your topic or niche — e.g. saving money on a small salary'}
            onKeyDown={(e) => { if (e.key === 'Enter' && input.trim() && !loading) run(); }} />
        ) : (
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={7} spellCheck lang={outLang} className={`${inputCls} resize-y`}
            placeholder={lang === 'fr' ? 'Collez votre script (ou ouvrez une vidéo depuis la Bibliothèque)…' : 'Paste your script (or open a video from the Library)…'} />
        )}
        <div className="flex flex-wrap items-end gap-3 mt-4">
          <label className="text-xs text-slate-400">
            {tool === 'translate' ? (lang === 'fr' ? 'Traduire vers' : 'Translate to') : (lang === 'fr' ? 'Langue' : 'Language')}
            <select value={tool === 'translate' ? targetLang : outLang}
              onChange={(e) => (tool === 'translate' ? setTargetLang(e.target.value) : setOutLang(e.target.value))}
              className={`${inputCls} mt-1 py-2 w-40`}>
              {LANGS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
          </label>
          {['hooks', 'titles', 'ideas', 'hashtags'].includes(tool) && (
            <label className="text-xs text-slate-400">
              {lang === 'fr' ? 'Plateforme' : 'Platform'}
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={`${inputCls} mt-1 py-2 w-44`}>
                {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          )}
          {tool === 'rewrite' && (
            <div className="flex flex-wrap gap-1.5">
              {REWRITE_STYLES.map(([id, fr, en]) => (
                <button key={id} onClick={() => setStyle(id)}
                  className={`px-3 py-2 rounded-lg text-xs ${style === id ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400'}`}>{lang === 'fr' ? fr : en}</button>
              ))}
            </div>
          )}
          <button onClick={run} disabled={loading || !input.trim()} className={`${btnPrimary} sm:ml-auto`}>
            {loading ? (lang === 'fr' ? 'L’IA travaille…' : 'AI is working…') : (lang === 'fr' ? '✨ Générer' : '✨ Generate')}
          </button>
        </div>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-900/30 border border-red-800 text-red-300 text-sm mb-4">{error}</div>}
      {loading && (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />)}</div>
      )}
      {result && <Result tool={tool} r={result} lang={lang} />}
    </div>
  );
}
