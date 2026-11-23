#!/usr/bin/env python3
"""Склейка кусков видео и наложение звука.
  assemble.py --video build/h.mp4 --audio build/mix.wav --out out/name_16x9.mp4
  assemble.py --video build/parts/h_0.mp4 build/parts/h_1.mp4 --audio build/mix.wav --out out/name_16x9.mp4
Куски склеиваются без перекодирования (одинаковые параметры render.py), звук — AAC 192k / 48 кГц.
В конце печатает число кадров и длительность — сверяйте с duration × fps из plan.js.
"""
import argparse, os, subprocess, tempfile

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--video', nargs='+', required=True); ap.add_argument('--audio'); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    src = a.video[0]
    if len(a.video) > 1:
        lst = tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False)
        lst.write(''.join(f"file '{os.path.abspath(v)}'\n" for v in a.video)); lst.close()
        src = a.out.replace('.mp4', '_concat.mp4')
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst.name, '-c', 'copy', src], check=True)
    cmd = ['ffmpeg', '-y', '-v', 'error', '-i', src]
    if a.audio: cmd += ['-i', a.audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest']
    cmd += ['-c:v', 'copy', '-movflags', '+faststart', a.out]
    subprocess.run(cmd, check=True)
    if src != a.video[0]: os.remove(src)
    info = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height:format=duration',
                           '-of', 'default=nw=1', a.out], capture_output=True, text=True).stdout.split()
    print(f'[assemble] {a.out}: ' + ', '.join(info))

if __name__ == '__main__':
    main()
