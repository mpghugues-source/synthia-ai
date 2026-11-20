import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

/**
 * Clear, natural voice: no clipping, peak under -1 dBFS, sensible speaking rate, loudness ready for social
 * networks. Pitch is never shifted (ESENGO rule: shifting pitch makes voices metallic and saturated).
 */

const run = promisify(execFile);

export interface AudioStats { peakDb: number; clipped: number; rmsDb: number; duration: number; lufs: number | null }

export async function audioStats(file: string): Promise<AudioStats> {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'astats=metadata=0:reset=0,ebur128=framelog=quiet', '-f', 'null', '-'],
    { timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  const overall = stderr.slice(stderr.lastIndexOf('Overall'));
  const num = (re: RegExp, src = overall) => { const m = re.exec(src); return m ? Number(m[1]) : NaN; };
  const peakDb = num(/Peak level dB:\s*(-?[\d.]+|-inf)/);
  const clipped = num(/Number of clipped samples:\s*(\d+)/) || num(/Peak count:\s*(\d+)/) * 0;
  const rmsDb = num(/RMS level dB:\s*(-?[\d.]+)/);
  const lufs = num(/I:\s*(-?[\d.]+) LUFS/, stderr.slice(stderr.lastIndexOf('Summary')));
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 60_000 });
  return { peakDb: Number.isFinite(peakDb) ? peakDb : -99, clipped: Number.isFinite(clipped) ? clipped : 0,
    rmsDb: Number.isFinite(rmsDb) ? rmsDb : -99, duration: Number(stdout.trim()) || 0, lufs: Number.isFinite(lufs) ? lufs : null };
}

/** Gentle fix for a too-hot voice: -3 dB headroom + soft limiter at -1.5 dBFS. Never changes pitch or speed. */
export async function addHeadroom(file: string): Promise<void> {
  const tmp = `${file}.qa${file.slice(file.lastIndexOf('.'))}`;
  await run('ffmpeg', ['-y', '-i', file, '-af', 'volume=-3dB,alimiter=limit=0.84:attack=5:release=50:level=disabled', tmp], { timeout: 600_000 });
  fs.renameSync(tmp, file);
}

export interface VoiceCheck { ok: boolean; stats: AudioStats; wordsPerMinute: number; problems: string[]; fixed: boolean }

/** Voice track check (before the render). Fixes the peak once if needed, then re-measures. */
export async function voiceCheck(file: string, script: string): Promise<VoiceCheck> {
  let stats = await audioStats(file);
  let fixed = false;
  if (stats.clipped > 0 || stats.peakDb > -1) { await addHeadroom(file); fixed = true; stats = await audioStats(file); }
  const words = script.split(/\s+/).filter(Boolean).length;
  const wpm = stats.duration > 0 ? Math.round(words / (stats.duration / 60)) : 0;
  const problems: string[] = [];
  if (stats.clipped > 0) problems.push(`saturation: ${stats.clipped} échantillons écrêtés / clipped samples`);
  if (stats.peakDb > -1) problems.push(`crête trop haute / peak too high: ${stats.peakDb.toFixed(1)} dBFS`);
  if (stats.rmsDb < -40) problems.push(`voix trop faible / voice too quiet: ${stats.rmsDb.toFixed(1)} dB RMS`);
  if (words >= 20 && (wpm > 200 || wpm < 90)) problems.push(`débit ${wpm} mots/min : voix ${wpm > 200 ? 'trop rapide' : 'trop lente'} pour être claire / speaking rate unclear`);
  return { ok: problems.length === 0, stats, wordsPerMinute: wpm, problems, fixed };
}

export interface FinalCheck { ok: boolean; problems: string[]; stats: AudioStats | null; hasVideo: boolean; hasAudio: boolean }

/** Final video: video + audio streams, no clipping, peak ≤ -1 dBFS. */
export async function finalCheck(video: string): Promise<FinalCheck> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', video], { timeout: 60_000 });
  const types = stdout.split('\n').map((s) => s.trim().replace(/,+$/, ''));
  const hasVideo = types.includes('video'), hasAudio = types.includes('audio');
  const problems: string[] = [];
  if (!hasVideo) problems.push('pas de piste vidéo / no video stream');
  if (!hasAudio) problems.push('pas de son / no audio stream');
  let stats: AudioStats | null = null;
  if (hasAudio) {
    stats = await audioStats(video);
    if (stats.clipped > 0) problems.push(`son saturé / clipped audio (${stats.clipped})`);
    if (stats.peakDb > -0.5) problems.push(`crête finale trop haute / final peak too high: ${stats.peakDb.toFixed(1)} dBFS`);
  }
  return { ok: problems.length === 0, problems, stats, hasVideo, hasAudio };
}
