# Аукцион квартиры · Покупатель · Циан

Ролик о покупательском сценарии аукциона, собран скиллом product-motion.

- Статус: готово; пользователь разрешил монтировать сразу, без согласования сценария.
- Формат: MP4, 1920×1080, 16:9, 30 кадров/с, ровно 15 секунд, до 20 000 000 байт.
- Звук: фоновая музыка, без озвучки (последнее решение пользователя).
- Музыка: общий с роликом продавца синтезированный трек, без вокала и сэмплов,
  112 BPM; финальный акцент на 10,75 с. Черновой трек; для публичного размещения
  можно заменить лицензионным. Звук проверяется измерениями, не на слух.
- Бренд-профиль: `brand/`, копия `../brand/`.
- Результат: `out/auction-buyer-promo_16x9.mp4`.
- Контактный лист: `out/auction-buyer-promo_16x9_sheet.jpg`.
- Фактический размер: 2 219 582 байт (2,22 МБ), 15,00 с, 450 кадров.
- Проверено: загруженный шрифт, 9 детерминированных моментов сцены, неподвижная
  финальная пауза, H.264/yuv420p/BT.709, AAC 48 кГц, полное декодирование без ошибок,
  ограничение 20 МБ. Отчёты — `build/scene_checks.json`, `build/media_checks.json`,
  `build/delivery_checks.json`.

## Бриф

Промо для покупателя квартиры на русском языке. Источник — существующий компонент
`src/pages/auction/AuctionPage.tsx`, коммит `8194e26`, с его реальными стилями,
модальным подтверждением, состояниями ожидания и принятой ставки.

Компонент сохранён в репозитории отдельно от текущей главной страницы продавца.
`prototype.html` и `prototype.tsx` — изолированный запуск исходного компонента для
захвата экранов; маршруты и исходники приложения не меняются. Подключены те же
три таблицы дизайн-токенов, что и в корневом `index.html`, и `global.css`.

| Время | Экран и действие |
|---|---|
| 0–3 с | Карточка квартиры, фото, выбранная роль «Я покупатель» |
| 3–7 с | Текущая ставка 14 250 000 ₽; увеличение предложения с 14 300 000 до 14 350 000 ₽; «Сделать ставку» |
| 7–9,15 с | Реальная модалка «Подтвердите ставку», сумма 14 350 000 ₽; нажатие подтверждения |
| 9,15–10,75 с | «Отправляем вашу ставку»: настоящее ожидание 1,6 с |
| 10,75–15 с | Цена обновлена, «Ваша ставка лидирует»; отъезд камеры, неподвижные последние 1,5 с |

Значения и три исходные ставки — штатный «Готовый пример со ставками» из режима
практики. `capture.py` проходит его кнопками, увеличивает ставку и получает
успешный ответ от настоящей модели прототипа. Дата браузера фиксируется для
повторяемости учебного примера. `assets/*.png` — снимки с плотностью 2×.
Интерфейс внутри экрана не перерисован. Вынесенные заголовки — фразы из него
с монтажной разбивкой строк и пунктуацией; подписи этапов добавлены для ориентации.
Победа в завершённом аукционе, оплата и оформление не демонстрируются.

## Пересборка

Из корня репозитория:

```sh
source .venv/bin/activate
# Необязательно: захват прототипа версии 8194e26; нужен сервер Vite на 5183:
# python motion/auction-buyer-promo/capture.py
python .agents/skills/product-motion/scripts/verify_scene.py motion/auction-buyer-promo/video.html --fmt h --times 1,2.8,4.5,6.65,7.5,8.9,9.8,10.9,14 --json motion/auction-buyer-promo/build/scene_checks.json
python .agents/skills/product-motion/scripts/render.py motion/auction-buyer-promo/video.html video --fmt h --out motion/auction-buyer-promo/build/h.mp4
python .agents/skills/product-motion/scripts/music.py motion/auction-buyer-promo/plan.js --out motion/auction-buyer-promo/build/music.wav
python .agents/skills/product-motion/scripts/mix.py motion/auction-buyer-promo/build/music.wav --out motion/auction-buyer-promo/build/mix.wav
python .agents/skills/product-motion/scripts/assemble.py --video motion/auction-buyer-promo/build/h.mp4 --audio motion/auction-buyer-promo/build/mix.wav --out motion/auction-buyer-promo/out/auction-buyer-promo_16x9.mp4
python .agents/skills/product-motion/scripts/verify_media.py motion/auction-buyer-promo/plan.js motion/auction-buyer-promo/out/auction-buyer-promo_16x9.mp4 --sheet --times 1,4.5,6.65,7.5,9.8,14 --json motion/auction-buyer-promo/build/media_checks.json
```

Превью монтажа: `video.html?preview=1` через локальный HTTP-сервер из этой папки.
Временные файлы — в `build/`, готовые файлы — в `out/`; MP4 исключены из Git.
Для пересборки достаточно сохранённых снимков из `assets/`, запуск приложения
не требуется. Скрипт захвата и изолированный просмотр относятся к исходной
версии `8194e26`; обновлённый интерфейс может потребовать адаптации захвата.
