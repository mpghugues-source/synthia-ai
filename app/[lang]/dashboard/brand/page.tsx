'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import LexiconEditor from '@/components/dashboard/LexiconEditor';
import { PageHeader, inputCls, btnPrimary } from '@/components/dashboard/Shell';

type Lang = 'fr' | 'en';
type Caption = 'box' | 'bold' | 'minimal' | 'neon' | 'none';

interface Brand {
  watermark: string | null; captionStyle: Caption; defaultLang: string;
  defaultFormat: string; defaultVoice: string | null; tone: string | null;
}

const CAPTIONS: { id: Caption; fr: string; en: string; cls: string }[] = [
  { id: 'box', fr: 'Encadré', en: 'Boxed', cls: 'bg-black/70 text-white font-bold px-2 py-1 rounded' },
  { id: 'bold', fr: 'Viral (jaune)', en: 'Viral (yellow)', cls: 'text-yellow-300 font-black text-lg [text-shadow:0_3px_0_#000,0_0_8px_#000]' },
  { id: 'minimal', fr: 'Minimal', en: 'Minimal', cls: 'text-white/90 [text-shadow:0_1px_3px_#000]' },
  { id: 'neon', fr: 'Néon', en: 'Neon', cls: 'text-fuchsia-300 font-bold [text-shadow:0_0_6px_#22d3ee,0_0_14px_#22d3ee]' },
  { id: 'none', fr: 'Sans sous-titres', en: 'No captions', cls: 'hidden' },
];
const LANGS = [['fr', 'Français'], ['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['sw', 'Kiswahili'], ['de', 'Deutsch'], ['it', 'Italiano'], ['ar', 'العربية']];
const FORMATS = [['1080x1920', '9:16 — Shorts / TikTok / Reels'], ['1920x1080', '16:9 — YouTube'], ['1080x1080', '1:1 — Feed']];

export default function BrandPage() {
  const params = useParams();
  const lang: Lang = params?.lang === 'en' ? 'en' : 'fr';
  const [b, setB] = useState<Brand | null>(null);
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/brand').then((r) => r.json()).then((j) => setB(j.brand)).catch(() => {});
    fetch('/api/voices').then((r) => r.json()).then((j) => setVoices(j.voices ?? [])).catch(() => {});
  }, []);

  const save = async () => {
    if (!b) return;
    setBusy(true); setSaved('');
    const res = await fetch('/api/brand', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    setBusy(false);
    setSaved(res.ok ? (lang === 'fr' ? '✓ Enregistré — appliqué à vos prochaines vidéos.' : '✓ Saved — applied to your next videos.') : 'Error');
  };

  if (!b) return <div className="p-8"><div className="h-64 rounded-3xl bg-white/5 animate-pulse" /></div>;
  const set = (patch: Partial<Brand>) => { setB({ ...b, ...patch }); setSaved(''); };
  const cap = CAPTIONS.find((c) => c.id === b.captionStyle) ?? CAPTIONS[0];
  const ratio = b.defaultFormat === '1920x1080' ? 'aspect-video w-full' : b.defaultFormat === '1080x1080' ? 'aspect-square w-72' : 'aspect-[9/16] w-60';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader title="Brand kit 🎨"
        subtitle={lang === 'fr'
          ? 'Votre identité appliquée automatiquement à chaque vidéo : filigrane, style de sous-titres, ton, langue et voix par défaut.'
          : 'Your identity applied to every video automatically: watermark, caption style, tone, default language and voice.'} />

      <div className="grid lg:grid-cols-[1fr_auto] gap-8">
        <div className="space-y-6">
          <div className="glow-card rounded-3xl p-5 space-y-4">
            <label className="block">
              <span className="text-sm text-slate-300">{lang === 'fr' ? 'Filigrane (votre @ ou votre marque)' : 'Watermark (your handle or brand)'}</span>
              <input value={b.watermark ?? ''} maxLength={60} onChange={(e) => set({ watermark: e.target.value })}
                placeholder="@mon_compte" className={`${inputCls} mt-2`} />
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">{lang === 'fr' ? 'Ton de la marque (utilisé par l’IA)' : 'Brand tone of voice (used by the AI)'}</span>
              <input value={b.tone ?? ''} maxLength={255} onChange={(e) => set({ tone: e.target.value })}
                placeholder={lang === 'fr' ? 'ex : chaleureux, direct, tutoiement, avec une touche d’humour' : 'e.g. warm, direct, a touch of humour'}
                className={`${inputCls} mt-2`} />
            </label>
          </div>

          <div className="glow-card rounded-3xl p-5">
            <span className="text-sm text-slate-300">{lang === 'fr' ? 'Style des sous-titres' : 'Caption style'}</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
              {CAPTIONS.map((c) => (
                <button key={c.id} onClick={() => set({ captionStyle: c.id })}
                  className={`rounded-2xl border p-3 text-xs transition-all ${b.captionStyle === c.id ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-[#2A2A45] text-slate-400 hover:border-violet-500/50'}`}>
                  {lang === 'fr' ? c.fr : c.en}
                </button>
              ))}
            </div>
          </div>

          <div className="glow-card rounded-3xl p-5 grid sm:grid-cols-3 gap-4">
            <label className="block text-sm text-slate-300">{lang === 'fr' ? 'Langue par défaut' : 'Default language'}
              <select value={b.defaultLang} onChange={(e) => set({ defaultLang: e.target.value })} className={`${inputCls} mt-2`}>
                {LANGS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
            </label>
            <label className="block text-sm text-slate-300">{lang === 'fr' ? 'Format par défaut' : 'Default format'}
              <select value={b.defaultFormat} onChange={(e) => set({ defaultFormat: e.target.value })} className={`${inputCls} mt-2`}>
                {FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
            </label>
            <label className="block text-sm text-slate-300">{lang === 'fr' ? 'Voix par défaut' : 'Default voice'}
              <select value={b.defaultVoice ?? ''} onChange={(e) => set({ defaultVoice: e.target.value || null })} className={`${inputCls} mt-2`}>
                <option value="">—</option>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? '…' : (lang === 'fr' ? 'Enregistrer' : 'Save')}</button>
            {saved && <span className="text-sm text-green-300">{saved}</span>}
          </div>
        </div>

        {/* Live preview */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-slate-500">{lang === 'fr' ? 'Aperçu' : 'Preview'}</span>
          <div className={`${ratio} relative rounded-3xl overflow-hidden border border-[#2A2A45] shadow-2xl shadow-violet-900/30 bg-[radial-gradient(ellipse_at_top,_#6d28d9_0%,_#1e1b4b_45%,_#0b0b16_100%)]`}>
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
            {b.watermark && (
              <span className="absolute top-3 right-3 text-[11px] font-bold text-white/90 bg-black/35 px-2 py-1 rounded">{b.watermark}</span>
            )}
            <div className="absolute inset-x-0 bottom-[14%] flex justify-center px-4 text-center">
              <span className={`text-sm ${cap.cls}`}>{lang === 'fr' ? 'Personne ne vous dit ça…' : 'Nobody tells you this…'}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-8"><LexiconEditor lang={lang === 'en' ? 'en' : 'fr'} /></div>
    </div>
  );
}
