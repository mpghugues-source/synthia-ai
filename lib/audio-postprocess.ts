import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';

/**
 * Strip leading/trailing silence from a single TTS chunk.
 * Applied before concatenation so chunks butt up cleanly against each other.
 */
export async function stripChunkSilence(filePath: string): Promise<void> {
  const tmp = filePath + '.strip.wav';
  await new Promise<void>((resolve) => {
    ffmpeg(filePath)
      .audioFilters([
        // Remove silence shorter than 60 ms at start and end
        'silenceremove=start_periods=1:start_duration=0.06:start_threshold=-55dB:stop_periods=1:stop_duration=0.06:stop_threshold=-55dB',
      ])
      .audioCodec('pcm_s16le')
      .output(tmp)
      .on('end', () => {
        try {
          if (fs.existsSync(tmp) && fs.statSync(tmp).size > 100) {
            fs.renameSync(tmp, filePath);
          } else {
            try { fs.unlinkSync(tmp); } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
        resolve();
      })
      .on('error', () => {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        resolve(); // keep the original on failure — don't break the pipeline
      })
      .run();
  });
}

/**
 * Full audio enhancement for the final concatenated voice track:
 *  1. High-pass 80 Hz  — removes mic rumble and low-frequency hum
 *  2. FFT denoising     — removes hiss, XTTS CPU artefacts, background air
 *  3. Silence removal   — collapses any remaining gap > 600 ms between chunks
 *  4. Dynamic norm      — equalises volume across the whole track
 */
export async function enhanceVoiceAudio(inputPath: string, outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters([
        'highpass=f=80',
        'afftdn=nf=-20:nr=0.7',
        'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-55dB:stop_periods=-1:stop_duration=0.6:stop_threshold=-55dB',
        'dynaudnorm=g=5:p=0.95',
      ])
      .audioCodec('pcm_s16le')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => {
        // Enhancement failed — fall back to raw audio so the pipeline doesn't die
        console.warn('[audio-postprocess] enhanceVoiceAudio failed, keeping raw audio:', err.message);
        try { fs.copyFileSync(inputPath, outputPath); } catch { /* ignore */ }
        resolve();
      })
      .run();
  });
}
