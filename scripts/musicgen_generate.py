#!/usr/bin/env python3
"""
Synthia AI — MusicGen audio generation script
Requires: pip install audiocraft torch torchaudio pydub
Usage:    python musicgen_generate.py --mood energetic --bpm 128 --duration 30 --output /path/out.mp3
"""

import argparse
import sys
import os
import tempfile

def parse_args():
    p = argparse.ArgumentParser(description='Generate music with Meta MusicGen')
    p.add_argument('--mood',     required=True,        help='Music mood/style')
    p.add_argument('--bpm',      type=int, default=120, help='Beats per minute')
    p.add_argument('--duration', type=int, default=30,  help='Duration in seconds')
    p.add_argument('--output',   required=True,         help='Output .mp3 path')
    return p.parse_args()


MOOD_PROMPTS = {
    'energetic':  'upbeat energetic electronic music with driving beat and synths',
    'calm':       'calm relaxing ambient music with soft piano and pads',
    'dramatic':   'dramatic cinematic orchestral music with strings and percussion',
    'happy':      'happy uplifting pop music with bright chords and melody',
    'mysterious': 'mysterious dark ambient music with eerie tones and slow rhythm',
    'corporate':  'professional corporate background music with clean guitar and light percussion',
    'romantic':   'romantic smooth jazz with saxophone and soft piano',
    'epic':       'epic powerful orchestral music with choir and heavy drums',
    'lofi':       'lo-fi hip hop chill beats with vinyl crackle and soft drums',
    'cinematic':  'cinematic trailer music with deep bass and rising strings',
}


def generate(mood: str, bpm: int, duration: int, output_path: str):
    try:
        import torch
        from audiocraft.models import MusicGen
        from audiocraft.data.audio import audio_write
    except ImportError as e:
        print(f'[MusicGen] Import error: {e}', file=sys.stderr)
        print('[MusicGen] Install with: pip install audiocraft torch torchaudio', file=sys.stderr)
        sys.exit(1)

    prompt = MOOD_PROMPTS.get(mood, f'{mood} music, {bpm} BPM')
    prompt = f'{prompt}, {bpm} BPM, high quality'

    print(f'[MusicGen] Prompt: {prompt}', file=sys.stderr)
    print(f'[MusicGen] Duration: {duration}s', file=sys.stderr)

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'[MusicGen] Device: {device}', file=sys.stderr)

    # Load model (use 'small' for speed, 'medium' or 'large' for quality)
    model_size = os.environ.get('MUSICGEN_MODEL', 'small')
    model = MusicGen.get_pretrained(model_size, device=device)
    model.set_generation_params(duration=duration)

    # Generate
    wav = model.generate([prompt])  # shape: [1, channels, samples]

    # Save as wav first, then convert to mp3
    tmp_path = output_path.replace('.mp3', '_tmp')
    audio_write(
        tmp_path,
        wav[0].cpu(),
        model.sample_rate,
        strategy='loudness',
        loudness_compressor=True,
    )

    # Convert to mp3 with pydub
    wav_path = tmp_path + '.wav'
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_wav(wav_path)
        audio.export(output_path, format='mp3', bitrate='192k')
        os.remove(wav_path)
    except ImportError:
        # Fall back: rename wav to output path
        os.rename(wav_path, output_path.replace('.mp3', '.wav'))
        output_path = output_path.replace('.mp3', '.wav')

    print(output_path)  # stdout: final path consumed by Node.js


if __name__ == '__main__':
    args = parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    generate(args.mood, args.bpm, args.duration, args.output)
