#!/usr/bin/env python3
"""Проверка окружения перед первым роликом. Печатает, чего не хватает, и как поставить."""
import importlib, shutil, subprocess, sys

ok = True
def need(cond, name, fix):
    global ok
    print(('✓ ' if cond else '✗ ') + name + ('' if cond else f'  →  {fix}'))
    ok &= bool(cond)

need(sys.version_info >= (3, 9), f'Python ≥ 3.9 (сейчас {sys.version.split()[0]})', 'обновите Python')
need(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'ffmpeg + ffprobe', 'macOS: brew install ffmpeg · Linux: apt install ffmpeg')
for mod, pip in [('numpy', 'numpy'), ('scipy', 'scipy'), ('PIL', 'pillow'), ('playwright', 'playwright')]:
    try: importlib.import_module(mod); need(True, mod, '')
    except ImportError: need(False, mod, f'pip install {pip}')
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(); v = b.version; b.close()
    need(True, f'Chromium для Playwright ({v})', '')
except Exception:
    need(False, 'Chromium для Playwright', 'python -m playwright install chromium')
try:
    rb = 'rubberband' in subprocess.run(['ffmpeg', '-hide_banner', '-filters'], capture_output=True, text=True).stdout
except Exception:
    rb = False
print(('✓ ' if rb else '· ') + 'ffmpeg rubberband' + ('' if rb else ' — не найден: нужен только для ускоренной версии (retime.py); нужна сборка ffmpeg с librubberband (в Homebrew — например, формула ffmpeg-full)'))
try:
    importlib.import_module('faster_whisper'); print('✓ faster-whisper (нужен только для раскладки озвучки)')
except ImportError:
    print('· faster-whisper не установлен — понадобится на шаге озвучки: pip install faster-whisper')
print('\nВсё готово.' if ok else '\nДоустановите отмеченное ✗ (лучше в venv: python -m venv .venv && . .venv/bin/activate).')
sys.exit(0 if ok else 1)
