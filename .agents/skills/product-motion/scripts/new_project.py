#!/usr/bin/env python3
"""Создаёт папку нового ролика из шаблонов скилла.
  new_project.py <папка-ролика> [--brand <папка-бренда>] [--lang ru] [--canvas 1600x960] [--title "Фича · Продукт"]

  --brand   бренд-профиль проекта (обычно <проект>/motion/brand): brand.css, fonts/, logos/.
            Копируется в <папка-ролика>/brand — ролик пересобирается одинаково, даже если профиль потом изменится.
            Без --brand ищется motion/brand рядом с папкой ролика (…/motion/<slug> → …/motion/brand),
            иначе берётся нейтральный профиль скилла (Manrope, нейтральный акцент) — только для черновика.
  --lang    язык реплик и распознавания (код whisper: ru, en, …) → PLAN.language
  --canvas  размер полотна интерфейса → PLAN.canvas
  --title   название для финала и промта озвучки → PLAN.title

Структура:
  video.html  plan.js  cues.js  tmap.js  engine.js  processing.js  base.css  brand/  build/  out/  README.md
cues.js и tmap.js — заглушки: их перепишут align_vo.py (после озвучки) и retime.py (ускоренная версия).
"""
import argparse, json, os, re, shutil, sys

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(SKILL, 'templates')

README = """# {title}

Ролик о фиче, собран скиллом product-motion.

- Статус: черновик — сценарий и сцены в работе.
- Формат: см. `plan.js` (duration, canvas, language) и бриф ниже.
- Бренд-профиль: `brand/` (снимок на момент создания{brand_src}).

## Бриф

Заполнить: фича, аудитория и назначение, длительность, язык, форматы (16:9 / 9:16), откуда взяты факты о продукте.

## Пересборка

Команды — в разделе «Процесс» скилла product-motion. Превью в браузере: `video.html?preview=1`
(через локальный сервер из этой папки: `python3 -m http.server`). Временные файлы — в `build/`, результаты — в `out/`.
"""

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('dst'); ap.add_argument('--brand'); ap.add_argument('--lang'); ap.add_argument('--canvas'); ap.add_argument('--title')
    a = ap.parse_args()
    dst = os.path.abspath(a.dst)
    if os.path.exists(os.path.join(dst, 'video.html')): sys.exit(f'{dst}/video.html уже есть — не перезаписываю')
    brand = a.brand
    if not brand:
        guess = os.path.join(os.path.dirname(dst), 'brand')
        if os.path.isfile(os.path.join(guess, 'brand.css')): brand = guess
    if brand and not os.path.isfile(os.path.join(brand, 'brand.css')): sys.exit(f'{brand}: нет brand.css — это не бренд-профиль')
    os.makedirs(dst, exist_ok=True)
    shutil.copy(os.path.join(T, 'starter.html'), os.path.join(dst, 'video.html'))
    for f in ('engine.js', 'processing.js', 'base.css', 'plan.js'):
        shutil.copy(os.path.join(T, f), os.path.join(dst, f))
    shutil.copytree(os.path.abspath(brand) if brand else os.path.join(T, 'brand'), os.path.join(dst, 'brand'), dirs_exist_ok=True)
    # параметры плана: правим только нужные ключи, комментарии шаблона сохраняем
    src = open(os.path.join(dst, 'plan.js'), encoding='utf-8').read()
    def setkey(key, value):
        nonlocal src
        src, n = re.subn(rf'("{key}":\s*)(\[[^\]]*\]|"[^"]*"|[\d.]+)', lambda m: m.group(1) + json.dumps(value, ensure_ascii=False), src, count=1)
        if not n: sys.exit(f'plan.js: не нашёл ключ {key}')
    if a.lang: setkey('language', a.lang)
    if a.title: setkey('title', a.title)
    if a.canvas:
        m = re.fullmatch(r'(\d+)[x×](\d+)', a.canvas)
        if not m: sys.exit('--canvas: формат ШИРИНАxВЫСОТА, например 1600x960')
        setkey('canvas', [int(m.group(1)), int(m.group(2))])
    open(os.path.join(dst, 'plan.js'), 'w', encoding='utf-8').write(src)
    open(os.path.join(dst, 'cues.js'), 'w').write('// Заполнит scripts/align_vo.py после записи озвучки (window.CUES, window.SYNC).\n')
    open(os.path.join(dst, 'tmap.js'), 'w').write('// Заполнит scripts/retime.py для ускоренной версии (window.TMAP). Пусто — исходный темп.\n')
    for d in ('build', 'out'): os.makedirs(os.path.join(dst, d), exist_ok=True)
    readme = os.path.join(dst, 'README.md')
    if not os.path.exists(readme):
        open(readme, 'w', encoding='utf-8').write(README.format(title=a.title or os.path.basename(dst),
            brand_src=(': ' + os.path.relpath(os.path.abspath(brand), dst)) if brand else ': нейтральный профиль скилла — заменить профилем продукта'))
    print('Проект создан:', dst)
    print('Бренд-профиль:', os.path.abspath(brand) if brand else 'нейтральный (templates/brand) — для черновика; соберите профиль продукта, см. references/brand.md')
    for f in sorted(os.listdir(dst)): print('  ', f)

if __name__ == '__main__':
    main()
