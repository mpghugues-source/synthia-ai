'use client';

import { useEffect, useState } from 'react';
import { inputCls, btnPrimary } from './Shell';

interface Entry { id: number; lang: string; word: string; spoken: string }

/** Brand kit → voice lexicon (ESENGO method: fix a mispronounced word by spelling it as it should sound). */
export default function LexiconEditor({ lang }: { lang: 'fr' | 'en' }) {
  const fr = lang === 'fr';
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState({ lang, word: '', spoken: '' });
  useEffect(() => { fetch('/api/lexicon').then((r) => r.json()).then((j) => setEntries(j.entries ?? [])).catch(() => {}); }, []);
  const add = async () => {
    const r = await fetch('/api/lexicon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const j = await r.json(); if (r.ok) { setEntries(j.entries); setForm({ ...form, word: '', spoken: '' }); }
  };
  const del = async (id: number) => { const j = await fetch(`/api/lexicon?id=${id}`, { method: 'DELETE' }).then((r) => r.json()); setEntries(j.entries ?? []); };
  return (
    <div className="rounded-3xl border border-[#2A2A45] bg-[#13132A] p-5 space-y-3">
      <div>
        <div className="text-white font-semibold">🗣️ {fr ? 'Lexique de la voix (prononciation)' : 'Voice lexicon (pronunciation)'}</div>
        <p className="text-xs text-slate-400 mt-1">{fr
          ? 'Si le contrôle qualité signale un mot mal prononcé, écrivez-le comme il doit sonner (ex. GitHub → Guite-Heub). Seule la voix l’utilise : les sous-titres gardent la vraie orthographe.'
          : 'If the quality check flags a mispronounced word, spell it the way it should sound (e.g. GitHub → Guit-Hub). Only the voice uses it: subtitles keep the real spelling.'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value as 'fr' })} className={`${inputCls} py-2 w-24`}>
          {['fr', 'en', 'es', 'pt', 'sw', 'de', 'it', 'ar'].map((l) => <option key={l}>{l}</option>)}
        </select>
        <input value={form.word} onChange={(e) => setForm({ ...form, word: e.target.value })} placeholder={fr ? 'Mot écrit' : 'Written word'} className={`${inputCls} py-2 w-40`} />
        <input value={form.spoken} onChange={(e) => setForm({ ...form, spoken: e.target.value })} placeholder={fr ? 'Comment le dire' : 'How to say it'} className={`${inputCls} py-2 w-48`} />
        <button disabled={!form.word.trim() || !form.spoken.trim()} onClick={add} className={`${btnPrimary} py-2`}>{fr ? 'Ajouter' : 'Add'}</button>
      </div>
      {entries.length > 0 && (
        <div className="divide-y divide-[#2A2A45] text-sm">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 py-1.5">
              <span className="text-[11px] uppercase text-slate-500 w-6">{e.lang}</span>
              <span className="text-white">{e.word}</span><span className="text-slate-500">→</span><span className="text-violet-300 flex-1">{e.spoken}</span>
              <button onClick={() => del(e.id)} className="text-slate-500 hover:text-red-300">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
