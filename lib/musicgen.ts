import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const SCRIPT = process.env.MUSICGEN_SCRIPT ?? path.join(process.cwd(), 'scripts', 'musicgen_generate.py');
const PYTHON  = process.env.PYTHON_BIN ?? 'python3';

export type MusicMood =
  | 'energetic' | 'calm' | 'dramatic' | 'happy' | 'mysterious'
  | 'corporate' | 'romantic' | 'epic' | 'lofi' | 'cinematic';

export interface MusicGenOptions {
  mood: MusicMood;
  bpm?: number;
  duration?: number;
  outputDir: string;
  jobId: string;
}

export function generateMusic(opts: MusicGenOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const { mood, bpm = 120, duration = 30, outputDir, jobId } = opts;
    const outputPath = path.join(outputDir, `music_${jobId}.mp3`);

    fs.mkdirSync(outputDir, { recursive: true });

    const proc = spawn(PYTHON, [
      SCRIPT,
      '--mood', mood,
      '--bpm', String(bpm),
      '--duration', String(duration),
      '--output', outputPath,
    ], { timeout: 300_000 });

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`MusicGen exited ${code}: ${stderr}`));
        return;
      }
      if (!fs.existsSync(outputPath)) {
        reject(new Error(`MusicGen output not found at ${outputPath}`));
        return;
      }
      resolve(outputPath);
    });

    proc.on('error', reject);
  });
}
