import { updateProject } from '../projects';
import { listenCheck, transcribe, whisperAvailable, type ListenResult } from './listen';
import { voiceCheck, finalCheck, type VoiceCheck, type FinalCheck } from './audio';
import { reviewUntilClean, type ReviewResult } from './review';
import type { JsonEngine } from '../groq';

/**
 * Synthia quality control, at 100 % on every step (the creator's ESENGO editing rules):
 *  1. Script: grammar, spelling, typography, what a voice would misread → auto-corrected until 0 error, BEFORE the voice.
 *  2. Voice: whisper.cpp listens to it → 100 % of the script's words heard as written (pronunciation / phonetics).
 *  3. Voice: clear and natural → no clipping, peak ≤ -1 dBFS (auto headroom), clear speaking rate, pitch never shifted.
 *  4. Final video: video + audio streams, no saturation.
 *  5. Nothing is published before the creator approves the video (approved_at), after any (re)render.
 * Any failed step holds the video and the report says exactly why.
 */

export interface QaStep { step: 'grammar' | 'pronunciation' | 'voice' | 'final' | 'transcript'; ok: boolean; summary: string; details?: unknown }
export interface QaReport { ok: boolean; steps: QaStep[]; checkedAt: string }

const report = (steps: QaStep[]): QaReport => ({ ok: steps.every((s) => s.ok), steps, checkedAt: new Date().toISOString() });

/** Step 1 (before the voice): returns the corrected script, or throws QaError with the report. */
export async function qaScript(projectId: string, script: string, lang: string, engine: JsonEngine | null): Promise<string> {
  await updateProject(projectId, { qaStatus: 'running' });
  const r: ReviewResult = await reviewUntilClean(script, lang, engine);
  const step: QaStep = {
    step: 'grammar', ok: r.ok,
    summary: r.ok ? `0 faute (${r.corrections.length} correction(s) automatique(s), ${r.rounds} relecture(s))`
      : `${r.remaining.length} faute(s) restante(s) après ${r.rounds} relectures`,
    details: { corrections: r.corrections.slice(0, 60), remaining: r.remaining.slice(0, 30) },
  };
  if (!r.ok) {
    await hold(projectId, report([step]));
    throw new QaError(step.summary);
  }
  await updateProject(projectId, { qaReport: report([step]), script: r.text });
  return r.text;
}

/** Steps 2-3 (voice made, before the render). Fixes the peak once; holds the video if anything is below 100 %. */
export async function qaVoice(projectId: string, voicePath: string, script: string, lang: string, previous?: QaReport | null): Promise<void> {
  await updateProject(projectId, { qaStatus: 'running' });
  const steps: QaStep[] = (previous?.steps ?? []).filter((s) => s.step === 'grammar');
  const v: VoiceCheck = await voiceCheck(voicePath, script);
  steps.push({ step: 'voice', ok: v.ok,
    summary: v.ok ? `voix claire : crête ${v.stats.peakDb.toFixed(1)} dBFS, 0 saturation, ${v.wordsPerMinute} mots/min${v.fixed ? ' (marge ajoutée)' : ''}`
      : v.problems.join(' ; '), details: { stats: v.stats, wordsPerMinute: v.wordsPerMinute } });
  const l: ListenResult = await listenCheck(voicePath, script, lang, 1);
  steps.push({ step: 'pronunciation', ok: l.ok,
    summary: l.skipped ? 'écoute impossible : whisper.cpp absent du serveur'
      : `${l.matched}/${l.total} mots entendus comme écrits (${(l.score * 100).toFixed(1)} %)`,
    details: { gaps: l.gaps, heard: l.heardText.slice(0, 4000) } });
  const r = report(steps);
  if (!r.ok) { await hold(projectId, r); throw new QaError(steps.filter((s) => !s.ok).map((s) => s.summary).join(' | ')); }
  await updateProject(projectId, { qaReport: r });
}

/** Step 4 (after the render). Passing it makes the video "ready, waiting for your approval". */
export async function qaFinal(projectId: string, video: string, previous?: QaReport | null): Promise<boolean> {
  const f: FinalCheck = await finalCheck(video);
  const steps = [...(previous?.steps ?? []).filter((s) => s.step !== 'final'),
    { step: 'final' as const, ok: f.ok, summary: f.ok ? `vidéo + son OK, crête ${f.stats?.peakDb.toFixed(1)} dBFS, 0 saturation` : f.problems.join(' ; '),
      details: f.stats }];
  const r = report(steps);
  await updateProject(projectId, { qaReport: r, qaStatus: r.ok ? 'passed' : 'failed', approvedAt: null });
  return r.ok;
}

/** Videos made elsewhere (import, AI generation): technical check + what the voice says, then the creator decides. */
export async function qaImported(projectId: string, video: string, lang = 'auto'): Promise<void> {
  const f = await finalCheck(video).catch(() => null);
  const steps: QaStep[] = [{ step: 'final', ok: Boolean(f?.ok), summary: f ? (f.ok ? 'vidéo + son OK' : f.problems.join(' ; ')) : 'contrôle impossible' }];
  if (f?.hasAudio && whisperAvailable()) {
    const text = await transcribe(video, lang).catch(() => '');
    steps.push({ step: 'transcript', ok: true, summary: text ? 'texte entendu : à relire avant d’approuver' : 'aucune parole détectée', details: { heard: text.slice(0, 6000) } });
  }
  await updateProject(projectId, { qaReport: report(steps), qaStatus: f && !f.ok ? 'failed' : 'manual', approvedAt: null });
}

/** Full check of an existing video (made before the quality control existed, or to re-check): nothing is modified. */
export async function qaExisting(projectId: string, video: string, script: string | null, lang: string): Promise<void> {
  await updateProject(projectId, { qaStatus: 'running', approvedAt: null });
  const steps: QaStep[] = [];
  if (script && script.trim()) {
    const g = await reviewUntilClean(script, lang, null, 1);
    steps.push({ step: 'grammar', ok: g.ok, summary: g.ok ? '0 faute' : `${g.remaining.length || g.corrections.length} faute(s) dans le script de la vidéo`,
      details: { remaining: (g.remaining.length ? g.remaining : g.corrections).slice(0, 30) } });
    const l = await listenCheck(video, script, lang, 1);
    steps.push({ step: 'pronunciation', ok: l.ok, summary: l.skipped ? 'écoute impossible' : `${l.matched}/${l.total} mots entendus comme écrits (${(l.score * 100).toFixed(1)} %)`,
      details: { gaps: l.gaps, heard: l.heardText.slice(0, 4000) } });
  }
  const f = await finalCheck(video);
  steps.push({ step: 'final', ok: f.ok, summary: f.ok ? `vidéo + son OK, crête ${f.stats?.peakDb.toFixed(1)} dBFS` : f.problems.join(' ; '), details: f.stats });
  if (!script) {
    const text = f.hasAudio && whisperAvailable() ? await transcribe(video, lang).catch(() => '') : '';
    steps.push({ step: 'transcript', ok: true, summary: text ? 'texte entendu : à relire avant d’approuver' : 'aucune parole détectée', details: { heard: text.slice(0, 6000) } });
  }
  const r = report(steps);
  await updateProject(projectId, { qaReport: r, qaStatus: !r.ok ? 'failed' : script ? 'passed' : 'manual' });
}

async function hold(projectId: string, r: QaReport) {
  const bad = r.steps.filter((s) => !s.ok).map((s) => s.summary).join(' | ');
  await updateProject(projectId, { qaStatus: 'failed', qaReport: r, approvedAt: null, status: 'failed',
    error: `Contrôle qualité non passé (vidéo retenue) / Quality check failed: ${bad}`.slice(0, 250) });
}

export class QaError extends Error {}
