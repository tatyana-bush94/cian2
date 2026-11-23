# Устройство проекта

[Проморолик «Продажа на аукционе», 15 секунд: сценарий, исходники и пересборка](../motion/auction-promo/README.md).

[Проморолик «Аукцион — покупатель», 15 секунд: экраны, монтаж и пересборка](../motion/auction-buyer-promo/README.md).

Это автономная учебная основа для прототипирования интерфейсов Циана. Цель — собирать и проверять сценарии на React с узнаваемыми компонентами, типографикой и цветами.

## Стек и окружение

React 19, TypeScript 5, CSS Modules, Vite 8 и React Router 7. Node.js 24 (см. `.nvmrc`), npm; точные версии зависимостей закреплены в `package-lock.json`. Vite выбран для простого запуска прототипов, а не как утверждение о production-сборке Циана. Внешние сервисы, сервер, ключи и `.env` для запуска не нужны.

```sh
npm ci
npm run dev
```

Откройте адрес из терминала, обычно http://127.0.0.1:5173. Для второго проекта рядом: `npm run dev -- --port 5174`.

## Структура

- `src/ui/` — рабочие React-адаптации, CSS Modules и карты оригинальных классов/иконок.
- `src/pages/UIKitPage.tsx` — интерактивный каталог компонентов.
- `src/styles/global.css` — локальные шрифты, базовые стили и доступность.
- `public/reference/` — неизменённый исходный UI-справочник, токены, источники, ZIP и скрипт проверки.
- `src/test/`, `*.test.tsx` — тесты поведения. `docs/` — документация и происхождение материалов.

## Команды

| Команда                   | Результат                                          |
| ------------------------- | -------------------------------------------------- |
| `npm run dev`             | Сервер разработки с обновлением при изменениях     |
| `npm run build`           | Проверка TypeScript и статическая сборка в `dist/` |
| `npm run preview`         | Локальный просмотр собранного приложения           |
| `npm run typecheck`       | Проверка типов                                     |
| `npm run lint`            | ESLint                                             |
| `npm test`                | Vitest и Testing Library: поведение компонентов    |
| `npm run verify:snapshot` | Проверка целостности извлечённого UI-kit           |
| `npm run format`          | Форматирование авторских исходников                |

GitHub Actions выполняет установку, проверку снимка, типов, линтер, тесты и сборку на Node.js 24. Для будущего статического хостинга требуется SPA fallback на `index.html`, кроме существующих файлов; вложенные маршруты не являются отдельными HTML-файлами. Хостинг и превью PR не настроены.

## Источник и точность

Исходный набор взят из `dyachkovp/pvldchkv`, коммит `1a0cfd7`, каталог `cian`, дата снимка 12.11.2026. Сохранены 526 токенов, 5 режимов, 24 SVG, 292 исходных файла и Lato 400/600/700. Проверка `verify:snapshot` контролирует токены, ZIP, шрифты и ссылки исходного справочника.

URL source maps, SHA-256 и ограничения находятся в `public/reference/data/manifest.json`. Это tree-shaken снимок одной страницы, а не полный официальный npm-дистрибутив. Версии приватных пакетов неизвестны. Извлечённые материалы принадлежат Циану; исходный снимок не содержит подтверждённой лицензии приватных пакетов. Не приписываем ему лицензию нашего учебного кода.

## Рабочий UI-слой и API

```tsx
import { Button, Input, Checkbox, Select, Badge, Modal } from '@/ui';

<Input label="Район" value={district} onChange={e => setDistrict(e.target.value)} />
<Button theme="main_primary" size="M" onClick={search}>Найти</Button>
<Badge tone="positive">Хорошая цена</Badge>
```

Это API учебной адаптации. В отличие от исходного `@cian/ui-kit`, `Input` и `Checkbox` используют стандартный DOM `onChange(event)` без второго аргумента. Не импортируйте приватные пакеты из сохранённых исходников.

| Компонент             | Основные props и поведение                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Button`              | `theme` (11 вариантов), `size` XS/M/L, `loading`, `fullWidth`, `beforeIcon`, стандартные button props. Loading блокирует нажатие. |
| `Input`               | `label`, `hint`, `error`, `size`, `leadingIcon`, стандартные input props. Ошибка связана через aria-describedby.                  |
| `Select`              | `label`, `options: {value,label}[]`, стандартные select props. Нативный доступный выбор.                                          |
| `Checkbox`, `Radio`   | `label`, `checked`/`defaultChecked`, `onChange`; radio объединяются через `name`.                                                 |
| `Badge`               | `tone`: neutral/main/positive/warning/negative.                                                                                   |
| `Text`                | `variant`: UIHeading1–6, Body1, Body2, Caption; `as` задаёт семантический HTML-тег.                                               |
| `Icon`                | `name`, `size`; исходные SVG плюс явно локальные вспомогательные Heart/Menu/Sort/Message/Bell.                                    |
| `Modal`               | `open`, `title`, `onClose`; native dialog, Escape, возврат фокуса.                                                                |
| `Tooltip`             | `text`, `label`; hover/focus/tap, Escape.                                                                                         |
| `Spinner`, `Skeleton` | Загрузка и заполнители размеров.                                                                                                  |

Оригинальные CSS-классы применяются к Button, Input, Checkbox, Radio, Badge и Skeleton. Типографика повторяет измеренную шкалу. Select, Tooltip, Modal и Spinner — локальные реализации поведения на тех же токенах: они не заявляют полную совместимость со всеми внутренними адаптивными паттернами Циана. Справочник `/reference/` позволяет сравнить источники с адаптацией.

Имена цветов берём из семантических токенов: например `--control-main-primary-default`, `--text-primary-default`, `--background-secondary`, `--stroke-control-focused`. В каталоге доступны светлая и тёмная темы; приложение прототипа использует светлую.

Тестовый runner отключает встроенный Node Web Storage, чтобы Vitest использовал браузерный storage jsdom; это предотвращает конфликт на Node.js 25+. На приложение в браузере настройка не влияет.
