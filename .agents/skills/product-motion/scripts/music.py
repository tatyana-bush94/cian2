#!/usr/bin/env python3
"""Лёгкий электронный бит под ролик — синтез по разделу "music" из plan.js. Без сэмплов и без вокала.
  music.py plan.js [--out build/music.wav]

Раздел music в plan.js:
  bpm           темп (100 → такт 2.4 с). Удобно, когда сцены меняются на долях такта.
  groove_start  с какого момента идёт сетка тактов (обычно — появление интерфейса после хука)
  intro         {"end": 4.2, "stop": true, "pling": 4.58} — суетливое интро до end;
                stop=true — резкий обрыв (под стоп-кадр хука); pling — мягкий аккорд под титр на белом
  sections      [{"start","end","level":0|1|2,"arp":8|16,"octave":0|12}]
                level 0 — бочка на 1 и 3, бас редко (спокойный экран, ввод запроса)
                level 1 — бочка на каждую долю, клэп, бас восьмыми (основное действие)
                level 2 — то же ярче (сохранение, кульминация); arp — арпеджио 8-ми или 16-ми
  build         {"start","end"} — нарастание: шум-райзер, арпеджио вверх, дробь в последнем такте
  impacts       [t, ...] — короткий «вдох» шума на смене сцен (появление результатов)
  final         t — финальный удар на сильную долю (появление финальной карточки)
  key_shift     (опц.) транспонирование в полутонах, seed — (опц.) вариация шумов
Финал подбирайте на сетку: final = groove_start + n·(240/bpm).
"""
import argparse, json, os, re, sys
import numpy as np
from scipy.signal import butter, lfilter, fftconvolve
from scipy.io import wavfile

SR = 48000

def load_plan(path):
    src = open(path, encoding='utf-8').read()
    src = re.sub(r'^\s*//.*$', '', src, flags=re.M)
    m = re.search(r'window\.PLAN\s*=\s*(\{.*\})\s*;?\s*$', src, flags=re.S)
    if not m: sys.exit('plan.js: не нашёл window.PLAN = {...}')
    return json.loads(m.group(1))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('plan'); ap.add_argument('--out', default='build/music.wav'); a = ap.parse_args()
    P = load_plan(a.plan); M = P.get('music', {})
    DUR = P['duration']; N = int(SR * DUR)
    rng = np.random.default_rng(M.get('seed', 3)); KS = M.get('key_shift', 0)
    BEAT = 60 / M.get('bpm', 100); BAR = 4 * BEAT; T0 = M.get('groove_start', 0.0)
    bus = {k: np.zeros((2, N)) for k in ['drums', 'bass', 'pad', 'pluck', 'fx']}
    kicks = []

    def mf(m): return 440 * 2 ** ((m + KS - 69) / 12)
    def add(b, t0, sig, pan=0.0, g=1.0):
        i = int(t0 * SR); n = min(len(sig), N - i)
        if n <= 0 or i < 0: return
        bus[b][0, i:i + n] += sig[:n] * g * np.sqrt(0.5 * (1 - pan)); bus[b][1, i:i + n] += sig[:n] * g * np.sqrt(0.5 * (1 + pan))
    def tt(d): return np.arange(int(d * SR)) / SR
    def bp(x, lo, hi): b, a_ = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band'); return lfilter(b, a_, x)
    def hp(x, f): b, a_ = butter(2, f / (SR / 2), 'high'); return lfilter(b, a_, x)
    def lp(x, f): b, a_ = butter(2, f / (SR / 2), 'low'); return lfilter(b, a_, x)
    # --- инструменты
    def kick(g=1.0):
        t = tt(.45); f = 48 + 95 * np.exp(-t / .035); s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .22)
        k = int(.004 * SR); s[:k] *= np.linspace(0, 1, k); return s * g
    def addkick(t, g): add('drums', t, kick(g)); kicks.append(t)
    def hat(dec=.035, g=1.0): t = tt(dec * 6); return hp(rng.standard_normal(len(t)), 7500) * np.exp(-t / dec) * g
    def clap(g=1.0):
        t = tt(.35); n = bp(rng.standard_normal(len(t)), 900, 3200); env = np.zeros(len(t))
        for o in [0, .011, .022]: i = int(o * SR); env[i:] += np.exp(-(t[:len(t) - i]) / (.012 if o < .02 else .11))
        return n * env * g * .6
    def pluck(m, dec=.22, g=1.0):
        t = tt(dec * 5); f = mf(m)
        s = np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t) * np.exp(-t / .06) + .12 * np.sin(6 * np.pi * f * t) * np.exp(-t / .03)
        env = np.exp(-t / dec); k = int(.003 * SR); env[:k] *= np.linspace(0, 1, k); return s * env * g
    def pad(ms, dur, g=1.0, att=.5, rel=.9):
        t = tt(dur + rel); s = np.zeros(len(t))
        for m in ms:
            for det in (-5, 4):
                f = mf(m) * 2 ** (det / 1200)
                for h in range(1, 7): s += np.sin(2 * np.pi * f * h * t + h * .7) / (h ** 1.5)
        env = np.minimum(1, t / att); r = t > dur; env[r] *= np.exp(-(t[r] - dur) / (rel / 3))
        return lp(s, 2200) * env * g / len(ms)
    def bassn(m, dur, g=1.0):
        t = tt(dur); f = mf(m); s = np.sin(2 * np.pi * f * t) + .25 * np.sin(4 * np.pi * f * t)
        env = np.exp(-t / .28); k = int(.006 * SR); env[:k] *= np.linspace(0, 1, k); env[-int(.01 * SR):] *= np.linspace(1, 0, int(.01 * SR))
        return s * env * g
    # --- гармония: F — Dm — Fmaj(b) — G, мягкая и нейтральная
    CH = [([53, 57, 60, 64], 41), ([50, 53, 57, 60, 64], 38), ([53, 57, 58, 62], 34), ([55, 57, 60, 62, 64], 36)]
    ARP = [[65, 69, 72, 76], [62, 65, 69, 72], [65, 69, 70, 74], [67, 69, 72, 74]]
    barof = lambda t: int(np.floor((t - T0) / BAR + 1e-6))

    def section(a_, b_, lvl):
        for k in range(int(round((b_ - a_) / BEAT))):
            t = a_ + k * BEAT; beat = int(round((t - T0) / BEAT)) % 4; ch, root = CH[barof(t) % 4]
            if lvl == 0 and beat in (0, 2): addkick(t, .8)
            if lvl >= 1: addkick(t, .9)
            if lvl >= 1 and beat in (1, 3): add('drums', t, clap(.55 + .15 * (lvl >= 2)))
            for e in range(2):
                if e == 1 and lvl >= 1: add('drums', t + BEAT / 2, hat(.11, .22), pan=.3)
                else: add('drums', t + e * BEAT / 2, hat(.03, .16 + .06 * lvl), pan=-.2)
            if lvl >= 1:
                for e in range(2): add('bass', t + e * BEAT / 2, bassn(root + (12 if (e == 1 and beat == 3) else 0), BEAT / 2 * .95, .5))
            elif beat in (0, 2): add('bass', t, bassn(root, BEAT * 1.8, .45))
    def pads(a_, b_, g):
        t = a_
        while t < b_ - 1e-6:
            rem = (t - T0) % BAR
            d = BAR - rem if 1e-3 < rem < BAR - 1e-3 else BAR       # аккорд до ближайшей тактовой черты
            d = min(d, b_ - t)
            add('pad', t, pad(CH[barof(t + 1e-3) % 4][0], d, g)); t += d
    def arps(a_, b_, g, octv=0, div=4, dec=.18):
        st = BEAT / div
        for i in range(int(round((b_ - a_) / st))):
            t = a_ + i * st; notes = ARP[barof(t) % 4]
            m = notes[i % 4] if div == 4 else notes[(i * 3) % 4]
            add('pluck', t, pluck(m + octv, dec, g * (1 if i % 4 == 0 else .7)), pan=.35 * np.sin(i * .9))

    # --- интро
    I = M.get('intro')
    if I:
        e = I['end']
        for i in range(int(e / .15)): add('drums', i * .15, hat(.025, .30 + .25 * (i % 2 == 0)), pan=.25 if i % 2 else -.25)
        for i in range(int(e / .3)): add('bass', i * .3, bassn(38, .28, .55))
        add('pad', 0, pad([50, 53, 57, 60], e - .15, .7, att=.3, rel=.15))
        for i in range(int(e / 1.2) + 1):
            if i * 1.2 < e - .05: addkick(i * 1.2, .75)
        if I.get('pling') is not None:
            pt = I['pling']
            for j, m in enumerate([65, 69, 72, 76]): add('pluck', pt + j * .07, pluck(m, .5, .32), pan=(j - 1.5) * .2)
            add('pad', pt - .03, pad([53, 57, 60, 64], 1.2, .35, att=.15, rel=1.2))
    # --- секции
    for s in M.get('sections', []):
        pads(s['start'], s['end'], .75 + .05 * (s['level'] >= 2)); section(s['start'], s['end'], s['level'])
        if s.get('arp'):
            div = 4 if s['arp'] == 16 else 2
            arps(s['start'], s['end'], .22 if div == 4 else .15, octv=s.get('octave', 0), div=div, dec=.12 if div == 4 else .2)
    B = M.get('build')
    if B:
        a_, b_ = B['start'], B['end']; roll = max(a_, b_ - BAR / 2)
        pads(a_, b_, .85); section(a_, roll, 2); arps(a_, b_, .24, octv=12, div=4, dec=.12)
        n = 16
        for i in range(n): add('drums', roll + i * (b_ - roll) / n, clap(.12 + .5 * i / n))
        rt = tt(b_ - a_); add('fx', a_, hp(rng.standard_normal(len(rt)), 3000) * (rt / (b_ - a_)) ** 2.2 * .35)
    for t in M.get('impacts', []):
        add('fx', t, hp(rng.standard_normal(int(1.6 * SR)), 4000) * np.exp(-tt(1.6) / .45) * .22)
    F = M.get('final')
    if F is not None:
        addkick(F, 1.0); add('bass', F, bassn(29, 2.6, .7))
        add('pad', F, pad([53, 57, 60, 64, 67], min(3.6, DUR - F), 1.0, att=.05, rel=1.6))
        for j, m in enumerate([65, 69, 72, 76, 79, 84]): add('pluck', F + j * .09, pluck(m, .45, .3), pan=(j - 2.5) * .15)
        add('fx', F, hp(rng.standard_normal(int(2.5 * SR)), 5000) * np.exp(-tt(2.5) / .7) * .18)
    # --- обрыв интро (стоп-кадр)
    cut = None
    if I and I.get('stop'):
        nxt = [x for x in [I.get('pling')] + [s['start'] for s in M.get('sections', [])] if x is not None and x > I['end']]
        cut = (int(I['end'] * SR), int(min(nxt) * SR) if nxt else int(I['end'] * SR + .35 * SR))
        f = int(.012 * SR)
        for k in bus: bus[k][:, cut[0]:cut[0] + f] *= np.linspace(1, 0, f); bus[k][:, cut[0] + f:cut[1]] = 0
    # --- «насос» под бочку
    duck = np.ones(N); tk = tt(.35); shape = 1 - .38 * np.exp(-tk / .09)
    for k in kicks:
        i = int(k * SR); n = min(len(tk), N - i)
        if n > 0: duck[i:i + n] = np.minimum(duck[i:i + n], shape[:n])
    for k in ['pad', 'bass', 'pluck']: bus[k] *= duck
    # --- реверберация
    irt = tt(2.2); ir = lp(rng.standard_normal(len(irt)) * np.exp(-irt / .55), 6000); ir /= np.sqrt((ir ** 2).sum())
    wet = np.zeros((2, N))
    for k, amt in [('pluck', .55), ('pad', .25), ('drums', .08)]:
        for c in range(2): wet[c] += fftconvolve(bus[k][c], ir if c == 0 else np.roll(ir, 97))[:N] * amt
    mix = bus['drums'] * .9 + bus['bass'] * .9 + bus['pad'] * .55 + bus['pluck'] * .8 + bus['fx'] + wet * .6
    if cut: mix[:, cut[0]:cut[1]] = 0
    mix = np.tanh(mix * 1.1) / 1.1
    fo = int(min(2.2, DUR * .1) * SR); mix[:, -fo:] *= np.linspace(1, 0, fo) ** 1.5
    mix *= 10 ** (-6 / 20) / max(1e-9, np.abs(mix).max())
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    wavfile.write(a.out, SR, (mix.T * 32767).astype(np.int16))
    print(f'[music] {a.out}: {DUR} с, {len(kicks)} ударов бочки, пик −6 dBFS')

if __name__ == '__main__':
    main()
