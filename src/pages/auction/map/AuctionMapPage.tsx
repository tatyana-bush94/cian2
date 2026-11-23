import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { METRIKA_COUNTER_ID, type AuctionRole, type GoalRecord } from '@/analytics/auction';
import { metrics } from './metrics';
import { screens, transitions, getScreen, type ScenarioScreen, type Transition } from './scenario';
import s from './AuctionMapPage.module.css';

const CARD_W = 216;
const CARD_H = 456;
const GAP_X = 140;
const GAP_Y = 148;
const WIDTH = 1740;
const pos = (screen: ScenarioScreen) => ({
  x: 50 + screen.col * (CARD_W + GAP_X),
  y: 64 + screen.row * (CARD_H + GAP_Y),
});
const stateName = (kind?: ScenarioScreen['kind']) =>
  kind === 'error'
    ? 'Ошибка'
    : kind === 'waiting'
      ? 'Ожидание'
      : kind === 'success'
        ? 'Успех'
        : kind === 'extra'
          ? 'Окно'
          : 'Экран';

function Connection({ edge, index, muted }: { edge: Transition; index: number; muted: boolean }) {
  const a = getScreen(edge.from)!;
  const b = getScreen(edge.to)!;
  const p = pos(a),
    q = pos(b);
  let d: string, lx: number, ly: number;
  if (a.id === b.id) {
    d = `M ${p.x + CARD_W / 2 - 35} ${p.y} C ${p.x - 10} ${p.y - 70}, ${p.x + CARD_W + 10} ${p.y - 70}, ${p.x + CARD_W / 2 + 35} ${p.y}`;
    lx = p.x + CARD_W / 2;
    ly = p.y - 42;
  } else if (a.row === b.row && b.col === a.col + 1) {
    const y = p.y + 200;
    d = `M ${p.x + CARD_W} ${y} L ${q.x - 7} ${y}`;
    lx = (p.x + CARD_W + q.x) / 2;
    ly = y;
  } else if (a.col === b.col && b.row === a.row + 1) {
    const x = p.x + CARD_W / 2;
    d = `M ${x} ${p.y + CARD_H} L ${x} ${q.y - 7}`;
    lx = x;
    ly = (p.y + CARD_H + q.y) / 2;
  } else {
    const down = q.y > p.y;
    const sx = p.x + (q.x < p.x ? 36 : CARD_W - 36);
    const tx = q.x + (q.x < p.x ? CARD_W - 36 : 36);
    const sy = down ? p.y + CARD_H : p.y;
    const ty = down ? q.y - 7 : q.y + CARD_H + 7;
    const lane = (down ? p.y + CARD_H + 52 : p.y - 38) + (index % 3) * 23;
    d = `M ${sx} ${sy} V ${lane} H ${tx} V ${ty}`;
    lx = (sx + tx) / 2;
    ly = lane;
  }
  const words = edge.goal.replace('auction_', '').split('_');
  const middle = Math.ceil(words.length / 2);
  const lines =
    words.length > 2
      ? [words.slice(0, middle).join('_'), words.slice(middle).join('_')]
      : [words.join('_')];
  return (
    <g
      className={`${s.connection} ${muted ? s.connectionMuted : ''} ${edge.main ? s.mainConnection : ''}`}
    >
      <title>
        {edge.from} → {edge.to}: {edge.goal} · {edge.label}
      </title>
      <path d={d} markerEnd={`url(#arrow-${a.role})`} />
      <g transform={`translate(${lx}, ${ly})`}>
        <rect x={-65} y={-29} width={130} height={58} rx={8} />
        <text textAnchor="middle">
          <tspan x="0" y="-13" className={s.arrowPrefix}>
            auction_
          </tspan>
          {lines.map((line, i) => (
            <tspan key={line} x="0" y={lines.length === 1 ? 4 : i * 12 - 1}>
              {line}
            </tspan>
          ))}
          <tspan x="0" y="22" className={s.arrowLabel}>
            {edge.label.length > 22 ? edge.label.slice(0, 21) + '…' : edge.label}
          </tspan>
        </text>
      </g>
    </g>
  );
}

function ScreenCard({
  screen,
  active,
  onSelect,
}: {
  screen: ScenarioScreen;
  active: boolean;
  onSelect: () => void;
}) {
  const { x, y } = pos(screen);
  return (
    <button
      className={`${s.screenCard} ${active ? s.activeCard : ''}`}
      style={{ left: x, top: y }}
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${screen.title}: показать переходы`}
    >
      <div className={s.cardHeading}>
        <span>{screen.id.replace(`${screen.role}_`, '')}</span>
        <span className={s[screen.kind ?? 'normal']}>{stateName(screen.kind)}</span>
      </div>
      <h3>{screen.title}</h3>
      <div className={s.thumbnail} aria-hidden="true">
        <iframe
          src={`/map/preview/${screen.id}`}
          title={`Миниатюра: ${screen.title}`}
          loading="lazy"
          tabIndex={-1}
        />
      </div>
      <div className={s.screenGoal}>
        <span>Цель при показе</span>
        <code>auction_screen_view</code>
        <small>
          role={screen.role} · step={screen.step}
          <br />
          screen={screen.id}
        </small>
      </div>
    </button>
  );
}

function FlowMap({
  role,
  selected,
  setSelected,
}: {
  role: AuctionRole;
  selected: string;
  setSelected: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(0.7);
  const [allEdges, setAllEdges] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const group = screens.filter((screen) => screen.role === role);
  const edges = transitions.filter((edge) => getScreen(edge.from)?.role === role);
  const height =
    (Math.max(...group.map((screen) => screen.row)) + 1) * (CARD_H + GAP_Y) - GAP_Y + 125;
  const selectedInGroup = group.some((screen) => screen.id === selected);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => setZoom(Math.min(1, Math.max(0.3, (element.clientWidth - 20) / WIDTH)));
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  function fit() {
    if (viewport.current)
      setZoom(Math.min(1, Math.max(0.3, (viewport.current.clientWidth - 30) / WIDTH)));
  }
  return (
    <section
      id={role}
      className={s.flowSection}
      aria-label={`Карта сценария ${role === 'seller' ? 'продавца' : 'покупателя'}`}
    >
      <div className={s.flowHeader}>
        <div className={s.roleTitle}>
          <span className={role === 'seller' ? s.sellerIcon : s.buyerIcon}>
            {role === 'seller' ? '↗' : '↘'}
          </span>
          <div>
            <span>СЦЕНАРИЙ {role === 'seller' ? '01' : '02'}</span>
            <h2>{role === 'seller' ? 'Продавец' : 'Покупатель'}</h2>
          </div>
          <p>
            {group.length} экранов и состояний
            <br />
            {role === 'seller' ? 'От условий до публикации' : 'От квартиры до результата'}
          </p>
        </div>
        <div className={s.mapControls}>
          <button
            onClick={() => {
              setAllEdges(!allEdges);
              setSelected('');
            }}
            aria-pressed={allEdges}
          >
            {allEdges ? 'Все переходы' : 'Основной путь'} <span>{edges.length}</span>
          </button>
          <button
            onClick={() => setZoom(Math.max(0.3, +(zoom - 0.1).toFixed(2)))}
            aria-label={`Уменьшить карту ${role}`}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(Math.min(1.2, +(zoom + 0.1).toFixed(2)))}
            aria-label={`Увеличить карту ${role}`}
          >
            +
          </button>
          <button onClick={fit}>Вписать</button>
        </div>
      </div>
      <div
        className={s.viewport}
        ref={viewport}
        tabIndex={0}
        aria-label="Карта с прокруткой. Выберите экран, чтобы увидеть его переходы."
      >
        <div style={{ width: WIDTH * zoom, height: height * zoom }}>
          <div
            className={`${s.canvas} ${role === 'buyer' ? s.buyerCanvas : ''}`}
            style={{ width: WIDTH, height, transform: `scale(${zoom})` }}
          >
            <span className={s.rowLabel}>ОСНОВНОЙ ПУТЬ →</span>
            <span className={s.rowLabel} style={{ top: CARD_H + GAP_Y + 32 }}>
              СОСТОЯНИЯ И АЛЬТЕРНАТИВНЫЕ ПУТИ
            </span>
            <svg
              className={s.connections}
              width={WIDTH}
              height={height}
              aria-label="Стрелки переходов с названиями целей Метрики"
            >
              <defs>
                <marker
                  id={`arrow-${role}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    fill={role === 'seller' ? '#2767ed' : '#7259d5'}
                  />
                </marker>
              </defs>
              {edges
                .filter(
                  (edge) =>
                    allEdges ||
                    (selectedInGroup
                      ? edge.from === selected || edge.to === selected
                      : edge.main ||
                        (getScreen(edge.from)?.col === getScreen(edge.to)?.col &&
                          getScreen(edge.to)!.row === getScreen(edge.from)!.row + 1)),
                )
                .map((edge, index) => (
                  <Connection
                    key={`${edge.from}-${edge.to}-${edge.goal}`}
                    edge={edge}
                    index={index}
                    muted={selectedInGroup && edge.from !== selected && edge.to !== selected}
                  />
                ))}
            </svg>
            {group.map((screen) => (
              <ScreenCard
                key={screen.id}
                screen={screen}
                active={selected === screen.id}
                onSelect={() => {
                  setSelected(selected === screen.id ? '' : screen.id);
                  setAllEdges(false);
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <p className={s.mapHint}>
        Миниатюры — реальные компоненты прототипа. Нажмите на экран, чтобы увидеть все его входы и
        выходы. «Все переходы» раскрывает полную схему. Карту можно прокручивать.
      </p>
    </section>
  );
}

function EventJournal() {
  const [records, setRecords] = useState<GoalRecord[]>(() => window.__auctionGoals ?? []);
  useEffect(() => {
    const receive = () => setRecords([...(window.__auctionGoals ?? [])]);
    window.addEventListener('auction:goal', receive);
    return () => window.removeEventListener('auction:goal', receive);
  }, []);
  return (
    <div className={s.journal}>
      <div>
        <strong>Журнал проверки</strong>
        <span>{records.length} событий · последние 200</span>
        <button
          onClick={() => {
            window.__auctionGoals = [];
            setRecords([]);
          }}
        >
          Очистить
        </button>
      </div>
      {records.length ? (
        <ol>
          {records
            .slice(-8)
            .reverse()
            .map((record) => (
              <li key={record.event_id}>
                <code>{record.goal}</code>
                <span>
                  {record.params.role} · шаг {record.params.step} · {record.params.screen}
                  {record.params.result ? ` · ${record.params.result}` : ''}
                </span>
              </li>
            ))}
        </ol>
      ) : (
        <p>
          Откройте сценарий по кнопке выше, пройдите несколько шагов и вернитесь сюда. Журнал
          сохраняется при переходах внутри прототипа. Для проверки из консоли:{' '}
          <code>window.__auctionGoals</code>.
        </p>
      )}
    </div>
  );
}

export function AuctionMapPage() {
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState<AuctionRole | 'all'>('all');
  const [eventFilter, setEventFilter] = useState('');
  useEffect(() => {
    document.title = 'Карта аукциона · Циан';
  }, []);
  const screen = getScreen(selected);
  const related = transitions.filter(
    (edge) =>
      (!screen || edge.from === selected || edge.to === selected) &&
      (tab === 'all' || getScreen(edge.from)?.role === tab) &&
      `${edge.goal} ${edge.label} ${edge.from} ${edge.to}`
        .toLowerCase()
        .includes(eventFilter.toLowerCase()),
  );
  return (
    <div className={s.page}>
      <a className="skip-link" href="#map-main">
        К содержимому
      </a>
      <header className={s.header}>
        <Link to="/" aria-label="Открыть прототип Циан">
          <img src="/images/cian-logo.svg" alt="Циан" width="100" height="28" />
        </Link>
        <span className={s.headerDivider} />
        <span>Аукцион квартиры</span>
        <nav aria-label="Разделы карты">
          <a href="#scenarios">Сценарии</a>
          <a href="#events">События</a>
          <a href="#metrics">Метрики</a>
        </nav>
        <span className={s.draftBadge}>
          <i />
          Прототип · v1.0
        </span>
      </header>
      <main id="map-main">
        <section className={s.hero}>
          <div>
            <span className={s.eyebrow}>ПРОДУКТОВАЯ ГИПОТЕЗА / АУКЦИОН</span>
            <h1>
              Весь сценарий.
              <br />
              <span>На одной карте.</span>
            </h1>
            <p>
              Как собственник запускает аукцион, а покупатель делает ставку.
              <br />
              Экраны, переходы и события, которые помогут проверить идею.
            </p>
            <div className={s.heroActions}>
              <Link className={s.primaryLink} to="/auction/app">
                Пройти за продавца <span>↗</span>
              </Link>
              <Link className={s.secondaryLink} to="/auction/buyer">
                Пройти за покупателя <span>↗</span>
              </Link>
            </div>
          </div>
          <aside className={s.heroNote}>
            <span className={s.noteIcon}>⌘</span>
            <span className={s.eyebrow}>ОТ ИДЕИ К ИЗМЕРЕНИЮ</span>
            <strong>
              Меньше догадок.
              <br />
              Больше сигналов.
            </strong>
            <p>
              Каждый шаг связан с целью Метрики.
              <br />
              Каждая метрика — с решением о фиче.
            </p>
            <div>
              <span>
                <b>{screens.length}</b> экранов
              </span>
              <span>
                <b>2</b> роли
              </span>
              <span>
                <b>{metrics.length}</b> метрик
              </span>
            </div>
          </aside>
        </section>
        <section id="scenarios" className={s.scenarioIntro}>
          <div>
            <span className={s.eyebrow}>01 / КАРТА ЭКРАНОВ</span>
            <h2>Два пути к одному аукциону</h2>
            <p>Синий — продавец, фиолетовый — покупатель. Подписи на стрелках — имена целей.</p>
          </div>
          <div className={s.legend}>
            <span>
              <i className={s.legendNormal} />
              Экран
            </span>
            <span>
              <i className={s.legendWaiting} />
              Ожидание
            </span>
            <span>
              <i className={s.legendError} />
              Ошибка
            </span>
            <span>
              <i className={s.legendSuccess} />
              Успех
            </span>
          </div>
        </section>
        <div className={s.scenarioTabs} role="group" aria-label="Показать сценарии">
          {(
            [
              ['all', 'Обе роли'],
              ['seller', 'Продавец'],
              ['buyer', 'Покупатель'],
            ] as const
          ).map(([value, name]) => (
            <button
              key={value}
              aria-pressed={tab === value}
              onClick={() => {
                setTab(value);
                setSelected('');
              }}
            >
              {name}
            </button>
          ))}
          <span>
            Общая цель экрана: <code>auction_screen_view</code>
          </span>
        </div>
        {tab !== 'buyer' && <FlowMap role="seller" selected={selected} setSelected={setSelected} />}
        <div className={s.roleBridge}>
          <span>↕</span>
          <div>
            <strong>Один объект, две роли</strong>
            <p>
              «Я покупатель» и «Я продавец» → <code>auction_role_switch</code> · <code>role</code> —
              исходная роль, <code>target_role</code> — новая. Условия и <code>auction_id</code>{' '}
              передаются из опубликованного аукциона.
            </p>
          </div>
        </div>
        {tab !== 'seller' && <FlowMap role="buyer" selected={selected} setSelected={setSelected} />}
        <section id="events" className={s.eventsSection}>
          <div className={s.sectionTitle}>
            <div>
              <span className={s.eyebrow}>02 / ПЛАН СОБЫТИЙ</span>
              <h2>{screen ? `Переходы: ${screen.title}` : 'От экрана к событию'}</h2>
              <p>Полный реестр переходов. Клик на карте фильтрует таблицу.</p>
            </div>
            {selected && (
              <button className={s.textButton} onClick={() => setSelected('')}>
                Сбросить выбор ×
              </button>
            )}
            <input
              aria-label="Поиск события"
              placeholder="Найти событие или экран"
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
            />
          </div>
          <div className={s.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>Откуда → куда</th>
                  <th>Действие / результат</th>
                  <th>Цель Яндекс Метрики</th>
                </tr>
              </thead>
              <tbody>
                {related.map((edge) => (
                  <tr key={`${edge.from}-${edge.to}-${edge.goal}`}>
                    <td>
                      <span>{edge.from}</span>
                      <span className={s.toScreen}>→ {edge.to}</span>
                    </td>
                    <td>{edge.label}</td>
                    <td>
                      <code>{edge.goal}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!related.length && <p className={s.empty}>Событий по этому запросу нет.</p>}
          </div>
          <div className={s.annotation}>
            Справка, фотографии и сброс открываются из любого доступного шага и возвращают на
            предыдущий экран; на схеме показаны входы с первого экрана. Переключение вкладок
            доступно из любого состояния карточки. Из истории и условий тоже можно сделать ставку.
            Из завершённого сценария продавца можно открыть подтверждение нового черновика. События
            используют фактические <code>screen</code>, <code>step</code> и <code>role</code>.
          </div>
        </section>
        <section id="metrics" className={s.metricsSection}>
          <div className={s.sectionTitle}>
            <div>
              <span className={s.eyebrow}>03 / КАК ПРОВЕРИТЬ ФИЧУ</span>
              <h2>Что считаем успехом</h2>
              <p>
                Гипотеза: понятные условия и прозрачная ставка доведут обе роли до участия в
                аукционе.
              </p>
            </div>
            <span className={s.hypothesisBadge}>Условные цели для пилота</span>
          </div>
          <div className={s.metricGrid}>
            {metrics.map((metric, index) => (
              <article key={metric.name} className={index < 2 ? s.mainMetric : ''}>
                <span>{metric.type}</span>
                <strong>{metric.target}</strong>
                <h3>{metric.name}</h3>
                <p>{metric.formula}</p>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>
          <div className={s.measurementNotes}>
            <div>
              <strong>Окно и правила расчёта</strong>
              <p>
                Пилот — 14 дней набора + 8 дней на завершение последней когорты. Воронки — в
                пределах одной сессии вкладки, публикация — в одном flow_id. Дедупликация по
                event_id, попытки связываем по attempt_id. Карточка и подтверждение: знаменатель по
                auction_screen_view с нужным screen или по указанной цели. При пустом знаменателе —
                «нет данных».
              </p>
            </div>
            <div>
              <strong>Решение после пилота</strong>
              <p>
                Продолжаем, если обе главные конверсии достигнуты и защитные метрики в пределах
                целей. Иначе разбираем провалившийся шаг. Минимум 100 продавцов и 300 покупателей;
                при меньшей выборке продлеваем сбор. Цели — учебные допущения, не текущие показатели
                Циана.
              </p>
            </div>
          </div>
        </section>
        <section className={s.instrumentation}>
          <div>
            <span className={s.eyebrow}>04 / ПРОВЕРКА РАЗМЕТКИ</span>
            <h2>Метрика готова к подключению</h2>
            <p>
              Счётчик: <code>{METRIKA_COUNTER_ID}</code> — заглушка. Сейчас цели попадают только в
              журнал браузера. Для отправки нужен настоящий ID, официальный тег и JavaScript-цели с
              именами из реестра.
            </p>
            <pre>{`ym(COUNTER_ID, 'reachGoal', 'auction_bid_submit', {\n  role: 'buyer', step: 4, screen: 'buyer_confirm',\n  session_id, flow_id, attempt_id, auction_id, event_id,\n  prototype: true\n});`}</pre>
            <p className={s.smallPrint}>
              Снимки карты не отправляют события и не меняют черновики. Просмотр сохранённого успеха
              не создаёт повторную цель успеха. Ожидание не считается конверсией. Данные прототипа
              помечены prototype=true; в реальном пилоте этот флаг меняют и исключают демоданные.
              Личные данные и суммы в цели не передаются.
            </p>
          </div>
          <EventJournal />
        </section>
      </main>
      <footer className={s.footer}>
        <img src="/images/cian-logo.svg" width="82" alt="Циан" />
        <span>Аукцион квартиры · Карта сценариев</span>
        <Link to="/ui-kit">Открыть UI-kit ↗</Link>
        <span>Учебный прототип · 2026</span>
      </footer>
    </div>
  );
}
