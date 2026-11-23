#!/usr/bin/env python3
"""Сведение: музыка приглушается под голосом, итог нормализуется до −16 LUFS, пики ≤ −1.5 dBTP.
  mix.py build/music.wav [build/vo_aligned.wav] [--out build/mix.wav]
Без голоса — просто нормализует музыку (версия с субтитрами до записи озвучки).
Музыка: −6 дБ в паузах речи, ≈ −15 дБ под голосом (атака 20 мс, отпускание 450 мс).
Лимитер — с передискретизацией до 192 кГц: обычный alimiter на 48 кГц пропускает межвыборочные пики
(true peak доходил до −0.4 dBTP на ускоренной озвучке); так пик держится ≈ −1.9 dBTP.
"""
import argparse, re, subprocess, sys
import numpy as np
from scipy.io import wavfile

SR = 48000

def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64).reshape(-1, 2)

def lufs(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    i = re.findall(r'I:\s+(-?[\d.]+) LUFS', r); p = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r)
    return float(i[-1]), (float(p[-1]) if p else None)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('music'); ap.add_argument('voice', nargs='?')
    ap.add_argument('--out', default='build/mix.wav'); ap.add_argument('--target', type=float, default=-16.0)
    a = ap.parse_args()
    m = load(a.music)
    if a.voice:
        v = load(a.voice)[:, 0]; N = max(len(m), len(v))
        m = np.pad(m, ((0, N - len(m)), (0, 0))); v = np.pad(v, (0, N - len(v)))
        e = np.abs(v); blk = 64; att, rel = np.exp(-blk / (.02 * SR)), np.exp(-blk / (.45 * SR))
        env = np.zeros(N); acc = 0.0
        for i in range(0, N, blk):
            x = e[i:i + blk].max(); c = att if x > acc else rel; acc = c * acc + (1 - c) * x; env[i:i + blk] = acc
        g = 10 ** ((-6.0 - 9.0 * np.clip(env / .05, 0, 1)) / 20)
        mix = (m * g[:, None] + np.stack([v, v], 1)) * .7
    else:
        mix = m * 10 ** (-6 / 20)
    tmp = a.out.replace('.wav', '_pre.wav')
    wavfile.write(tmp, SR, mix.astype(np.float32))
    I, _ = lufs(tmp); gain = a.target - I
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', tmp, '-af', f'volume={gain:.2f}dB,aresample=192000,alimiter=limit=0.8:attack=3:release=60:level=disabled,aresample={SR}',
                    '-ar', str(SR), '-c:a', 'pcm_s16le', a.out], check=True)
    I2, pk = lufs(a.out)
    print(f'[mix] {a.out}: {I2:.1f} LUFS, true peak {pk} dBTP' + (' (голос + музыка)' if a.voice else ' (только музыка)'))
    if pk is not None and pk > -1.0: print('[mix] ВНИМАНИЕ: true peak выше −1 dBTP — уменьшите limit (0.8 → 0.75) и сведите заново')

if __name__ == '__main__':
    main()
