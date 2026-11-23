#!/usr/bin/env python3
"""Проверка готовых файлов перед сдачей.
  verify_media.py plan.js out/*.mp4 [--sheet] [--times 1,8,15,30] [--json build/media_checks.json]

Для каждого MP4: размер кадра (1920×1080 или 1080×1920), fps и число кадров = duration × fps (если рядом с plan.js
есть tmap.js — его длительность; --tmap-ignore — исходная), H.264 / yuv420p / BT.709, AAC 48 кГц (если звук есть),
полное декодирование без ошибок, громкость ≈ −16 LUFS (±1) и true peak ≤ −1 dBTP.
Окончание речи до финального кадра проверяет align_vo.py. Код выхода 1 — если что-то не так.
--sheet — контактный лист из кадров самого файла (а не HTML): out/<имя>_sheet.jpg.
"""
import argparse, json, os, re, subprocess, sys

def load_js(path, var):
    if not os.path.exists(path): return None
    src = re.sub(r'^\s*//.*$', '', open(path, encoding='utf-8').read(), flags=re.M)
    m = re.search(r'window\.' + var + r'\s*=\s*(\{.*?\})\s*;?\s*(?:window\.|$)', src, flags=re.S)
    return json.loads(m.group(1)) if m else None

def loud(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'\{\s*"input_i".*?\}', r.stderr, re.S)
    return json.loads(m.group()) if m else None

def sheet(path, times, out):
    from PIL import Image
    ims = []
    for t in times:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t), '-i', path, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'], capture_output=True, check=True).stdout
        import io; ims.append(Image.open(io.BytesIO(raw)).convert('RGB'))
    w, h = ims[0].size; tw = 640 if w > h else 270; th = int(h * tw / w); cols = 3 if w > h else 6
    S = Image.new('RGB', (tw * cols, th * ((len(ims) + cols - 1) // cols)), 'white')
    for i, im in enumerate(ims): S.paste(im.resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
    S.save(out, quality=88); return out

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('plan'); ap.add_argument('files', nargs='+')
    ap.add_argument('--sheet', action='store_true'); ap.add_argument('--times', default='')
    ap.add_argument('--json'); ap.add_argument('--tmap-ignore', action='store_true', help='сверять с исходной длительностью plan.js')
    a = ap.parse_args()
    src = re.sub(r'^\s*//.*$', '', open(a.plan, encoding='utf-8').read(), flags=re.M)
    P = json.loads(re.search(r'window\.PLAN\s*=\s*(\{.*\})\s*;?\s*$', src, flags=re.S).group(1))
    fps = P.get('fps', 30); dur = P['duration']
    tm = None if a.tmap_ignore else load_js(os.path.join(os.path.dirname(os.path.abspath(a.plan)), 'tmap.js'), 'TMAP')
    if tm: dur = tm['duration']
    frames = int(round(dur * fps)); bad = False; report = {}
    for f in a.files:
        d = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', f]))
        v = next((s for s in d['streams'] if s['codec_type'] == 'video'), None); au = next((s for s in d['streams'] if s['codec_type'] == 'audio'), None)
        probs = []
        if not v: probs.append('нет видеопотока')
        else:
            if (v['width'], v['height']) not in [(1920, 1080), (1080, 1920)]: probs.append(f"кадр {v['width']}×{v['height']}")
            if v['avg_frame_rate'] != f'{fps}/1': probs.append(f"fps {v['avg_frame_rate']} вместо {fps}")
            if abs(int(v.get('nb_read_frames', 0)) - frames) > 1: probs.append(f"кадров {v.get('nb_read_frames')} вместо {frames}")
            if v['codec_name'] != 'h264' or v['pix_fmt'] != 'yuv420p': probs.append(f"{v['codec_name']}/{v['pix_fmt']}")
            if v.get('color_space') != 'bt709': probs.append(f"цвет {v.get('color_space', 'не размечен')} вместо bt709")
        lv = None
        if au:
            if au['codec_name'] != 'aac' or au['sample_rate'] != '48000': probs.append(f"звук {au['codec_name']} {au['sample_rate']}")
            lv = loud(f)
            if lv:
                if not -17 <= float(lv['input_i']) <= -15: probs.append(f"громкость {lv['input_i']} LUFS вместо −16")
                if float(lv['input_tp']) > -1: probs.append(f"true peak {lv['input_tp']} dBTP > −1")
        dec = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-f', 'null', '-'], capture_output=True, text=True)
        if dec.returncode or dec.stderr.strip(): probs.append('ошибки декодирования: ' + dec.stderr.strip()[:200])
        info = {'size': f"{v['width']}x{v['height']}" if v else None, 'frames': v.get('nb_read_frames') if v else None,
                'duration': d['format'].get('duration'), 'color': v.get('color_space') if v else None, 'audio': bool(au),
                'lufs': lv and float(lv['input_i']), 'true_peak': lv and float(lv['input_tp']), 'problems': probs}
        if a.sheet and v:
            ts = [float(x) for x in a.times.split(',') if x.strip()] or [round(i * float(d['format']['duration']) / 9 + .5, 2) for i in range(9)]
            info['sheet'] = sheet(f, ts, os.path.splitext(f)[0] + '_sheet.jpg')
        report[f] = info; bad |= bool(probs)
        print(('✓ ' if not probs else '✗ ') + f + ': ' + (', '.join(probs) if probs else
              f"{info['size']}, {info['frames']} кадров, {float(info['duration']):.2f} с" + (f", {info['lufs']:.1f} LUFS, TP {info['true_peak']:.1f}" if lv else ', без звука')))
    if a.json:
        os.makedirs(os.path.dirname(a.json) or '.', exist_ok=True); open(a.json, 'w').write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
