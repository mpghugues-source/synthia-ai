'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import InstallApp from './InstallApp';

export type Lang = 'fr' | 'en';

export interface MeData {
  user: { id: number; name: string | null; email: string };
  usage: { plan: string; used: number; limit: number; unlimited: boolean };
  stats: { total: number; ready: number; scheduled: number; published: number; seconds: number };
}

const NAV = [
  { href: '', icon: '✨', fr: 'Studio', en: 'Studio' },
  { href: '/viral', icon: '🚀', fr: 'Viral Lab', en: 'Viral Lab' },
  { href: '/library', icon: '🎞️', fr: 'Bibliothèque', en: 'Library' },
  { href: '/calendar', icon: '🗓️', fr: 'Calendrier', en: 'Calendar' },
  { href: '/accounts', icon: '🔗', fr: 'Comptes connectés', en: 'Connected accounts' },
  { href: '/integrations', icon: '🤖', fr: 'Connexions IA', en: 'AI connections' },
  { href: '/brand', icon: '🎨', fr: 'Brand kit', en: 'Brand kit' },
  { href: '/account', icon: '💎', fr: 'Abonnement', en: 'Plan & billing' },
];

const PLAN_STYLE: Record<string, string> = {
  studio: 'bg-yellow-500/20 text-yellow-300',
  creator: 'bg-violet-500/20 text-violet-300',
  starter: 'bg-sky-500/20 text-sky-300',
  free: 'bg-slate-700 text-slate-300',
};

export function useMe() {
  const [me, setMe] = useState<MeData | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then((j) => alive && j && setMe(j)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return me;
}

interface Draft { id: string; title: string | null; mode: string; updatedAt: string }

/** "Recent": the user's projects that stay (autosaved Studio work), like conversations in an AI chat app. */
function Recents({ lang, base }: { lang: Lang; base: string }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const load = () => fetch('/api/drafts?limit=12').then((r) => (r.ok ? r.json() : null)).then((j) => setDrafts(j?.drafts ?? [])).catch(() => {});
    load();
    setCurrent(new URLSearchParams(window.location.search).get('draft'));
    window.addEventListener('synthia:drafts', load);
    return () => window.removeEventListener('synthia:drafts', load);
  }, []);
  const remove = async (id: string) => {
    if (!confirm(lang === 'fr' ? 'Supprimer ce projet de la liste ? (les vidéos déjà créées restent dans la Bibliothèque)' : 'Remove this project from the list? (videos already made stay in the Library)')) return;
    await fetch(`/api/drafts/${id}`, { method: 'DELETE' });
    setDrafts((d) => (d ?? []).filter((x) => x.id !== id));
  };
  const icon: Record<string, string> = { ai: '✨', manual: '🎬', narration: '🎙️' };
  return (
    <div className="mt-4 min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-3 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-slate-500">{lang === 'fr' ? 'Récents' : 'Recent'}</span>
        <a href={base} className="text-[11px] text-violet-400 hover:text-violet-300">＋ {lang === 'fr' ? 'Nouveau' : 'New'}</a>
      </div>
      <div className="overflow-y-auto max-h-56 space-y-0.5 pr-1">
        {drafts === null ? <div className="h-6 mx-3 rounded bg-white/5 animate-pulse" /> : drafts.length === 0 ? (
          <p className="px-3 text-[11px] text-slate-600">{lang === 'fr' ? 'Vos projets apparaîtront ici et resteront disponibles.' : 'Your projects will appear here and stay available.'}</p>
        ) : drafts.map((d) => (
          <div key={d.id} className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${current === d.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
            <a href={`${base}?draft=${d.id}`} className="flex-1 min-w-0 truncate" title={d.title ?? ''}>
              {icon[d.mode] ?? '✨'} {d.title || (lang === 'fr' ? 'Sans titre' : 'Untitled')}
            </a>
            <button onClick={() => remove(d.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-300" aria-label="delete">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageMeter({ me, lang }: { me: MeData | null; lang: Lang }) {
  if (!me) return <div className="h-24 rounded-2xl bg-white/5 animate-pulse" />;
  const { plan, used, limit, unlimited } = me.usage;
  const pct = unlimited ? 12 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div className="rounded-2xl border border-[#2A2A45] bg-gradient-to-br from-violet-600/15 to-pink-600/10 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${PLAN_STYLE[plan] ?? PLAN_STYLE.free}`}>{plan}</span>
        <span className="text-xs text-slate-400">
          {unlimited ? '∞' : `${used}/${limit}`} {lang === 'fr' ? 'vidéos ce mois' : 'videos this month'}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-amber-400' : 'bg-gradient-to-r from-violet-500 to-pink-500'}`} style={{ width: `${pct}%` }} />
      </div>
      {plan !== 'studio' && (
        <a href={`/${lang}/dashboard/account`}
          className="mt-3 block text-center text-xs font-semibold py-2 rounded-lg bg-white text-black hover:bg-slate-200 transition-colors">
          {lang === 'fr' ? '⚡ Passer à la vitesse supérieure' : '⚡ Upgrade'}
        </a>
      )}
    </div>
  );
}

export default function Shell({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { data: session } = useSession();
  const me = useMe();
  const base = `/${lang}/dashboard`;
  const current = pathname.replace(base, '') || '';
  const otherLang = lang === 'fr' ? 'en' : 'fr';
  const name = session?.user?.name ?? session?.user?.email ?? '';

  const isActive = (href: string) => (href === '' ? current === '' : current === href || current.startsWith(`${href}/`));

  return (
    <div className="min-h-screen bg-[#0B0B16] text-slate-200 lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-[#1F1F38] bg-[#0F0F1D] p-4">
        <a href={`/${lang}`} className="flex items-center gap-2 px-2 py-2 mb-6">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-black shadow-lg shadow-violet-900/40">S</span>
          <span className="font-bold text-lg text-white tracking-tight">Synthia <span className="text-gradient">AI</span></span>
        </a>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <a key={n.href} href={`${base}${n.href}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                isActive(n.href)
                  ? 'bg-gradient-to-r from-violet-600/30 to-pink-600/10 text-white border border-violet-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
              <span className="text-base w-5 text-center">{n.icon}</span>
              <span className="font-medium">{lang === 'fr' ? n.fr : n.en}</span>
              {n.href === '/calendar' && (me?.stats.scheduled ?? 0) > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/30 text-violet-200">{me?.stats.scheduled}</span>
              )}
            </a>
          ))}
        </nav>
        <Recents lang={lang} base={base} />
        <div className="flex-1" />
        <div className="mb-3 mt-3"><InstallApp lang={lang} /></div>
        <UsageMeter me={me} lang={lang} />
        <div className="mt-4 flex items-center gap-2 px-1">
          <span className="w-8 h-8 rounded-full bg-[#2A2A45] flex items-center justify-center text-xs font-bold text-white uppercase">{name.slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-white truncate">{name}</div>
            <div className="flex gap-2 text-[11px]">
              <a href={pathname.replace(`/${lang}`, `/${otherLang}`)} className="text-slate-500 hover:text-white uppercase">{otherLang}</a>
              <button onClick={() => signOut({ callbackUrl: `/${lang}/login` })} className="text-slate-500 hover:text-white">
                {lang === 'fr' ? 'Déconnexion' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Top bar + tabs (mobile) */}
      <div className="lg:hidden sticky top-0 z-30 bg-[#0F0F1D]/95 backdrop-blur border-b border-[#1F1F38]">
        <div className="flex items-center justify-between px-4 h-14">
          <a href={`/${lang}`} className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-black text-sm">S</span>
            <span className="font-bold text-white">Synthia AI</span>
          </a>
          <div className="flex items-center gap-3 text-xs">
            <InstallApp lang={lang} compact />
            {me && <span className="text-slate-400">{me.usage.unlimited ? '∞' : `${me.usage.used}/${me.usage.limit}`}</span>}
            <a href={pathname.replace(`/${lang}`, `/${otherLang}`)} className="text-slate-400 uppercase">{otherLang}</a>
            <button onClick={() => signOut({ callbackUrl: `/${lang}/login` })} className="text-slate-400">⎋</button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((n) => (
            <a key={n.href} href={`${base}${n.href}`}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${
                isActive(n.href) ? 'bg-violet-600 text-white' : 'text-slate-400 bg-white/5'}`}>
              {n.icon} {lang === 'fr' ? n.fr : n.en}
            </a>
          ))}
        </nav>
      </div>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

/** Small shared UI bits for dashboard pages. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-slate-400 text-sm mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export const inputCls = 'w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors text-sm';
export const btnPrimary = 'px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all';
export const btnGhost = 'px-3 py-2 rounded-lg border border-[#2A2A45] text-slate-300 hover:border-violet-500 hover:text-white text-xs transition-all';
