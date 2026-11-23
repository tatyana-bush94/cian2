#!/usr/bin/env python3
"""Проверка сцен до полного рендера (быстро, без видео).
  verify_scene.py video.html [--fmt both] [--qs ...] [--times 1,6,12] [--json build/scene_checks.json]

Проверяет в каждом формате:
  · страница доходит до READY без ошибок JS;
  · шрифт бренд-профиля (--font из brand.css) реально загружен, а не подменён системным;
  · детерминизм: кадры в --times, снятые вперёд и затем в обратном порядке, совпадают (допуск — шум
    растеризации браузера: отличия больше 3 по каналу не более чем в 200 пикселях) — нет таймеров, Date.now(), Math.random(), CSS-анимаций и «залипшего» состояния;
  · субтитры: строки ≤ 56 символов, не перекрываются, внутри ролика;
  · финальный кадр: что меняется в последние PLAN.hold с (по умолчанию 1.5) — предупреждение (мигающая каретка, перелив — норма);
  · полотно #app не выходит за кадр на общем плане (t = середина ролика) — только предупреждение.
Код выхода 1 — если есть ошибки.
"""
import argparse, io, json, os, sys
import numpy as np

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('html'); ap.add_argument('--fmt', default='both', choices=['h', 'v', 'both'])
    ap.add_argument('--qs', default=''); ap.add_argument('--times', default=''); ap.add_argument('--json')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    fails, report = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--force-color-profile=srgb', '--hide-scrollbars'])
        for fmt in (['h', 'v'] if a.fmt == 'both' else [a.fmt]):
            W, H = (1920, 1080) if fmt == 'h' else (1080, 1920)
            page = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
            errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto('file://' + os.path.abspath(a.html) + f'?fmt={fmt}' + (('&' + a.qs) if a.qs else ''))
            try: page.wait_for_function('window.READY===true', timeout=30000)
            except Exception: fails.append(f'{fmt}: страница не дошла до READY: {errs}'); continue
            dur, fps, hold = page.evaluate('[window.DURATION, window.FPS, (window.PLAN||{}).hold || 1.5]')
            fam = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--font').split(',')[0].trim()")
            font_ok = page.evaluate("""fam => { const name = fam.replace(/["']/g, '');
              return document.fonts.check(`500 30px "${name}"`) && [...document.fonts].some(f => f.status === 'loaded' && f.family.replace(/["']/g, '') === name); }""", fam)
            if not font_ok: fails.append(f'{fmt}: шрифт бренда {fam} не загружен (проверьте brand/fonts и @font-face)')
            ts = [float(x) for x in a.times.split(',') if x.strip()] or [round(dur * k / 10, 2) for k in range(1, 10)]
            from PIL import Image
            def shot(t):
                page.evaluate(f'render({t})'); return np.asarray(Image.open(io.BytesIO(page.screenshot())).convert('RGB')).astype(np.int16)
            def diff(x, y):
                d = np.abs(x - y).max(2); return d.max(), int((d > 3).sum())
            fwd = {t: shot(t) for t in ts}; nondet = []
            for t in reversed(ts):
                mx, n = diff(shot(t), fwd[t])
                if n > 200: nondet.append(f'{t} с ({n} px)')
            if nondet: fails.append(f'{fmt}: кадры зависят не только от t (недетерминизм) в {nondet}')
            last = round((round(dur * fps) - 1) / fps, 4)
            mx, n = diff(shot(round(dur - hold, 3)), shot(last))
            warn = [f'финальный кадр меняется в последние {hold} с ({n} px) — нормально для мигающей каретки и перелива обводки, иначе проверьте'] if n else []
            cues = page.evaluate('window.CUES || null')
            if cues is None: cues = []
            for i, (s0, s1, line) in enumerate(cues):
                if len(line) > 56: fails.append(f'{fmt}: субтитр длиннее 56 символов: «{line}»')
                if not 0 <= s0 < s1 <= dur: fails.append(f'{fmt}: субтитр вне ролика {s0}–{s1}: «{line}»')
                if i and cues[i - 1][1] > s0 + 1e-6: fails.append(f'{fmt}: субтитры перекрываются около {s0} с')
            page.evaluate(f'render({dur / 2})')
            r = page.evaluate("(() => { const r = document.getElementById('app').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()")
            if not (r[0] >= -2 and r[1] >= -2 and r[2] <= W + 2 and r[3] <= H + 2): warn.append(f'#app на t={dur/2:.1f} выходит за кадр (крупный план? это нормально)')
            if errs: fails.append(f'{fmt}: ошибки JS: {errs}')
            report[fmt] = {'duration': dur, 'fps': fps, 'font': fam, 'font_loaded': font_ok, 'checked_times': ts, 'deterministic': not nondet,
                           'cues': len(cues), 'cues_source': 'cues.js' if page.evaluate('!!window.CUES') else 'оценка по тексту', 'warnings': warn}
            print(f"[scene] {fmt}: {dur:.2f} с, шрифт {fam} {'✓' if font_ok else '✗'}, детерминизм {'✓' if not nondet else '✗'}, кадров проверено {len(ts)}" + ''.join('\n  · ' + w for w in warn))
            page.close()
        b.close()
    for f in fails: print('✗', f)
    if a.json:
        os.makedirs(os.path.dirname(a.json) or '.', exist_ok=True); open(a.json, 'w').write(json.dumps({'report': report, 'fails': fails}, ensure_ascii=False, indent=2) + '\n')
    print('[scene] OK' if not fails else f'[scene] ошибок: {len(fails)}')
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
