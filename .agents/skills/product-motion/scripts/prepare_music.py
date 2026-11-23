#!/usr/bin/env python3
"""Готовит музыку пользователя (лицензионный трек, генерация в Suno/Udio и т.п.) под таймлайн ролика.
  prepare_music.py plan.js track.mp3 [--start 4.5 | --end-align] [--trim-from 0] [--fade-in .8] [--fade-out 1.5]
                   [--level -19] [--out build/music.wav]

Темп и высота трека не меняются. Трек ставится:
  --start S      — начать в S с ролика (по умолчанию 0);
  --end-align    — так, чтобы закончился вместе с роликом (обычно — финальный удар трека на финальной карточке);
  --trim-from T  — взять трек с T с (пропустить вступление).
Лишнее за концом ролика обрезается с плавным затуханием. Итог нормализуется до --level LUFS (≈ −19: mix.py потом
приглушит музыку под голосом и сведёт всё к −16) и пишется в 48 кГц, стерео. Рядом — build/music_edit.json:
откуда, с какого места, сколько, контрольная сумма исходника.
Дальше: mix.py build/music.wav build/vo_aligned.wav --out build/mix.wav
"""
import argparse, hashlib, json, os, re, subprocess, sys
import numpy as np

SR = 48000

def load_plan(path):
    src = re.sub(r'^\s*//.*$', '', open(path, encoding='utf-8').read(), flags=re.M)
    m = re.search(r'window\.PLAN\s*=\s*(\{.*\})\s*;?\s*$', src, flags=re.S)
    if not m: sys.exit('plan.js: не нашёл window.PLAN = {...}')
    return json.loads(m.group(1))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('plan'); ap.add_argument('track')
    g = ap.add_mutually_exclusive_group(); g.add_argument('--start', type=float, default=0.0); g.add_argument('--end-align', action='store_true')
    ap.add_argument('--trim-from', type=float, default=0.0); ap.add_argument('--fade-in', type=float, default=.8); ap.add_argument('--fade-out', type=float, default=1.5)
    ap.add_argument('--level', type=float, default=-19.0); ap.add_argument('--out', default='build/music.wav')
    a = ap.parse_args()
    P = load_plan(a.plan); dur = float(P.get('duration'))
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(a.trim_from), '-i', a.track, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    m = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()
    total = int(round(dur * SR))
    start = total - len(m) if a.end_align else int(round(a.start * SR))
    if start < 0: m = m[-start:]; start = 0           # трек длиннее: при --end-align берём его конец
    m = m[:max(0, total - start)]
    fi, fo = int(a.fade_in * SR), int(a.fade_out * SR)
    if fi and len(m) > fi: m[:fi] *= np.linspace(0, 1, fi)[:, None]
    if fo and len(m) > fo: m[-fo:] *= np.linspace(1, 0, fo)[:, None]
    out = np.zeros((total, 2), dtype=np.float32); out[start:start + len(m)] = m
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-af', f'loudnorm=I={a.level}:TP=-3:LRA=11',
                    '-ar', str(SR), '-c:a', 'pcm_s16le', a.out], input=out.tobytes(), check=True)
    rep = {'source': os.path.basename(a.track), 'source_sha256': hashlib.sha256(open(a.track, 'rb').read()).hexdigest(),
           'trim_from': a.trim_from, 'starts_at': round(start / SR, 3), 'used_seconds': round(len(m) / SR, 3), 'video_duration': dur,
           'fade_in': a.fade_in, 'fade_out': a.fade_out, 'level_lufs': a.level, 'tempo': 'unchanged', 'pitch': 'unchanged'}
    open(os.path.join(os.path.dirname(a.out) or '.', 'music_edit.json'), 'w').write(json.dumps(rep, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(rep, ensure_ascii=False, indent=2))
    if start / SR > dur - 2: print('[music] ВНИМАНИЕ: трек начинается почти в конце ролика — проверьте --start / длину трека')

if __name__ == '__main__':
    main()
