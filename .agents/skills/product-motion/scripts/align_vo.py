#!/usr/bin/env python3
"""Раскладка готовой озвучки по таймлайну ролика + субтитры под реальную речь.

Один дубль (как отдаёт Gemini TTS / AI Studio):
  align_vo.py plan.js voice.wav
Отдельные клипы по фразам (имена файлов = id фраз: p1.wav, p2.mp3 …):
  align_vo.py plan.js --clips voice/

Что делает:
  1. Распознаёт речь (faster-whisper, без подсказки — честная проверка текста) с таймингом слов.
  2. Сопоставляет слова с текстом фраз plan.js (выравнивание по похожести слов) и находит границы каждой фразы,
     уточняя их по энергии сигнала (режем только в тишине).
  3. Ставит каждую фразу так, чтобы её первое слово прозвучало в vo[].at. Если фраза налезает на следующую —
     сдвигает следующую и пишет предупреждение. vo[].max_pause (сек) — ужать внутренние паузы фразы.
  4. Пишет:  build/vo_aligned.wav (48 кГц), cues.js (window.CUES + window.SYNC), out/subtitles.srt,
     build/align_report.md — тайминги фраз, подозрительные слова «проверить на слух», длины;
     build/asr_words.json — распознанные слова (для разбора спорных мест).
Язык распознавания — PLAN.language (код whisper: ru, en, …) или --lang. Транслитерация латиницы
в кириллицу при сравнении слов — только для ru (бренды латиницей против речи «Демо»).
Последняя фраза должна закончиться за PLAN.hold (по умолчанию 1.5) с до конца ролика — иначе скрипт
останавливается, ничего не записав (--allow-late — записать всё равно).
SYNC: "p2:словами" — время слова в ролике (для титров с sync и для сцен: E.sync("p2:словами", запас)),
      "p2" — начало фразы, "p2.end" — конец.
"""
import argparse, json, os, re, subprocess, sys
from difflib import SequenceMatcher
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
TR = {'a': 'а', 'b': 'б', 'c': 'к', 'd': 'д', 'e': 'е', 'f': 'ф', 'g': 'г', 'h': 'х', 'i': 'и', 'j': 'дж', 'k': 'к', 'l': 'л', 'm': 'м',
      'n': 'н', 'o': 'о', 'p': 'п', 'q': 'к', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'v': 'в', 'w': 'в', 'x': 'кс', 'y': 'и', 'z': 'з'}

def load_plan(path):
    src = re.sub(r'^\s*//.*$', '', open(path, encoding='utf-8').read(), flags=re.M)
    m = re.search(r'window\.PLAN\s*=\s*(\{.*\})\s*;?\s*$', src, flags=re.S)
    if not m: sys.exit('plan.js: не нашёл window.PLAN = {...}')
    return json.loads(m.group(1))

TRANSLIT = True   # выставляется в main() по языку

def norm_tokens(text):
    out = []
    for w in re.split(r'[\s\-—–]+', text.lower().replace('ё', 'е')):
        w = re.sub(r'[^\w]', '', w)
        if TRANSLIT: w = ''.join(TR.get(c, c) for c in w)
        if w: out.append(w)
    return out

def decode(path, sr):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)

def asr(audio16, model_name, language):
    from faster_whisper import WhisperModel
    m = WhisperModel(model_name, device='cpu', compute_type='int8')
    segs, _ = m.transcribe(audio16.astype(np.float32), language=language, word_timestamps=True, beam_size=5, vad_filter=False)
    words = []
    for s in segs:
        for w in s.words:
            for k, tok in enumerate(norm_tokens(w.word)):
                words.append({'t0': w.start, 't1': w.end, 'tok': tok, 'raw': w.word.strip()})
    return words

def sim(a, b):
    if a == b: return 1.0
    return SequenceMatcher(None, a, b).ratio()

def align(exp, got):
    """Needleman–Wunsch по словам. exp/got — списки токенов. Возвращает {i_exp: (j_got, similarity)}."""
    n, m = len(exp), len(got); G = -0.6
    S = np.zeros((n + 1, m + 1)); B = np.zeros((n + 1, m + 1), dtype=np.int8)
    S[:, 0] = np.arange(n + 1) * G; S[0, :] = np.arange(m + 1) * G; B[1:, 0] = 1; B[0, 1:] = 2
    sims = np.zeros((n, m))
    for i in range(n):
        for j in range(m): sims[i, j] = sim(exp[i], got[j])
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = sims[i - 1, j - 1]; d = S[i - 1, j - 1] + (2 * s if s >= .5 else -1)
            u, l = S[i - 1, j] + G, S[i, j - 1] + G
            if d >= u and d >= l: S[i, j], B[i, j] = d, 0
            elif u >= l: S[i, j], B[i, j] = u, 1
            else: S[i, j], B[i, j] = l, 2
    res, i, j = {}, n, m
    while i > 0 or j > 0:
        b = B[i, j]
        if i > 0 and j > 0 and b == 0:
            if sims[i - 1, j - 1] >= .5: res[i - 1] = (j - 1, sims[i - 1, j - 1])
            i, j = i - 1, j - 1
        elif i > 0 and (j == 0 or b == 1): i -= 1
        else: j -= 1
    return res

def energy_db(x):
    hop = int(.01 * SR); n = len(x) // hop
    fr = x[:n * hop].reshape(n, hop)
    return 20 * np.log10(np.sqrt((fr ** 2).mean(1)) + 1e-9)

def split_lines(text, maxlen=56):
    """Строки субтитров: фраза ≤ maxlen — одной строкой; длиннее — режем по знаку препинания ближе к середине,
    иначе по пробелу ближе к середине (без коротких «хвостов» вроде «здесь.»)."""
    out = []
    for s in re.findall(r'[^.!?…]+[.!?…]*\s*', text) or [text]:
        s = s.strip()
        if not s: continue
        if len(s) <= maxlen: out.append(s); continue
        mid = len(s) / 2
        cuts = [m.end() for m in re.finditer(r'[,:;—–]\s', s)]
        if not cuts: cuts = [m.start() for m in re.finditer(r' ', s)]
        k = min(cuts, key=lambda c: abs(c - mid))
        out += [x for x in split_lines(s[:k].strip(), maxlen) + split_lines(s[k:].strip(), maxlen) if x]
    return out

def ts(x):
    ms = int(round(max(0, x) * 1000)); return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('plan'); ap.add_argument('voice', nargs='?')
    ap.add_argument('--clips', help='папка с клипами по фразам (p1.wav …)')
    ap.add_argument('--model', default='small', help='модель faster-whisper: small (быстро) / medium (точнее)')
    ap.add_argument('--lang', help='код языка whisper; по умолчанию PLAN.language или ru')
    ap.add_argument('--allow-late', action='store_true', help='записать результат, даже если речь заходит на финальный кадр')
    ap.add_argument('--build', default='build'); ap.add_argument('--cues', default='cues.js'); ap.add_argument('--srt', default='out/subtitles.srt')
    a = ap.parse_args()
    if not a.voice and not a.clips: sys.exit('укажите voice.wav или --clips папку')
    P = load_plan(a.plan); VO = P['vo']; DUR = P['duration']
    global TRANSLIT
    language = a.lang or P.get('language', 'ru'); TRANSLIT = language == 'ru'; HOLD = float(P.get('hold', 1.5))
    for d in (a.build, os.path.dirname(a.srt) or '.'): os.makedirs(d, exist_ok=True)

    # ---------- 1. источники: (аудио 48k, слова ASR) для каждой фразы ----------
    src = {}   # id -> dict(x=audio48, words=[...], s0, s1)
    report = []
    if a.clips:
        files = {os.path.splitext(f)[0]: os.path.join(a.clips, f) for f in os.listdir(a.clips)}
        for p in VO:
            if p['id'] not in files: sys.exit(f"нет клипа для фразы {p['id']} в {a.clips}")
            x = decode(files[p['id']], SR); x16 = decode(files[p['id']], 16000)
            got = asr(x16, a.model, language); exp = norm_tokens(p['text']); al = align(exp, [w['tok'] for w in got])
            src[p['id']] = dict(x=x, words=got, al=al, exp=exp, base=0)
    else:
        x = decode(a.voice, SR); x16 = decode(a.voice, 16000)
        got = asr(x16, a.model, language)
        with open(os.path.join(a.build, 'asr_words.json'), 'w', encoding='utf-8') as f:
            json.dump(got, f, ensure_ascii=False, indent=2)
        exp, owner = [], []
        for p in VO:
            for k, tok in enumerate(norm_tokens(p['text'])): exp.append(tok); owner.append((p['id'], k))
        al = align(exp, [w['tok'] for w in got])
        heard = ' '.join(w['raw'] for w in got)
        report.append(f'## Распознано в записи (без подсказки)\n\n{heard}\n')
        for p in VO:
            idx = [i for i, o in enumerate(owner) if o[0] == p['id']]
            pal = {i - idx[0]: al[i] for i in idx if i in al}
            src[p['id']] = dict(x=x, words=got, al=pal, exp=[exp[i] for i in idx], base=0)

    # ---------- 2. границы фраз в источнике ----------
    E = None; cache = {}
    def edb(xx):
        k = id(xx)
        if k not in cache: cache[k] = energy_db(xx)
        return cache[k]
    prev_s1 = 0
    for n, p in enumerate(VO):
        s = src[p['id']]; w = s['words']
        if not s['al']: sys.exit(f"фраза {p['id']} не найдена в записи: «{p['text']}». Проверьте, что диктор прочитал текст.")
        js = sorted(j for j, _ in s['al'].values())
        t0, t1 = w[js[0]]['t0'], w[js[-1]]['t1']
        e = edb(s['x']); thr = min(-40.0, e.max() - 38)
        loud = e > thr
        # начало речи: первый громкий кадр в окне [t0 − 0.4; t0 + 0.5], но не раньше конца предыдущей фразы дубля
        # (ASR часто ставит первое слово клипа на 0.00, а реальное начало — позже)
        base = prev_s1 if not a.clips else 0
        i = max(int(base * 100), int((t0 - .4) * 100), 0); hi = min(len(loud) - 1, int((t0 + .5) * 100))
        while i < hi and not loud[i]: i += 1
        s0 = i / 100
        # конец: первая тишина ≥ 0.12 с после t1 − 0.1 (до 0.6 с вперёд)
        i = int((t1 - .1) * 100); hi_lim = min(len(loud) - 1, int((t1 + .6) * 100))
        while i < hi_lim and (loud[i:i + 12].any()): i += 1
        s1 = i / 100
        s.update(s0=s0, s1=max(s1, t1), first=w[js[0]]['t0']); prev_s1 = s['s1']
    # не даём соседним фразам одного дубля пересекаться
    if not a.clips:
        for n in range(len(VO) - 1):
            A, B = src[VO[n]['id']], src[VO[n + 1]['id']]
            if A['s1'] > B['s0']: mid = (A['s1'] + B['s0']) / 2; A['s1'] = B['s0'] = mid

    # ---------- 3. сжатие внутренних пауз и раскладка ----------
    hpf = butter(2, 70 / (SR / 2), 'high', output='sos')
    out = np.zeros(int(DUR * SR) + SR); fade = int(.012 * SR)
    placed, SYNC, cues = [], {}, []
    prev_end = -1
    for n, p in enumerate(VO):
        s = src[p['id']]; x = s['x']
        pre, post = .12, .2
        a0, a1 = max(0, s['s0'] - pre), min(len(x) / SR, s['s1'] + post)
        # куски (src_from, src_to) — с вырезанными длинными паузами, если задан max_pause
        pieces = [[a0, a1]]
        mp = p.get('max_pause')
        if mp:
            e = edb(x); thr = min(-40.0, e.max() - 38); q = e > thr
            pieces, cur, i = [], a0, int(s['s0'] * 100)
            while i < int(s['s1'] * 100):
                if not q[i]:
                    j = i
                    while j < len(q) and not q[j]: j += 1
                    if (j - i) / 100 > mp and j / 100 < s['s1']:
                        keep = mp / 2; pieces.append([cur, i / 100 + keep]); cur = j / 100 - keep
                    i = j
                else: i += 1
            pieces.append([cur, a1])
        def mapt(tsrc):  # время в источнике → время от начала первого куска (после вырезов)
            acc = 0
            for f, t in pieces:
                if tsrc <= t: return acc + max(0, tsrc - f)
                acc += t - f
            return acc
        lead = mapt(s['s0'])                       # сколько пре-ролла до начала речи
        dst = p['at'] - lead                       # первое слово фразы звучит ровно в vo[].at
        if dst + lead < prev_end + .2:
            shift = prev_end + .2 - (dst + lead); dst += shift
            report.append(f"⚠ {p['id']}: налезала на предыдущую фразу — сдвинута на +{shift:.2f} с (до {dst+lead:.2f})")
        pos = dst
        for f, t in pieces:
            seg = x[int(f * SR):int(t * SR)].copy()
            if len(seg) > 2 * fade: seg[:fade] *= np.linspace(0, 1, fade); seg[-fade:] *= np.linspace(1, 0, fade)
            i = int(pos * SR); m = min(len(seg), len(out) - i)
            if m > 0: out[i:i + m] += seg[:m]
            pos += t - f
        speech_on = dst + lead; speech_off = dst + mapt(s['s1'])
        prev_end = speech_off
        placed.append((p['id'], p['at'], speech_on, speech_off, s['s0'], s['s1']))
        SYNC[p['id']] = round(speech_on, 2); SYNC[p['id'] + '.end'] = round(speech_off, 2)
        # слова фразы во времени ролика
        wt = []
        for k, tok in enumerate(s['exp']):
            if k in s['al']:
                j, sm = s['al'][k]; w = s['words'][j]
                if sm < .75 and j + 1 < len(s['words']):   # название из двух слов в речи против одного слова в тексте (FoodMarket)
                    sm = max(sm, sim(tok, w['tok'] + s['words'][j + 1]['tok']))
                wt.append((tok, dst + mapt(w['t0']), dst + mapt(w['t1']), sm, w['raw']))
            else: wt.append((tok, None, None, 0, None))
        # пропуски интерполируем
        for k in range(len(wt)):
            if wt[k][1] is None:
                prv = next((wt[i] for i in range(k - 1, -1, -1) if wt[i][1] is not None), None)
                nxt = next((wt[i] for i in range(k + 1, len(wt)) if wt[i][1] is not None), None)
                t_ = prv[2] if prv else (nxt[1] if nxt else speech_on)
                wt[k] = (wt[k][0], t_, t_ + .2, 0, None)
        for tok, w0, w1, sm, raw in wt:
            key = f"{p['id']}:{tok}"
            if key not in SYNC: SYNC[key] = round(w0, 2)
            if sm < .75: report.append(f"  · {p['id']}: ожидалось «{tok}», услышано «{raw or '—'}» — проверить на слух ({w0:.2f} с)")
        # строки субтитров
        lines = p.get('subs') or split_lines(p['text']); k = 0
        for li, line in enumerate(lines):
            nt = len(norm_tokens(line)); seg = wt[k:k + nt] or wt[-1:]; k += nt
            st = seg[0][1] - .08; en = seg[-1][2] + .30
            if li == 0: st = min(st, speech_on - .08)
            if li == len(lines) - 1: en = max(en, speech_off + .25)
            cues.append([round(max(0.0, st), 2), round(en, 2), line])
    # титры с sync: ищем слово по префиксу, если точного ключа нет
    for T in P.get('titles', []):
        for part in T['parts']:
            sk = part.get('sync')
            if not sk or sk in SYNC: continue
            pid, word = sk.split(':', 1); nw = (norm_tokens(word) or [''])[0]
            cand = [k for k in SYNC if k.startswith(pid + ':') and (k.split(':', 1)[1].startswith(nw[:max(4, len(nw) - 2)]))]
            if cand: SYNC[sk] = SYNC[cand[0]]
            else: report.append(f'⚠ титр: ключ {sk} не найден в речи — остаётся время из plan.js')
    cues.sort(key=lambda c: c[0])
    for i in range(len(cues) - 1):
        if cues[i][1] > cues[i + 1][0] - .04: cues[i][1] = round(cues[i + 1][0] - .04, 2)
    for c in cues:
        if c[1] - c[0] < 1.0: c[1] = round(c[0] + 1.0, 2)

    if placed[-1][3] > DUR - HOLD and not a.allow_late:
        sys.exit(f'[align] последняя фраза заканчивается в {placed[-1][3]:.2f} с, а финальный кадр без речи — последние {HOLD} с '
                 f'(ролик {DUR} с). Сдвиньте vo[].at, сократите текст или увеличьте duration; файлы не записаны (--allow-late — записать всё равно).')
    # ---------- 4. запись ----------
    out = sosfilt(hpf, out)[:int(DUR * SR)]
    pk = np.abs(out).max()
    if pk > .99: out *= .99 / pk
    wavfile.write(os.path.join(a.build, 'vo_aligned.wav'), SR, (out * 32767).astype(np.int16))
    with open(a.cues, 'w', encoding='utf-8') as f:
        f.write('// Сгенерировано align_vo.py — субтитры и время слов по реальной озвучке.\n')
        f.write('window.CUES = ' + json.dumps(cues, ensure_ascii=False) + ';\n')
        f.write('window.SYNC = ' + json.dumps(SYNC, ensure_ascii=False) + ';\n')
    with open(a.srt, 'w', encoding='utf-8') as f:
        f.write('\n'.join(f'{i}\n{ts(c[0])} --> {ts(c[1])}\n{c[2]}\n' for i, c in enumerate(cues, 1)))
    rows = ['| фраза | план, с | речь в ролике, с | в исходнике, с |', '|---|---|---|---|']
    for pid, at, on, off, s0, s1 in placed:
        rows.append(f'| {pid} | {at:.2f} | {on:.2f}–{off:.2f} ({off-on:.1f} с) | {s0:.2f}–{s1:.2f} |')
    last = placed[-1][3]
    if last > DUR - HOLD: report.append(f'⚠ речь заканчивается в {last:.2f} с — почти в конце ролика ({DUR} с)')
    rep = '# Раскладка озвучки\n\n' + '\n'.join(rows) + '\n\n' + '\n'.join(report) + '\n'
    open(os.path.join(a.build, 'align_report.md'), 'w', encoding='utf-8').write(rep)
    print(rep)
    print(f'[align] → {a.build}/vo_aligned.wav, {a.cues}, {a.srt}')

if __name__ == '__main__':
    main()
