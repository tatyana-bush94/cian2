# Продажа на аукционе · Циан

Ролик о запуске аукциона продавцом, собран скиллом product-motion.

- Статус: готово; сценарий утверждён пользователем, монтаж и рендер проверены.
- Формат: MP4, 1920×1080, 16:9, 30 кадров/с, ровно 15 секунд, до 20 000 000 байт.
- Звук: фоновая электронная музыка, без озвучки; субтитры речи не требуются.
- Музыка синтезирована скриптом скилла, без сэмплов и вокала. Черновой трек;
  для публичного размещения можно заменить лицензионным.
- Бренд-профиль: `brand/`, копия `../brand/` (синий и логотип проекта, Manrope OFL вне снимков).
- Результат: `out/auction-promo_16x9.mp4`; контактный лист — `out/auction-promo_16x9_sheet.jpg`.
- Фактический размер: 2 130 909 байт (2,13 МБ), длительность 15,00 с, 450 кадров.
- Исходная тихая версия: `out/auction-promo_16x9_silent.mp4` (1,74 МБ).
- Проверки: шрифт загружен, 11 моментов сцены детерминированы, финальная пауза неподвижна;
  H.264/yuv420p/BT.709, полное декодирование без ошибок; AAC stereo 48 кГц,
  громкость −16,24 LUFS, true peak −5,55 dBTP. Звук проверен измерениями, не на слух.
  Отчёты — `build/scene_checks.json`, `build/media_checks.json`, `build/delivery_checks.json`.

## Бриф

Промо для собственников квартир, русский язык. Только реальный мобильный прототип
из `src/pages/auction/SellerAuctionPage.tsx`, маршрут `/auction/app`, коммит `8194e26`.
Покупательские ставки, оплата и реальная публикация в ролике не демонстрируются.

| Время | Экран и действие |
|---|---|
| 0–3 с | «Ваша квартира. Ваши условия.»; общий план телефона с выбранной квартирой |
| 3–7 с | Крупный план условий: 13 500 000 ₽, шаг 50 000 ₽, срок 3 дня; «Проверить условия» |
| 7–11 с | Проверка, отметка согласия, публикация; настоящее состояние ожидания на 1,2 секунды |
| 11–15 с | «Аукцион запущен»; отъезд камеры, логотип; последние 1,5 секунды неподвижны |

`assets/*.png` — снимки реальных состояний, снятые `capture.py` с плотностью 2×.
Данные квартиры и условия — исходные учебные значения прототипа. Для повторяемости
публикации время браузера при захвате фиксируется; даты на экране учебные.
Камера, прокрутка снимков, курсор и рябь кликов детерминированы функцией `render(t)`.
Интерфейс не перерисован: тексты и элементы внутри экрана сохранены. Вынесенные
слева заголовки — цитаты из прототипа, разложенные на строки для видео.

## Пересборка

Из корня репозитория:

```sh
source .venv/bin/activate
# Необязательно: повторный захват исходного прототипа версии 8194e26:
# npm run dev -- --port 5183 --strictPort
# python motion/auction-promo/capture.py
python .agents/skills/product-motion/scripts/verify_scene.py motion/auction-promo/video.html --fmt h --times 1,2.5,2.8,4.5,6.8,7.1,8.5,9.8,10.6,10.9,14 --json motion/auction-promo/build/scene_checks.json
python .agents/skills/product-motion/scripts/render.py motion/auction-promo/video.html video --fmt h --out motion/auction-promo/build/h.mp4
python .agents/skills/product-motion/scripts/music.py motion/auction-promo/plan.js --out motion/auction-promo/build/music.wav
python .agents/skills/product-motion/scripts/mix.py motion/auction-promo/build/music.wav --out motion/auction-promo/build/mix.wav
python .agents/skills/product-motion/scripts/assemble.py --video motion/auction-promo/build/h.mp4 --audio motion/auction-promo/build/mix.wav --out motion/auction-promo/out/auction-promo_16x9.mp4
python .agents/skills/product-motion/scripts/verify_media.py motion/auction-promo/plan.js motion/auction-promo/out/auction-promo_16x9.mp4 --sheet --times 1,4.5,6.65,7.5,9.8,14 --json motion/auction-promo/build/media_checks.json
```

Превью: `video.html?preview=1` через локальный сервер из этой папки.
`build/` и MP4 исключены из Git, исходные снимки и монтаж сохранены в репозитории.
Пересборка использует готовые снимки из `assets/` и не требует запуска приложения.
Скрипт захвата рассчитан на интерфейс версии `8194e26`; при обновлении самого
прототипа его селекторы и ракурсы могут потребовать адаптации.
