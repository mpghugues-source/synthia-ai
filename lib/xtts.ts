import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE = process.env.XTTS_URL ?? 'http://127.0.0.1:8020';

export interface TTSOptions {
  text: string;
  speakerWavPath?: string;
  language?: string;
  speed?: number;
}

export async function synthesizeVoice(opts: TTSOptions): Promise<Buffer> {
  const { text, speakerWavPath, language = 'fr', speed = 1.0 } = opts;

  if (speakerWavPath) {
    // Cloning mode: send sample WAV for voice cloning
    const form = new FormData();
    form.append('text', text);
    form.append('language', language);
    form.append('speed', String(speed));
    form.append('speaker_wav', fs.createReadStream(speakerWavPath), {
      filename: path.basename(speakerWavPath),
      contentType: 'audio/wav',
    });

    const response = await axios.post(`${BASE}/tts_to_audio/`, form, {
      headers: form.getHeaders(),
      responseType: 'arraybuffer',
      timeout: 180_000,
    });

    return Buffer.from(response.data);
  }

  // Standard TTS mode (no cloning)
  const response = await axios.post(
    `${BASE}/tts`,
    { text, language, speed },
    { responseType: 'arraybuffer', timeout: 420_000 }   // 7 min per chunk on slow CPU
  );

  return Buffer.from(response.data);
}

export async function synthesizeAndSave(
  opts: TTSOptions,
  outputPath: string
): Promise<string> {
  const buffer = await synthesizeVoice(opts);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await axios.get(`${BASE}/health`, { timeout: 5_000 });
    return res.status === 200;
  } catch {
    return false;
  }
}
