#!/usr/bin/env python3
"""Пакет для озвучки в Gemini TTS: текст и промт ОТДЕЛЬНО + таблица таймингов.
  vo_pack.py plan.js [--out out/voiceover] [--model 3.1|3.8] [--voice male|female]
Пишет:
  tts_text.txt    — что читать: абзац на фразу, в «произносимой» форме (vo[].tts или авто-замены ниже)
  tts_prompt.txt  — Style instructions для Gemini TTS на языке PLAN.language (по умолчанию ru)
  timing.md       — старт каждой фразы и сколько секунд у неё есть (если генерировать по абзацам)
Из plan.js: title, product, audience, language, emphasis, pronounce.
Авто-замены (если у фразы нет своего vo[].tts): PLAN.pronounce + базовый словарь языка (для ru: ИИ → И-И).
Латиница в русском тексте выводится предупреждением — задайте произношение в PLAN.pronounce или vo[].tts.
"""
import argparse, os, re, sys, json

BASE = {'ru': {'ИИ': 'И-И'}}
OK_LATIN = {'B2B', 'B2C', 'MVP', 'AI', 'SaaS', 'IT', 'API', 'CRM', 'FinTech'}
LANG = {'ru': 'native Russian, standard Moscow pronunciation', 'en': 'native English, neutral General American accent',
        'de': 'native German, standard pronunciation', 'es': 'native Spanish, neutral pronunciation'}
VOICES = {'male': 'Schedar (утверждён ранее для русских роликов); для сравнения — Achird, Iapetus, Algieba',
          'female': 'Sulafat, Achernar, Vindemiatrix — сравните на первых двух абзацах'}
PERSON = {'male': ('Male narrator, ~30', 'male, 25–35, natural mid-low pitch', 'a tool he actually uses'),
          'female': ('Female narrator, ~30', 'female, 25–35, natural mid pitch', 'a tool she actually uses')}

PROMPT_31 = """# AUDIO PROFILE: {who}
## Voice-over for a short product video: {title}

## THE SCENE
A quiet, well-treated studio. The narrator records a {dur}-second explainer for {audience}. The video is clean and fast-cut (Linear / Stripe style): the voice explains what is on screen, it does not sell.

### DIRECTOR'S NOTES
Voice: {voice}, warm and confident. Sounds like a smart colleague showing {tool}, not an announcer.
Style: calm energy with a slight smile in the voice; conversational, clear, precise. No radio or advertising intonation, no pathos, no theatrical pauses, no rising "sales" endings. Sentences end firmly and downward.
Pacing: moderately brisk and steady, about 2.5–3 words per second. Short natural breaths between sentences, a slightly longer pause between paragraphs. Lists are read evenly, like counting on fingers, not sing-song.
Emphasis: lightly stress one key word per sentence: {emphasis}. The final call to action is a friendly invitation, not a command.
Language: {lang}.{pron} Read the text exactly as written, do not add or skip words.
"""
PROMPT_38 = "{voice}, warm, confident, conversational, moderately brisk (2.5–3 words/s), {lang}, no announcer or advertising intonation, sentences end firmly. Lightly stress: {emphasis}.{pron} Read exactly as written."

def load_plan(path):
    src = re.sub(r'^\s*//.*$', '', open(path, encoding='utf-8').read(), flags=re.M)
    m = re.search(r'window\.PLAN\s*=\s*(\{.*\})\s*;?\s*$', src, flags=re.S)
    if not m: sys.exit('plan.js: не нашёл window.PLAN = {...}')
    return json.loads(m.group(1))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('plan'); ap.add_argument('--out', default='out/voiceover'); ap.add_argument('--model', default='3.1')
    ap.add_argument('--voice', default='male', choices=['male', 'female'])
    a = ap.parse_args(); P = load_plan(a.plan); os.makedirs(a.out, exist_ok=True)
    lang = P.get('language', 'ru')
    pr = dict(BASE.get(lang, {})); pr.update(P.get('pronounce', {}))
    paras, warn = [], []
    for p in P['vo']:
        t = p.get('tts')
        if not t:
            t = p['text']
            for k in sorted(pr, key=len, reverse=True): t = re.sub(rf'(?<!\w){re.escape(k)}(?!\w)', pr[k], t)
        if a.model.startswith('3.8'): t = t.replace('[short pause]', '<short pause>').replace('[long pause]', '<long pause>')
        if lang == 'ru':
            for w in re.findall(r'[A-Za-z][A-Za-z0-9]*', re.sub(r'[\[<][a-z ]+[\]>]', '', t)):
                if w not in OK_LATIN: warn.append(f"{p['id']}: латиница «{w}» — проверьте произношение или задайте PLAN.pronounce / vo[].tts")
        paras.append(t)
    open(os.path.join(a.out, 'tts_text.txt'), 'w', encoding='utf-8').write('\n\n'.join(paras) + '\n')
    # промт
    emph = P.get('emphasis') or [pp['sync'].split(':', 1)[1] for T in P.get('titles', []) for pp in T['parts'] if pp.get('sync')]
    emph = ', '.join(f'"{e}"' for e in dict.fromkeys(emph)) or 'the key word of each sentence'
    pron = ''
    if any('И-И' in x for x in paras): pron += ' Read "И-И" as two separate letters.'
    for k, v in P.get('pronounce', {}).items():
        if ' ' in v and any(v in x for x in paras): pron += f' "{v}" is {len(v.split())} words.'
    if any('\u0301' in x for x in paras): pron += ' Respect the stress marks.'
    who, voice, tool = PERSON[a.voice]
    tpl = PROMPT_38 if a.model.startswith('3.8') else PROMPT_31
    prompt = tpl.format(who=who, voice=voice[0].upper() + voice[1:] if tpl is PROMPT_38 else voice, tool=tool,
                        title=P.get('title', P.get('product', 'product feature')), dur=int(round(P['duration'])),
                        audience=P.get('audience_en') or P.get('audience') or "the product's users", emphasis=emph,
                        lang=LANG.get(lang, f'native speaker, language code "{lang}"'), pron=pron)
    open(os.path.join(a.out, 'tts_prompt.txt'), 'w', encoding='utf-8').write(prompt)
    # тайминги
    rows = ['| # | старт в ролике | уложиться в, с | текст |', '|---|---|---|---|']
    vo = P['vo']
    for i, p in enumerate(vo):
        nxt = vo[i + 1]['at'] - .3 if i + 1 < len(vo) else P['duration'] - 1.5
        words = len(p['text'].split()); need = words / 2.7
        flag = ' ⚠ тесно' if need > nxt - p['at'] else ''
        rows.append(f"| {p['id']} | {p['at']:.1f} | {nxt - p['at']:.1f} (нужно ≈{need:.1f}){flag} | {p['text']} |")
    open(os.path.join(a.out, 'timing.md'), 'w', encoding='utf-8').write('\n'.join(rows) + '\n')
    print('\n'.join(rows)); print()
    for w in warn: print('⚠', w)
    print(f'[vo_pack] → {a.out}/tts_text.txt, tts_prompt.txt, timing.md')
    print(f'[vo_pack] голос Gemini TTS: {VOICES[a.voice]}. Один дубль целиком. Можно и свою запись — тот же текст.')

if __name__ == '__main__':
    main()
