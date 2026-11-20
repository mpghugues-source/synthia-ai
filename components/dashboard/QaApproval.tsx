'use client';

import { useCallback, useEffect, useState } from 'react';

type Lang = 'fr' | 'en';
interface Step { step: string; ok: boolean; summary: string; details?: { gaps?: { expected: string; heard: string }[]; heard?: string; corrections?: { text: string; fix: string }[]; remaining?: { text: string; fix: string; why?: string }[] } }
interface P { id: string; status: string; qaStatus: string | null; qaReport: { ok: boolean; steps: Step[] } | null; approvedAt: string | null }

const LABEL: Record<string, [string, string]> = {
  grammar: ['Grammaire, orthographe, typographie', 'Grammar, spelling, typography'],
  voice: ['Voix claire et naturelle', 'Clear, natural voice'],
  pronunciation: ['Prononciation et phonétique (écoute)', 'Pronunciation & phonetics (listening)'],
  final: ['Vidéo finale (image + son)', 'Final video (picture + sound)'],
  transcript: ['Ce que dit la vidéo', 'What the video says'],
};

/**
 * Quality report + the creator's approval. Every check must be at 100 %; then the creator watches the video and
 * approves it. Nothing is published (now, scheduled, or by an AI over MCP) without this approval.
 */
export default function QaApproval({ projectId, lang, onChange }: { projectId: string; lang: Lang; onChange?: (approved: boolean) => void }) {
  const fr = lang === 'fr';
  const [p, setP] = useState<P | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(() => fetch(`/api/projects/${projectId}`).then((r) => r.json()).then((j) => { setP(j.project); onChange?.(Boolean(j.project?.approvedAt)); }).catch(() => {}), [projectId, onChange]);
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!p || p.qaStatus === 'running' || p.status === 'rendering') void load(); }, 5000);
    return () => clearInterval(t);
  }, [load, p]);

  const approve = async (yes: boolean) => {
    setBusy(true); setErr('');
    const r = await fetch(`/api/projects/${projectId}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve: yes }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.message ?? j.error ?? 'Error'); return; }
    setP(j.project); onChange?.(Boolean(j.project?.approvedAt));
  };

  if (!p) return <div className="h-16 rounded-xl bg-white/5 animate-pulse" />;
  const steps = p.qaReport?.steps ?? [];
  const running = p.qaStatus === 'running' || p.status === 'rendering';
  const passed = p.qaStatus === 'passed' || p.qaStatus === 'manual';

  return (
    <div className="rounded-2xl border border-[#2A2A45] bg-black/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white">✅ {fr ? 'Contrôle qualité (100 % exigé)' : 'Quality check (100 % required)'}</div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${running ? 'bg-sky-500/20 text-sky-300' : passed ? 'bg-green-500/20 text-green-300' : p.qaStatus === 'failed' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-slate-400'}`}>
          {running ? (fr ? 'en cours…' : 'running…') : p.qaStatus === 'passed' ? (fr ? '100 % ✓' : '100 % ✓') : p.qaStatus === 'manual' ? (fr ? 'à vérifier par vous' : 'for you to check') : p.qaStatus === 'failed' ? (fr ? 'retenue' : 'held') : (fr ? 'non contrôlée' : 'not checked')}
        </span>
      </div>
      {steps.map((s) => (
        <div key={s.step} className="text-xs">
          <div className={s.ok ? 'text-green-300' : 'text-red-300'}>{s.ok ? '✓' : '✗'} <b>{(LABEL[s.step] ?? [s.step, s.step])[fr ? 0 : 1]}</b> — {s.summary}</div>
          {!s.ok && s.details?.gaps && s.details.gaps.length > 0 && (
            <ul className="mt-1 ml-4 list-disc text-slate-400">
              {s.details.gaps.slice(0, 12).map((g, i) => <li key={i}>{fr ? 'attendu' : 'expected'} « {g.expected} » — {fr ? 'entendu' : 'heard'} « {g.heard} »</li>)}
              <li className="list-none mt-1 text-slate-500">{fr ? 'Astuce : ajoutez la bonne prononciation dans Brand kit → Lexique de la voix, puis relancez.' : 'Tip: add the right pronunciation in Brand kit → Voice lexicon, then retry.'}</li>
            </ul>
          )}
          {!s.ok && s.details?.remaining && s.details.remaining.length > 0 && (
            <ul className="mt-1 ml-4 list-disc text-slate-400">{s.details.remaining.slice(0, 10).map((e, i) => <li key={i}>« {e.text} » → « {e.fix} » {e.why ? `(${e.why})` : ''}</li>)}</ul>
          )}
          {s.step === 'transcript' && s.details?.heard && (
            <details className="mt-1 ml-4 text-slate-400"><summary className="cursor-pointer">{fr ? 'Lire le texte entendu' : 'Read the transcript'}</summary><p className="mt-1 whitespace-pre-wrap">{s.details.heard}</p></details>
          )}
        </div>
      ))}
      {passed && !running && (
        p.approvedAt ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-300">✓ {fr ? 'Approuvée par vous le' : 'Approved by you on'} {new Date(p.approvedAt).toLocaleString(lang)}</span>
            <button disabled={busy} onClick={() => approve(false)} className="text-xs text-slate-400 underline">{fr ? 'Retirer' : 'Withdraw'}</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">{fr ? 'Regardez la vidéo en entier, puis approuvez-la. Sans votre approbation, rien n’est publié (ni maintenant, ni programmé, ni par une IA).' : 'Watch the whole video, then approve it. Without your approval nothing is published (now, scheduled, or by an AI).'}</p>
            <button disabled={busy} onClick={() => approve(true)} className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-50">
              {fr ? '👍 J’ai regardé la vidéo, j’approuve sa publication' : '👍 I watched the video, I approve its publication'}
            </button>
          </div>
        )
      )}
      {!running && p.status === 'ready' && (!p.qaStatus || p.qaStatus === 'failed') && (
        <button disabled={busy} onClick={async () => { setBusy(true); await fetch(`/api/projects/${projectId}/qa`, { method: 'POST' }); setBusy(false); setP({ ...p, qaStatus: 'running' }); }}
          className="w-full py-2 rounded-xl border border-violet-500/50 text-violet-200 text-sm hover:bg-violet-500/10 disabled:opacity-50">
          🔎 {p.qaStatus === 'failed' ? (fr ? 'Relancer le contrôle qualité' : 'Run the quality check again') : (fr ? 'Lancer le contrôle qualité (obligatoire avant publication)' : 'Run the quality check (required before publishing)')}
        </button>
      )}
      {err && <p className="text-xs text-amber-300">{err}</p>}
    </div>
  );
}
