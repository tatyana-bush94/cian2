# Окружение product-motion

Скилл установлен в `.agents/skills/product-motion/` из
<https://github.com/dyachkovp/agent-skills/tree/main/product-motion>.
Инструкция: [SKILL.md](../.agents/skills/product-motion/SKILL.md).

На этой машине зависимости рендера находятся в локальном `.venv/`:
Playwright, NumPy, SciPy, Pillow, ffmpeg и ffprobe. Chromium установлен
через Playwright в пользовательский кеш. `.venv/` исключён из Git.

Перед запуском скриптов из корня репозитория:

```sh
source .venv/bin/activate
python .agents/skills/product-motion/scripts/check_env.py
```

Homebrew не смог установить ffmpeg из-за прав на `/usr/local` и отсутствия
Command Line Tools. Поэтому в `.venv/bin/` установлены готовые ffmpeg и ffprobe
6.1.1 для macOS arm64 из [релиза Descript](https://github.com/descriptinc/ffmpeg-ffprobe-static/releases/tag/b6.1.2-rc.1).

Для повторной настройки Python-зависимостей на другой машине:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install playwright numpy scipy pillow
python -m playwright install chromium
```

ffmpeg и ffprobe на другой машине нужно установить отдельно. Для обычного
рендера достаточно этих зависимостей; `faster-whisper` нужен для раскладки
озвучки, а ffmpeg с `rubberband` — для ускоренной версии ролика.
