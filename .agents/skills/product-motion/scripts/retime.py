#!/usr/bin/env python3
"""Ускоренная (динамичная) версия ролика: читка быстрее, паузы короче — и видео, и музыка, и субтитры по одной карте времени.
  retime.py plan.js [--voice build/vo_aligned.wav] [--cues cues.js] [--tempo 1.045] [--short 0.6] [--long 0.75]

Как работает. Озвучка, уже разложенная по таймлайну (vo_aligned.wav от align_vo.py), делится на речь и тишину:
  речь                          — ускорение --tempo (rubberband, высота голоса сохраняется);
  короткая пауза (< --long-min) — внутри и между фразами — × --short;
  длинная пауза (≥ --long-min)  — где «говорит» интерфейс (хук, переходы, финал) — × --long.
Пишет:
  tmap.js                 window.TMAP = {duration, knots:[[новое, исходное], …]} — engine.js сам переводит время кадра
                          в исходное время сцены, поэтому всё, что было синхронно с голосом, остаётся синхронным;
  build/vo_fast.wav       ускоренная озвучка на новом таймлайне;
  plan_fast.js            план музыки под новый таймлайн: темп подобран так, чтобы groove_start и final легли на такты,
                          границы секций, build и impacts — на доли;
  out/subtitles_fast.srt  субтитры (из cues.js) на новом таймлайне.
Дальше: music.py plan_fast.js --out build/music_fast.wav → mix.py build/music_fast.wav build/vo_fast.wav --out build/mix_fast.wav
→ render.py video.html video … (tmap.js подхватится сам; &tmap=0 в --qs — исходный темп).
Проверено на эталонном ролике: 1.045 / 0.6 / 0.75 → 72 с стали 62 с, темп «живой», но не скороговорка.
Не применяется автоматически — предложите пользователю, если ролик «тянется».
"""
import argparse, json, math, os, re, subprocess, sys
import numpy as np
from scipy.io import wavfile

def load_js(path, var):
    src = open(path, encoding='utf-8').read()
    src = re.sub(r'^\s*//.*$', '', src, flags=re.M)
    m = re.search(r'window\.' + var + r'\s*=\s*(\{.*?\}|\[.*?\])\s*;\s*(?:window\.|$)', src, flags=re.S)
    if not m: m = re.search(r'window\.' + var + r'\s*=\s*(\{.*\}|\[.*\])\s*;?\s*$', src, flags=re.S)
    return json.loads(m.group(1)) if m else None

def srt_time(t):
    t = max(0.0, t); ms = int(round(t * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('plan'); ap.add_argument('--voice', default='build/vo_aligned.wav'); ap.add_argument('--cues', default='cues.js')
    ap.add_argument('--tempo', type=float, default=1.045); ap.add_argument('--short', type=float, default=0.6)
    ap.add_argument('--long', type=float, default=0.75); ap.add_argument('--long-min', type=float, default=1.0)
    a = ap.parse_args()
    P = load_js(a.plan, 'PLAN')
    if not P: sys.exit('plan.js: не нашёл window.PLAN')
    if not os.path.exists(a.voice): sys.exit(f'нет {a.voice} — сначала align_vo.py')
    SR, x = wavfile.read(a.voice)
    x = x.astype(np.float64); x = x.mean(1) if x.ndim > 1 else x
    x /= 32768 if np.abs(x).max() > 2 else 1
    OLD_DUR = max(len(x) / SR, P['duration'])
    x = np.pad(x, (0, int(OLD_DUR * SR) - len(x)))

    # --- речь / тишина по энергии (кадры 10 мс)
    hop = SR // 100; n = len(x) // hop
    e = 20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
    loud = e > max(-45.0, e.max() - 40)
    segs, i = [], 0
    while i < n:
        j = i
        while j < n and loud[j] == loud[i]: j += 1
        segs.append(['s' if loud[i] else 'q', i / 100, j / 100]); i = j
    merged = []
    for s in segs:                                   # провалы < 0.12 с внутри слов — не паузы
        if s[0] == 'q' and s[2] - s[1] < 0.12 and merged and merged[-1][0] == 's':
            merged[-1][2] = s[2]; continue
        if merged and merged[-1][0] == s[0]: merged[-1][2] = s[2]
        else: merged.append(list(s))
    segs = merged; segs[-1][2] = OLD_DUR
    PAD = 0.04                                       # поля вокруг речи: не резать мягкие начала и хвосты
    for k, s in enumerate(segs):
        if s[0] == 's':
            if k > 0: s[1] = max(segs[k - 1][1] + 0.01, s[1] - PAD); segs[k - 1][2] = s[1]
            if k + 1 < len(segs): s[2] = min(segs[k + 1][2] - 0.01, s[2] + PAD); segs[k + 1][1] = s[2]

    # --- новая длина кусков и узлы карты
    knots, t_new, plan = [[0.0, 0.0]], 0.0, []
    for typ, s0, s1 in segs:
        d = s1 - s0
        L = d / a.tempo if typ == 's' else d * (a.long if d >= a.long_min else a.short)
        plan.append((typ, s0, s1, t_new, L)); t_new += L
        knots.append([round(t_new, 4), round(s1, 4)])
    NEW_DUR = t_new

    def N(t):
        for typ, s0, s1, n0, L in plan:
            if s0 <= t <= s1: return n0 + (t - s0) * L / ((s1 - s0) or 1)
        return NEW_DUR

    # --- голос: rubberband целиком, затем куски речи — на новые места
    st = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.voice, '-af', f'rubberband=tempo={a.tempo}:pitchq=quality',
                         '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True)
    if st.returncode: sys.exit('ffmpeg без rubberband? ' + st.stderr.decode()[-300:])
    y = np.frombuffer(st.stdout, dtype=np.float32).astype(np.float64)
    out = np.zeros(int(NEW_DUR * SR) + SR); fade = int(0.008 * SR)
    for typ, s0, s1, n0, L in plan:
        if typ != 's': continue
        seg = y[int(s0 / a.tempo * SR):int(s1 / a.tempo * SR)].copy()
        if len(seg) > 2 * fade: seg[:fade] *= np.linspace(0, 1, fade); seg[-fade:] *= np.linspace(1, 0, fade)
        i = int(n0 * SR); out[i:i + len(seg)] += seg[:max(0, len(out) - i)]
    out = out[:int(NEW_DUR * SR)]
    pk = np.abs(out).max()
    if pk > .99: out *= .99 / pk
    os.makedirs('build', exist_ok=True); os.makedirs('out', exist_ok=True)
    wavfile.write('build/vo_fast.wav', SR, (out * 32767).astype(np.int16))
    with open('tmap.js', 'w') as f:
        f.write('// Карта времени динамичной версии: [новое время, исходное время]. Сгенерировано retime.py.\n')
        f.write('window.TMAP = ' + json.dumps({'duration': round(NEW_DUR, 3), 'knots': knots}) + ';\n')

    # --- музыка под новый таймлайн
    fps = P.get('fps', 30); dur_new = round(NEW_DUR * fps) / fps
    M = dict(P.get('music', {})); report = {}
    if M:
        bpm0 = M.get('bpm', 100); g0 = M.get('groove_start', 0.0); g = N(g0)
        fin = M.get('final'); target = bpm0 * a.tempo
        if fin is not None and N(fin) > g:
            span = N(fin) - g; bars = max(1, round(span * target / 240)); bpm = bars * 240 / span
        else:
            bpm = target
        beat = 60 / bpm
        snap = lambda t: round(g + round((N(t) - g) / beat) * beat, 3) if t >= g0 else round(N(t), 3)
        M['bpm'] = round(bpm, 3); M['groove_start'] = round(g, 3)
        if 'intro' in M:
            M['intro'] = dict(M['intro'])
            for k in ('end', 'pling'):
                if k in M['intro']: M['intro'][k] = round(N(M['intro'][k]), 3)
        M['sections'] = [dict(s, start=snap(s['start']), end=snap(s['end'])) for s in M.get('sections', [])]
        if 'build' in M:
            b0, b1 = M['build']['start'], M['build']['end']
            nb1 = snap(b1)
            # нарастание сохраняет длину в долях (райзер и дробь — целыми тактами), секция перед ним кончается там же
            nb0 = round(nb1 - round((b1 - b0) / (60 / bpm0)) * beat, 3)
            M['build'] = {'start': nb0, 'end': nb1}
            for s, s_old in zip(M['sections'], P['music'].get('sections', [])):
                if abs(s_old['end'] - b0) < 1e-6: s['end'] = nb0
        M['impacts'] = [snap(t) for t in M.get('impacts', [])]
        if fin is not None: M['final'] = snap(fin)
        report = {'bpm': M['bpm'], 'groove_start': M['groove_start'], 'final': M.get('final')}
    PF = {'title': P.get('title', '') + ' (динамичная)', 'duration': dur_new, 'fps': fps, 'vo': [], 'titles': [], 'music': M}
    with open('plan_fast.js', 'w', encoding='utf-8') as f:
        f.write('// Музыка динамичной версии: темп и границы секций под новый таймлайн (retime.py). Не править руками.\n')
        f.write('window.PLAN = ' + json.dumps(PF, ensure_ascii=False, indent=1) + ';\n')

    # --- субтитры на новом таймлайне
    cues = load_js(a.cues, 'CUES') if os.path.exists(a.cues) else None
    if cues:
        with open('out/subtitles_fast.srt', 'w', encoding='utf-8') as f:
            for k, (c0, c1, txt) in enumerate(cues, 1):
                f.write(f'{k}\n{srt_time(N(c0))} --> {srt_time(N(c1))}\n{txt}\n\n')

    sq = sum(p[2] - p[1] for p in plan if p[0] == 'q'); sqn = sum(p[4] for p in plan if p[0] == 'q')
    ss = sum(p[2] - p[1] for p in plan if p[0] == 's'); ssn = sum(p[4] for p in plan if p[0] == 's')
    print(f'[retime] {OLD_DUR:.2f} с → {NEW_DUR:.2f} с (видео {dur_new:.2f} с); речь {ss:.1f} → {ssn:.1f} с, паузы {sq:.1f} → {sqn:.1f} с')
    print('[retime] фразы:', ', '.join(f"{v['id']} {v['at']:.2f}→{N(v['at']):.2f}" for v in P.get('vo', [])))
    if report: print('[retime] музыка:', json.dumps(report, ensure_ascii=False))
    print('[retime] записано: tmap.js, build/vo_fast.wav, plan_fast.js' + (', out/subtitles_fast.srt' if cues else ' (cues.js нет — субтитры не пересчитаны)'))

if __name__ == '__main__':
    main()
