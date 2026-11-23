#!/usr/bin/env python3
"""Покадровый рендер HTML-ролика (engine.js) через Playwright/Chromium → JPEG → ffmpeg.

Проверочные кадры (делать ДО полного рендера, в обоих форматах):
  render.py video.html stills --times 1,5.5,10,14 --fmt both --sheet
Весь ролик одним процессом (70 с ≈ 5 мин на формат):
Превью в браузере — не здесь: откройте video.html?preview=1 через локальный сервер.
  render.py video.html video --fmt h --out build/h.mp4                    — с субтитрами
  render.py video.html video --fmt h --qs subs=0 --out build/h_nosubs.mp4  — без субтитров
Если рядом есть tmap.js (retime.py) — рендерится ускоренная версия; исходный темп: --qs tmap=0 (или subs=0&tmap=0).
Кусками (если среда обрывает долгие команды):
  render.py video.html video --fmt h --start 0 --end 1000 --out build/parts/h_0.mp4
  render.py video.html video --fmt h --start 1000 --out build/parts/h_1.mp4
  (склейка — assemble.py)
"""
import argparse, base64, os, subprocess, sys, time

def open_page(p, html, fmt, qs=''):
    W, H = (1920, 1080) if fmt == 'h' else (1080, 1920)
    b = p.chromium.launch(args=['--force-color-profile=srgb', '--hide-scrollbars'])
    page = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    errs, warns = [], []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: warns.append(m.text) if m.type == 'error' else None)
    page.goto('file://' + os.path.abspath(html) + f'?fmt={fmt}' + (('&' + qs) if qs else ''))
    try:
        page.wait_for_function('window.READY===true', timeout=30000)
    except Exception:
        sys.exit(f'[render] страница не дошла до READY. Ошибки JS: {errs or warns}')
    if errs:
        sys.exit(f'[render] ошибки JS на странице: {errs}')
    for w in warns:   # cues.js / tmap.js могут отсутствовать — это нормально
        if 'cues.js' not in w and 'tmap.js' not in w and 'Failed to load resource' not in w:
            print('[render] warning:', w)
    dur, fps = page.evaluate('[window.DURATION, window.FPS]')
    cdp = page.context.new_cdp_session(page)
    return b, page, cdp, dur, fps, errs

def shot(page, cdp, t, q):
    page.evaluate(f'render({t})')
    return base64.b64decode(cdp.send('Page.captureScreenshot', {'format': 'jpeg', 'quality': q})['data'])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('html'); ap.add_argument('mode', choices=['stills', 'video'])
    ap.add_argument('--fmt', default='h', choices=['h', 'v', 'both'])
    ap.add_argument('--times', default='', help='секунды через запятую (stills)')
    ap.add_argument('--out', default='build/stills', help='папка (stills) или файл .mp4 (video)')
    ap.add_argument('--sheet', action='store_true', help='собрать контактный лист stills')
    ap.add_argument('--start', type=int, default=0, help='первый кадр (video)')
    ap.add_argument('--end', type=int, default=None, help='кадр после последнего (video)')
    ap.add_argument('--qs', default='', help='доп. параметры страницы: subs=0 — без субтитров, tmap=0 — исходный темп')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    fmts = ['h', 'v'] if a.fmt == 'both' else [a.fmt]
    with sync_playwright() as p:
        for fmt in fmts:
            b, page, cdp, dur, fps, errs = open_page(p, a.html, fmt, a.qs)
            if a.mode == 'stills':
                os.makedirs(a.out, exist_ok=True)
                ts = [float(x) for x in a.times.split(',') if x.strip()] or [i * dur / 8 for i in range(8)]
                files = []
                for t in ts:
                    f = os.path.join(a.out, f'{fmt}_{t:06.2f}.jpg'); open(f, 'wb').write(shot(page, cdp, t, 85)); files.append(f)
                if errs: sys.exit(f'[render] ошибки JS: {errs}')
                print(f'[render] {fmt}: {len(files)} кадров → {a.out}')
                if a.sheet: print('[render] лист:', sheet(files, a.out, fmt))
            else:
                total = int(round(dur * fps)); end = min(a.end or total, total)
                out = a.out if a.out.endswith('.mp4') else os.path.join(a.out, f'{fmt}.mp4')
                if len(fmts) > 1: out = out.replace('.mp4', f'_{fmt}.mp4')
                os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
                ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(fps), '-c:v', 'mjpeg', '-i', '-',
                                       # JPEG-кадры — полный диапазон BT.601; видео для плееров и сайтов — BT.709 limited (иначе цвета «плывут»)
                                       '-vf', 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
                                       '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p',
                                       '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', out], stdin=subprocess.PIPE)
                t0 = time.time()
                for i in range(a.start, end):
                    ff.stdin.write(shot(page, cdp, i / fps, 93))
                    if (i - a.start) % 300 == 0: print(f'[render] {fmt} кадр {i}/{end} · {time.time()-t0:.0f} с', flush=True)
                ff.stdin.close(); ff.wait()
                if errs: sys.exit(f'[render] ошибки JS во время рендера: {errs}')
                print(f'[render] {fmt}: кадры {a.start}–{end-1} → {out} за {time.time()-t0:.0f} с')
            b.close()

def sheet(files, outdir, fmt):
    from PIL import Image
    ims = [Image.open(f) for f in files]
    w, h = (640, 360) if fmt == 'h' else (270, 480)
    cols = 3 if fmt == 'h' else 6
    rows = (len(ims) + cols - 1) // cols
    S = Image.new('RGB', (w * cols, h * rows), 'white')
    for i, im in enumerate(ims): S.paste(im.resize((w, h)), ((i % cols) * w, (i // cols) * h))
    f = os.path.join(outdir, f'sheet_{fmt}.jpg'); S.save(f, quality=85); return f

if __name__ == '__main__':
    main()
