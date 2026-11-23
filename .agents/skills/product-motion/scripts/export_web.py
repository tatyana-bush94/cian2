#!/usr/bin/env python3
"""Материалы для плеера на сайте или лендинге.
  export_web.py out/<slug>_16x9.mp4 [--srt out/subtitles.srt] [--poster 3.5] [--endcard -0.5] [--out out/web] [--lang ru]

Пишет в --out:
  <slug>.mp4            копия чистой версии (без вшитых субтитров — субтитры отдельным треком)
  <slug>.<lang>.vtt     WebVTT из SRT (для <track kind="subtitles">)
  <slug>-poster.jpg / .webp   постер — кадр в --poster с (по умолчанию 3.5), webp ≤ 1280 px по ширине
  <slug>-endcard.png    финальный кадр (--endcard: секунда, отрицательная — от конца)
Публикацию и подключение к сайту не выполняет — это отдельное решение пользователя.
"""
import argparse, os, re, shutil, subprocess

def grab(src, t, dst):
    subprocess.run(['ffmpeg', '-y', '-v', 'error'] + (['-sseof', str(t)] if t < 0 else ['-ss', str(t)]) + ['-i', src, '-frames:v', '1', '-update', '1', dst], check=True)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('video'); ap.add_argument('--srt'); ap.add_argument('--poster', type=float, default=3.5)
    ap.add_argument('--endcard', type=float, default=-0.5); ap.add_argument('--out', default='out/web'); ap.add_argument('--lang', default='ru')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    slug = re.sub(r'_(16x9|9x16)(_subs)?$', '', os.path.splitext(os.path.basename(a.video))[0])
    shutil.copy2(a.video, os.path.join(a.out, slug + '.mp4'))
    made = [slug + '.mp4']
    if a.srt:
        srt = open(a.srt, encoding='utf-8').read()
        vtt = 'WEBVTT\n\n' + re.sub(r'(\d{2}:\d{2}:\d{2}),(\d{3})', r'\1.\2', srt)
        open(os.path.join(a.out, f'{slug}.{a.lang}.vtt'), 'w', encoding='utf-8').write(vtt); made.append(f'{slug}.{a.lang}.vtt')
    pj = os.path.join(a.out, slug + '-poster.jpg'); grab(a.video, a.poster, pj); made.append(os.path.basename(pj))
    try:
        from PIL import Image
        im = Image.open(pj).convert('RGB'); im.thumbnail((1280, 1280)); im.save(os.path.join(a.out, slug + '-poster.webp'), quality=85, method=6); made.append(slug + '-poster.webp')
    except ImportError:
        pass
    grab(a.video, a.endcard, os.path.join(a.out, slug + '-endcard.png')); made.append(slug + '-endcard.png')
    print('[web] →', a.out + ':', ', '.join(made))

if __name__ == '__main__':
    main()
