'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader, inputCls, btnPrimary, btnGhost } from '@/components/dashboard/Shell';
import type { ProjectDto } from '@/components/dashboard/types';

type Lang = 'fr' | 'en';

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', icon: '▶' }, { id: 'tiktok', label: 'TikTok', icon: '♪' },
  { id: 'instagram', label: 'Instagram', icon: '◉' }, { id: 'facebook', label: 'Facebook', icon: 'f' },
  { id: 'twitter', label: 'X', icon: '✕' },
];

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CalendarPage() {
  const params = useParams();
  const lang: Lang = params?.lang === 'en' ? 'en' : 'fr';
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selId, setSelId] = useState('');
  const [when, setWhen] = useState(() => { const d = new Date(Date.now() + 3600_000); d.setMinutes(0); return toLocalInput(d); });
  const [plats, setPlats] = useState<string[]>(['youtube', 'tiktok']);
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch('/api/projects').then((r) => r.json()).then((j) => setProjects(j.projects ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    fetch('/api/social/publish').then((r) => (r.ok ? r.json() : null)).then((j) => j?.platforms && setConfigured(j.platforms)).catch(() => {});
    const pid = new URLSearchParams(window.location.search).get('project');
    if (pid) setSelId(pid);
  }, [load]);

  const ready = projects.filter((p) => p.status === 'ready');
  const planned = projects.filter((p) => p.scheduledAt && p.publishStatus !== 'none');

  const days = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // weeks start on Monday
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

  const byDay = useMemo(() => {
    const m = new Map<string, ProjectDto[]>();
    for (const p of planned) {
      const k = new Date(p.scheduledAt!).toDateString();
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [planned]);

  const schedule = async () => {
    if (!selId) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch(`/api/projects/${selId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: { at: new Date(when).toISOString(), platforms: plats } }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Error');
      setMsg(lang === 'fr' ? '✓ Publication programmée.' : '✓ Publication scheduled.');
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedule: null }) });
    load();
  };

  const weekdays = lang === 'fr' ? ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date().toDateString();
  const noneConfigured = Object.keys(configured).length > 0 && !Object.values(configured).some(Boolean);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader title={lang === 'fr' ? 'Calendrier de publication' : 'Publishing calendar'}
        subtitle={lang === 'fr'
          ? 'Planifiez vos vidéos aux meilleurs horaires : Synthia les publie automatiquement, même quand vous dormez.'
          : 'Plan your videos at the best times: Synthia publishes them automatically, even while you sleep.'} />

      {noneConfigured && (
        <div className="mb-6 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
          {lang === 'fr'
            ? 'Aucun compte social n’est encore connecté sur ce serveur : les publications programmées seront marquées « compte non connecté ». Contactez l’administrateur pour connecter YouTube, TikTok, Instagram, Facebook ou X.'
            : 'No social account is connected on this server yet: scheduled posts will be marked “account not connected”. Ask the administrator to connect YouTube, TikTok, Instagram, Facebook or X.'}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        {/* Month grid */}
        <div className="glow-card rounded-3xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <button className={btnGhost} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
            <h2 className="text-white font-semibold capitalize">{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h2>
            <button className={btnGhost} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-500 mb-1">{weekdays.map((w) => <div key={w} className="text-center">{w}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const items = byDay.get(d.toDateString()) ?? [];
              const inMonth = d.getMonth() === month.getMonth();
              return (
                <div key={d.toISOString()} className={`min-h-[64px] sm:min-h-[92px] rounded-xl p-1.5 border ${
                  d.toDateString() === today ? 'border-violet-500/70 bg-violet-500/10' : 'border-[#1F1F38] bg-black/10'} ${inMonth ? '' : 'opacity-40'}`}>
                  <div className="text-[11px] text-slate-400">{d.getDate()}</div>
                  <div className="space-y-1 mt-1">
                    {items.slice(0, 3).map((p) => (
                      <div key={p.id} title={p.title ?? ''}
                        className={`text-[10px] truncate px-1.5 py-0.5 rounded ${
                          p.publishStatus === 'published' ? 'bg-green-500/20 text-green-200' : p.publishStatus === 'failed' ? 'bg-red-500/20 text-red-200' : 'bg-violet-500/25 text-violet-100'}`}>
                        {new Date(p.scheduledAt!).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} {p.title}
                      </div>
                    ))}
                    {items.length > 3 && <div className="text-[10px] text-slate-500">+{items.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scheduler */}
        <div className="space-y-4">
          <div className="glow-card rounded-3xl p-5 space-y-4">
            <h3 className="text-white font-semibold">{lang === 'fr' ? 'Programmer une vidéo' : 'Schedule a video'}</h3>
            <select value={selId} onChange={(e) => setSelId(e.target.value)} className={inputCls}>
              <option value="">{lang === 'fr' ? '— Choisir une vidéo prête —' : '— Pick a ready video —'}</option>
              {ready.map((p) => <option key={p.id} value={p.id}>{p.title ?? p.id}</option>)}
            </select>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} />
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button key={p.id} type="button"
                  onClick={() => setPlats((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
                  className={`px-3 py-1.5 rounded-lg border text-xs ${plats.includes(p.id) ? 'border-violet-500 bg-violet-500/20 text-violet-200' : 'border-[#2A2A45] text-slate-400'}`}>
                  {p.icon} {p.label}{configured[p.id] === false ? ' ·' : ''}
                </button>
              ))}
            </div>
            <button onClick={schedule} disabled={busy || !selId || !plats.length} className={`${btnPrimary} w-full`}>
              {busy ? '…' : (lang === 'fr' ? 'Programmer' : 'Schedule')}
            </button>
            {msg && <p className="text-xs text-slate-300">{msg}</p>}
            {!ready.length && <p className="text-xs text-slate-500">{lang === 'fr' ? 'Aucune vidéo prête pour le moment.' : 'No ready video yet.'}</p>}
          </div>

          <div className="glow-card rounded-3xl p-5">
            <h3 className="text-white font-semibold mb-3">{lang === 'fr' ? 'À venir' : 'Upcoming'}</h3>
            <div className="space-y-2">
              {planned.filter((p) => p.publishStatus === 'scheduled')
                .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
                .map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="text-white truncate">{p.title}</div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(p.scheduledAt!).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })} · {p.platforms.join(', ')}
                      </div>
                    </div>
                    <button onClick={() => cancel(p.id)} className={btnGhost}>{lang === 'fr' ? 'Annuler' : 'Cancel'}</button>
                  </div>
                ))}
              {!planned.some((p) => p.publishStatus === 'scheduled') && (
                <p className="text-xs text-slate-500">{lang === 'fr' ? 'Rien de programmé.' : 'Nothing scheduled.'}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
