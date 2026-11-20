'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader, btnGhost, btnPrimary, inputCls } from '@/components/dashboard/Shell';
import type { ProjectDto } from '@/components/dashboard/types';
import QaApproval from '@/components/dashboard/QaApproval';

type Lang = 'fr' | 'en';


const T = {
  fr: {
    title: 'Bibliothèque', sub: 'Toutes vos vidéos, prêtes à télécharger, republier ou décliner pour chaque réseau.',
    new: '+ Nouvelle vidéo', search: 'Rechercher un titre…', all: 'Toutes', ready: 'Prêtes', rendering: 'En cours',
    failed: 'Échecs', scheduled: 'Programmées', empty: 'Aucune vidéo pour l’instant.', emptyCta: 'Créer ma première vidéo',
    download: 'Télécharger', captions: 'Textes réseaux', schedule: 'Programmer', del: 'Supprimer',
    confirmDel: 'Supprimer définitivement cette vidéo et ses fichiers ?', untitled: 'Sans titre',
    mode: { ai: 'IA', manual: 'Manuel', narration: 'Narration' }, retry: 'Réessayer dans le Studio',
    st: { draft: 'Brouillon', rendering: 'Montage…', ready: 'Prête', failed: 'Échec' },
    pub: { scheduled: 'Programmée', publishing: 'Publication…', published: 'Publiée', failed: 'Publication échouée' },
  },
  en: {
    title: 'Library', sub: 'All your videos, ready to download, republish or repurpose for every network.',
    new: '+ New video', search: 'Search a title…', all: 'All', ready: 'Ready', rendering: 'Rendering',
    failed: 'Failed', scheduled: 'Scheduled', empty: 'No videos yet.', emptyCta: 'Create my first video',
    download: 'Download', captions: 'Social copy', schedule: 'Schedule', del: 'Delete',
    confirmDel: 'Permanently delete this video and its files?', untitled: 'Untitled',
    mode: { ai: 'AI', manual: 'Manual', narration: 'Narration' }, retry: 'Retry in Studio',
    st: { draft: 'Draft', rendering: 'Rendering…', ready: 'Ready', failed: 'Failed' },
    pub: { scheduled: 'Scheduled', publishing: 'Publishing…', published: 'Published', failed: 'Publish failed' },
  },
};

function fmtSize(b: number | null) {
  if (!b) return '';
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
}

function fmtDur(s: number | null) {
  if (!s) return '';
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

/** Projects in progress (autosaved Studio work): visible here too, so they stay reachable on mobile. */
function InProgress({ lang }: { lang: 'fr' | 'en' }) {
  const [drafts, setDrafts] = useState<{ id: string; title: string | null; mode: string; updatedAt: string }[]>([]);
  useEffect(() => { fetch('/api/drafts?limit=8').then((r) => (r.ok ? r.json() : null)).then((j) => setDrafts(j?.drafts ?? [])).catch(() => {}); }, []);
  if (!drafts.length) return null;
  return (
    <div className="mb-6">
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">{lang === 'fr' ? 'Projets en cours — reprenez où vous en étiez' : 'Projects in progress — pick up where you left off'}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {drafts.map((d) => (
          <a key={d.id} href={`/${lang}/dashboard?draft=${d.id}`}
            className="shrink-0 w-56 rounded-2xl border border-[#2A2A45] bg-[#13132A] p-3 hover:border-violet-500 transition-all">
            <div className="text-sm text-white truncate">{d.title || (lang === 'fr' ? 'Sans titre' : 'Untitled')}</div>
            <div className="text-[11px] text-slate-500 mt-1">{new Date(d.updatedAt).toLocaleString(lang)}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const params = useParams();
  const lang: Lang = params?.lang === 'en' ? 'en' : 'fr';
  const t = T[lang];
  const [projects, setProjects] = useState<ProjectDto[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'ready' | 'rendering' | 'failed' | 'scheduled'>('all');
  const [q, setQ] = useState('');
  const [playing, setPlaying] = useState<ProjectDto | null>(null);

  const load = useCallback(() => {
    fetch('/api/projects').then((r) => r.json()).then((j) => setProjects(j.projects ?? [])).catch(() => setProjects([]));
  }, []);

  useEffect(() => { load(); }, [load]);
  // Refresh while something is rendering
  useEffect(() => {
    if (!projects?.some((p) => p.status === 'rendering' || p.publishStatus === 'publishing')) return;
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [projects, load]);

  const shown = useMemo(() => (projects ?? []).filter((p) => {
    if (filter === 'scheduled' ? p.publishStatus !== 'scheduled' : filter !== 'all' && p.status !== filter) return false;
    if (q && !(p.title ?? '').toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [projects, filter, q]);

  const remove = async (p: ProjectDto) => {
    if (!confirm(t.confirmDel)) return;
    await fetch(`/api/projects/${p.id}`, { method: 'DELETE' });
    load();
  };

  const counts = {
    all: projects?.length ?? 0,
    ready: projects?.filter((p) => p.status === 'ready').length ?? 0,
    rendering: projects?.filter((p) => p.status === 'rendering').length ?? 0,
    failed: projects?.filter((p) => p.status === 'failed').length ?? 0,
    scheduled: projects?.filter((p) => p.publishStatus === 'scheduled').length ?? 0,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader title={t.title} subtitle={t.sub}
        action={<a href={`/${lang}/dashboard`} className={btnPrimary}>{t.new}</a>} />

      <InProgress lang={lang === 'en' ? 'en' : 'fr'} />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(['all', 'ready', 'rendering', 'scheduled', 'failed'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}>
            {t[f]} <span className="opacity-60">{counts[f]}</span>
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className={`${inputCls} sm:ml-auto sm:w-64 py-2`} />
      </div>

      {projects === null && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[9/14] rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      )}

      {projects !== null && shown.length === 0 && (
        <div className="glow-card rounded-3xl p-12 text-center">
          <div className="text-5xl mb-4">🎬</div>
          <p className="text-slate-400 mb-6">{t.empty}</p>
          <a href={`/${lang}/dashboard`} className={btnPrimary}>{t.emptyCta}</a>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {shown.map((p) => (
          <div key={p.id} className="group rounded-2xl overflow-hidden border border-[#2A2A45] bg-[#13132A] hover:border-violet-500/60 transition-all flex flex-col">
            <button type="button" onClick={() => p.status === 'ready' && setPlaying(p)}
              className="relative aspect-[9/12] bg-gradient-to-br from-violet-900/40 to-slate-900 overflow-hidden">
              {p.thumbFile && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/stream/${p.thumbFile}`} alt="" loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              )}
              {p.status === 'ready' && (
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="w-12 h-12 rounded-full bg-white/90 text-black flex items-center justify-center text-lg">▶</span>
                </span>
              )}
              {p.status === 'rendering' && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                  <span className="w-8 h-8 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
                  <span className="text-xs text-violet-200">{t.st.rendering}</span>
                </span>
              )}
              {p.status === 'failed' && (
                <span className="absolute inset-0 flex items-center justify-center bg-red-950/40 text-red-300 text-xs p-3 text-center">{t.st.failed}</span>
              )}
              <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white">{t.mode[p.mode]}</span>
              {p.duration ? <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white">{fmtDur(p.duration)}</span> : null}
              {p.publishStatus !== 'none' && (
                <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full ${
                  p.publishStatus === 'published' ? 'bg-green-500/80 text-black' : p.publishStatus === 'failed' ? 'bg-red-500/80 text-white' : 'bg-violet-500/80 text-white'}`}>
                  {t.pub[p.publishStatus]}
                </span>
              )}
            </button>
            <div className="p-3 flex-1 flex flex-col">
              <div className="text-sm font-medium text-white line-clamp-2 min-h-[2.5rem]">{p.title || t.untitled}</div>
              <div className="text-[11px] text-slate-500 mt-1">
                {new Date(p.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                {p.fileSize ? ` · ${fmtSize(p.fileSize)}` : ''}
                {p.resolution ? ` · ${p.resolution === '1920x1080' ? '16:9' : p.resolution === '1080x1080' ? '1:1' : '9:16'}` : ''}
              </div>
              {p.status === 'failed' && p.error && <p className="text-[11px] text-red-400 mt-1 line-clamp-2">{p.error}</p>}
              <div className="mt-auto pt-3 flex flex-wrap gap-1.5">
                {p.status === 'ready' && p.outputFile && (
                  <a href={`/api/media/stream/${p.outputFile}?download=1`} className={btnGhost} title={t.download}>⬇</a>
                )}
                {p.script && (
                  <a href={`/${lang}/dashboard/viral?tool=captions&project=${p.id}`} className={btnGhost} title={t.captions}>✍️</a>
                )}
                {p.status === 'ready' && (
                  <a href={`/${lang}/dashboard/calendar?project=${p.id}`} className={btnGhost} title={t.schedule}>🗓️</a>
                )}
                <button onClick={() => remove(p)} className={`${btnGhost} ml-auto hover:border-red-500 hover:text-red-300`} title={t.del}>🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {playing && playing.outputFile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPlaying(null)}>
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold truncate pr-4">{playing.title || t.untitled}</h3>
              <button onClick={() => setPlaying(null)} className="text-slate-300 hover:text-white text-2xl leading-none">×</button>
            </div>
            <video src={`/api/media/stream/${playing.outputFile}`} controls autoPlay playsInline
              className="w-full max-h-[60vh] rounded-2xl bg-black" />
            <div className="mt-3 max-h-[30vh] overflow-y-auto"><QaApproval projectId={playing.id} lang={lang === 'en' ? 'en' : 'fr'} /></div>
            {playing.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {playing.hashtags.map((h) => <span key={h} className="text-xs px-2 py-0.5 rounded bg-violet-500/20 text-violet-200">{h.startsWith('#') ? h : `#${h}`}</span>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
