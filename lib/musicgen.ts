import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const SCRIPT = process.env.MUSICGEN_SCRIPT ?? path.join(process.cwd(), 'scripts', 'musicgen_generate.py');
// Use the virtualenv python that has audiocraft installed
const PYTHON  = process.env.MUSICGEN_PYTHON ?? process.env.PYTHON_BIN ?? '/opt/musicgen-env/bin/python3';

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

    // No timeout: MusicGen on CPU can take 30-90 min. Let it finish.
    const proc = spawn(PYTHON, [
      SCRIPT,
      '--mood', mood,
      '--bpm', String(bpm),
      '--duration', String(duration),
      '--output', outputPath,
    ]);

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
