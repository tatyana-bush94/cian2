import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { newEventId, restartFlow, trackGoal, useScreenGoal } from '@/analytics/auction';
import { buyerPreview, PREVIEW_NOW, readBuyerState } from './map/preview';
import { getScreen } from './map/scenario';
import { Checkbox, Input, Modal, Select, Spinner } from '@/ui';
import {
  AuctionButton as Button,
  AuctionHeader,
  AuctionFooter,
  AuctionHelp,
} from './AuctionChrome';
import c from './AuctionChrome.module.css';
import { AuctionIcon as I } from './AuctionIcon';
import { RoleSwitcher } from './RoleSwitcher';
import { useAuctionRoleNavigation } from './roleNavigation';
import {
  auctionReducer,
  canBid,
  currentPrice,
  DAY,
  digits,
  initialState,
  minimumBid,
  money,
  parseMoney,
  readAuction,
  STORAGE_KEY,
  type Auction,
} from './model';
import s from './AuctionPage.module.css';

type Role = 'seller' | 'buyer';
type Tab = 'about' | 'terms' | 'history';
const photos = [
  {
    src: '/images/auction-living-room.jpg',
    alt: 'Светлая гостиная с мягким диваном и большими окнами',
  },
  { src: '/images/auction-interior.jpg', alt: 'Интерьер квартиры в тёплых светлых оттенках' },
  { src: '/images/auction-bedroom.jpg', alt: 'Светлая комната с деревянными деталями' },
];
const date = (value: number) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
const time = (value: number) =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);

function Countdown({ endsAt, now }: { endsAt: number; now: number }) {
  const seconds = Math.max(0, Math.floor((endsAt - now) / 1000));
  const parts = [
    Math.floor(seconds / 86400),
    Math.floor(seconds / 3600) % 24,
    Math.floor(seconds / 60) % 60,
  ];
  return (
    <div
      className={s.countdown}
      aria-label={`До конца: ${parts[0]} дн., ${parts[1]} ч., ${parts[2]} мин.`}
    >
      <I name="clock" size={17} />
      <span>До конца</span>
      <strong>
        {parts[0]}д <span>:</span> {String(parts[1]).padStart(2, '0')}ч <span>:</span>{' '}
        {String(parts[2]).padStart(2, '0')}м
      </strong>
    </div>
  );
}

function Terms({ auction }: { auction: Auction }) {
  return (
    <dl className={s.terms}>
      <div>
        <dt>Стартовая цена</dt>
        <dd>{money(auction.startPrice)}</dd>
      </div>
      <div>
        <dt>Минимальный шаг</dt>
        <dd>{money(auction.bidStep)}</dd>
      </div>
      <div>
        <dt>Завершение</dt>
        <dd>{date(auction.endsAt)}</dd>
      </div>
    </dl>
  );
}

export function AuctionPage({
  initialRole = 'seller',
  previewScreen,
}: {
  initialRole?: Role;
  previewScreen?: string;
}) {
  const preview = !!previewScreen;
  const navigateRole = useAuctionRoleNavigation();
  const [state, dispatch] = useReducer(auctionReducer, undefined, () =>
    previewScreen
      ? buyerPreview(previewScreen)
      : initialRole === 'buyer'
        ? readBuyerState()
        : initialState(readAuction()),
  );
  const { auction, request } = state;
  const [role, setRole] = useState<Role>(initialRole);
  const [tab, setTab] = useState<Tab>(
    previewScreen === 'terms' ? 'terms' : previewScreen === 'history' ? 'history' : 'about',
  );
  const [now, setNow] = useState(() => (preview ? PREVIEW_NOW : Date.now()));
  const [sellerStep, setSellerStep] = useState<'conditions' | 'review'>('conditions');
  const [startPrice, setStartPrice] = useState(digits(auction.startPrice));
  const [step, setStep] = useState(String(auction.bidStep));
  const [duration, setDuration] = useState('3');
  const [formError, setFormError] = useState('');
  const [reviewTerms, setReviewTerms] = useState({
    startPrice: auction.startPrice,
    bidStep: auction.bidStep,
    endsAt: auction.endsAt,
  });
  const [agreed, setAgreed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const minimum = minimumBid(auction);
  const [bidValue, setBidValue] = useState(previewScreen === 'low' ? '100' : digits(minimum));
  const [bidError, setBidError] = useState(
    previewScreen === 'low' ? 'Минимальная ставка — 14 300 000 ₽. Увеличьте сумму.' : '',
  );
  const [confirmBid, setConfirmBid] = useState<number | null>(
    previewScreen === 'confirm' ? minimum : null,
  );
  const [help, setHelp] = useState(previewScreen === 'help');
  const [gallery, setGallery] = useState(previewScreen === 'gallery');
  const [photo, setPhoto] = useState(0);
  const [saved, setSaved] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [reset, setReset] = useState<'draft' | 'example' | null>(
    previewScreen === 'reset' ? 'example' : previewScreen === 'reset_draft' ? 'draft' : null,
  );
  const [storageError, setStorageError] = useState(false);
  const detailsRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const listingHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (preview) return;
    document.title = 'Аукцион квартиры · Циан';
    listingHeading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
    const interval = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      dispatch({ type: 'expire', now: tick });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auction));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [auction, preview]);

  useEffect(() => {
    if (!preview) setBidValue(digits(minimum));
  }, [minimum, preview]);

  useEffect(() => {
    if (request.status !== 'pending' || preview) return;
    const timer = window.setTimeout(() => dispatch({ type: 'resolve', now: Date.now() }), 1600);
    return () => window.clearTimeout(timer);
  }, [request, preview]);

  useEffect(() => {
    if (!publishing || preview) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'publish', terms: reviewTerms, now: Date.now() });
      setPublishing(false);
      titleRef.current?.focus();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [publishing, reviewTerms, preview]);

  const live = canBid(auction, now);
  const highest = auction.bids.at(-1);
  const ownBid = [...auction.bids].reverse().find((bid) => bid.bidder === 'you');
  const leading = highest?.bidder === 'you';
  const activeParticipants = new Set(auction.bids.map((bid) => bid.bidder)).size;
  const current = currentPrice(auction);
  const pending = request.status === 'pending';

  const outcome =
    auction.bids.length === 0 ? 'no_bids' : leading ? 'won' : ownBid ? 'lost' : 'not_participated';
  const screen = `buyer_${help ? 'help' : gallery ? 'gallery' : reset ? (reset === 'draft' ? 'reset_draft' : 'reset') : confirmBid !== null ? 'confirm' : pending ? 'pending' : request.status === 'error' ? (request.kind === 'closed' ? 'closed' : request.kind === 'low' ? 'low' : 'error') : bidError ? 'low' : auction.status === 'draft' ? 'not_started' : tab !== 'about' ? tab : auction.status === 'ended' ? (outcome === 'not_participated' ? 'ended' : outcome === 'no_bids' ? 'empty' : outcome) : ownBid ? (leading ? 'leading' : 'outbid') : 'listing'}`;
  const analyticsStep = getScreen(screen)?.step ?? 1;
  const auctionId = `auction-${auction.publishedAt ?? 'draft'}`;
  useScreenGoal('buyer', screen, analyticsStep, preview || role !== 'buyer', auctionId);
  const attemptId = useRef('');
  const previousRequest = useRef(request.status);
  const wasLeading = useRef(leading);
  const resultKey = useRef('');
  useEffect(() => {
    if (!preview && previousRequest.current === 'pending' && request.status !== 'pending') {
      trackGoal(request.status === 'success' ? 'auction_bid_success' : 'auction_bid_error', {
        role: 'buyer',
        screen,
        step: request.status === 'success' ? 5 : 4,
        attempt_id: attemptId.current,
        auction_id: auctionId,
        result: request.status === 'success' ? 'accepted' : request.kind,
      });
    }
    previousRequest.current = request.status;
    if (!preview && wasLeading.current && !leading && ownBid && auction.status === 'live') {
      trackGoal('auction_outbid', { role: 'buyer', screen, step: 5, auction_id: auctionId });
    }
    wasLeading.current = leading;
    if (
      !preview &&
      role === 'buyer' &&
      auction.status === 'ended' &&
      resultKey.current !== `${auctionId}:${outcome}`
    ) {
      resultKey.current = `${auctionId}:${outcome}`;
      trackGoal('auction_result_view', {
        role: 'buyer',
        screen,
        step: 6,
        auction_id: auctionId,
        result: outcome,
      });
    }
  }, [request, leading, ownBid, auction.status, auctionId, outcome, screen, preview, role]);

  function goal(
    name: string,
    extra: { source?: string; result?: string; target_role?: Role } = {},
  ) {
    if (!preview)
      trackGoal(name, { role, screen, step: analyticsStep, auction_id: auctionId, ...extra });
  }
  function closeBid() {
    goal('auction_bid_cancel');
    setConfirmBid(null);
  }
  function closeHelp() {
    goal('auction_help_close');
    setHelp(false);
  }
  function closeGallery() {
    goal('auction_gallery_close');
    setGallery(false);
  }
  function closeReset() {
    goal('auction_reset_cancel');
    setReset(null);
  }
  function openHelp() {
    goal('auction_help_open');
    setHelp(true);
  }
  function openGallery(index: number) {
    goal('auction_gallery_open');
    setPhoto(index);
    setGallery(true);
  }
  function openReset(mode: 'draft' | 'example') {
    goal('auction_reset_open', { source: mode });
    setReset(mode);
  }

  function changeRole(nextRole: Role) {
    if (pending || nextRole === role) return;
    goal('auction_role_switch', { target_role: nextRole });
    if (initialRole === 'buyer' && nextRole === 'seller') {
      navigateRole('seller');
      return;
    }
    setRole(nextRole);
    setBidError('');
  }

  function review(event: FormEvent) {
    event.preventDefault();
    const price = parseMoney(startPrice);
    if (!Number.isFinite(price) || price < 1_000_000 || price > 1_000_000_000_000) {
      setFormError('Введите цену от 1 000 000 до 1 000 000 000 000 ₽, только целыми рублями.');
      return;
    }
    setFormError('');
    setReviewTerms({
      startPrice: price,
      bidStep: Number(step),
      endsAt: Date.now() + Number(duration) * DAY,
    });
    setSellerStep('review');
    setAgreed(false);
    cardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    titleRef.current?.focus();
  }

  function startBid() {
    const amount = parseMoney(bidValue);
    if (!live || pending) return;
    if (!Number.isSafeInteger(amount) || amount < minimum) {
      goal('auction_validation_error', { result: 'low' });
      setBidError(`Минимальная ставка — ${money(minimum)}. Увеличьте сумму.`);
      return;
    }
    goal('auction_bid_start');
    setBidError('');
    setConfirmBid(amount);
  }

  function sendBid(amount: number) {
    if (pending || !live) return;
    attemptId.current = newEventId();
    if (!preview)
      trackGoal('auction_bid_submit', {
        role: 'buyer',
        screen,
        step: 4,
        attempt_id: attemptId.current,
        auction_id: auctionId,
        source: request.status === 'error' ? 'retry' : 'confirm',
      });
    dispatch({ type: 'submit', amount, fail: failNext, now: Date.now() });
    setFailNext(false);
    setConfirmBid(null);
  }

  function resetDemo(mode: 'draft' | 'example') {
    goal('auction_reset', { source: mode });
    if (!preview)
      restartFlow(initialRole === 'buyer' ? 'buyer' : mode === 'draft' ? 'seller' : 'buyer');
    dispatch({ type: mode === 'draft' ? 'reset' : 'example', now: Date.now() });
    setRole(initialRole === 'buyer' ? 'buyer' : mode === 'draft' ? 'seller' : 'buyer');
    setSellerStep('conditions');
    setStartPrice(digits(13_500_000));
    setStep('50000');
    setDuration('3');
    setFormError('');
    setBidError('');
    setFailNext(false);
    setConfirmBid(null);
    setReset(null);
    setTab('about');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showTab(nextTab: Tab) {
    if (nextTab !== tab)
      goal(
        nextTab === 'terms'
          ? 'auction_terms_open'
          : nextTab === 'history'
            ? 'auction_history_open'
            : 'auction_about_open',
      );
    setTab(nextTab);
    detailsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  return (
    <div
      className={`${c.app} ${s.app} ${preview ? s.mapPreview : ''}`}
      data-preview={previewScreen}
    >
      <a href="#auction-main" className="skip-link">
        К содержимому
      </a>
      <AuctionHeader preview={preview} onHelp={openHelp} />

      <RoleSwitcher
        preview={preview}
        role={role}
        onChange={changeRole}
        disabled={pending || publishing}
      />

      <main id="auction-main" className={s.main}>
        <div className={s.heading}>
          <div>
            <div className={s.eyebrow}>
              <I name="gavel" size={15} />
              НОВЫЙ ФОРМАТ ПРОДАЖИ
            </div>
            <h1 ref={listingHeading} tabIndex={-1}>
              2-комн. квартира, 64 м²
            </h1>
            <div className={s.address}>
              <span>Москва, Ходынский бульвар, 2</span>
              <span className={s.metroDot} />
              <span>ЦСКА</span>
              <span className={s.walk}>
                <I name="walk" size={16} />7 мин.
              </span>
            </div>
          </div>
          <button
            className={`${s.saveButton} ${saved ? s.saved : ''}`}
            aria-pressed={saved}
            onClick={() => setSaved(!saved)}
          >
            <I name="heart" size={20} />
            <span>{saved ? 'В избранном' : 'В избранное'}</span>
          </button>
        </div>

        <div className={s.layout}>
          <div className={s.propertyColumn}>
            <section className={s.gallery} aria-label="Фотографии квартиры">
              <button
                className={s.mainPhoto}
                onClick={() => openGallery(0)}
                aria-label="Открыть фото гостиной"
              >
                <img src={photos[0].src} alt={photos[0].alt} fetchPriority="high" />
              </button>
              <div className={s.photoStatus}>
                <span className={live ? s.liveDot : s.staticDot} />
                {live
                  ? 'Идёт аукцион'
                  : auction.status === 'ended'
                    ? 'Аукцион завершён'
                    : 'Скоро на аукционе'}
              </div>
              <span className={s.photoCaption}>Больше пространства для вашей жизни</span>
              <div className={s.sidePhotos}>
                {photos.slice(1).map((item, index) => (
                  <button
                    key={item.src}
                    onClick={() => openGallery(index + 1)}
                    aria-label={`Открыть фото ${index + 2}`}
                  >
                    <img src={item.src} alt={item.alt} />
                  </button>
                ))}
              </div>
              <button className={s.allPhotos} onClick={() => openGallery(0)}>
                <I name="expand" size={15} />
                Все 3 фото
              </button>
            </section>

            <section className={s.facts} aria-label="Характеристики квартиры">
              <div>
                <strong>64 м²</strong>
                <span>Общая площадь</span>
              </div>
              <div>
                <strong>32 м²</strong>
                <span>Жилая площадь</span>
              </div>
              <div>
                <strong>12 м²</strong>
                <span>Кухня</span>
              </div>
              <div>
                <strong>8 из 22</strong>
                <span>Этаж</span>
              </div>
            </section>

            <section
              ref={detailsRef}
              className={s.details}
              aria-label="Информация о квартире и аукционе"
            >
              <div className={s.tabs} role="tablist" aria-label="Подробнее">
                {(
                  [
                    ['about', 'О квартире'],
                    ['terms', 'Условия аукциона'],
                    ['history', 'История ставок'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    id={`tab-${value}`}
                    role="tab"
                    aria-selected={tab === value}
                    aria-controls={`panel-${value}`}
                    onClick={() => showTab(value)}
                  >
                    {label}
                    {value === 'history' && <span>{auction.bids.length}</span>}
                  </button>
                ))}
              </div>
              <div
                className={s.tabPanel}
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
              >
                {tab === 'about' && (
                  <>
                    <h2>Место, где хочется остаться</h2>
                    <p>
                      Светлая квартира с большими окнами и готовым ремонтом. Просторная
                      кухня-гостиная для вечеров с близкими, отдельная спальня и много места для
                      хранения.
                    </p>
                    <p>
                      Парк «Ходынское поле» — через дорогу. Рядом кафе, школы и всё, что нужно
                      каждый день. До метро — 7 минут пешком.
                    </p>
                    <div className={s.featureChips}>
                      <span>Дизайнерский ремонт</span>
                      <span>Окна во двор</span>
                      <span>Без посредников</span>
                    </div>
                    <div className={s.owner}>
                      <span className={s.ownerAvatar}>Т</span>
                      <div>
                        <strong>Татьяна</strong>
                        <span>Собственник квартиры</span>
                      </div>
                      <span className={s.ownerCheck}>
                        <I name="shield" size={17} />
                        Учебный объект
                      </span>
                    </div>
                  </>
                )}
                {tab === 'terms' && (
                  <>
                    <h2>
                      {auction.status === 'draft'
                        ? 'Как будет проходить аукцион'
                        : 'Всё об этом аукционе'}
                    </h2>
                    {auction.status === 'draft' ? (
                      <p>
                        Собственник ещё настраивает условия. После публикации здесь появятся
                        стартовая цена, шаг ставки и точное время завершения.
                      </p>
                    ) : (
                      <Terms auction={auction} />
                    )}
                    <ol className={s.rules}>
                      <li>
                        Первая ставка — не ниже стартовой цены. Следующая — не ниже текущей цены
                        плюс минимальный шаг.
                      </li>
                      <li>
                        Ставка участвует в аукционе только после подтверждения в приложении. При
                        ошибке сумма не учитывается.
                      </li>
                      <li>
                        Побеждает участник с самой высокой принятой ставкой на момент окончания.
                        Продления времени нет.
                      </li>
                      <li>
                        В учебном прототипе отмена ставок, оплата и юридическое оформление не
                        предусмотрены.
                      </li>
                    </ol>
                    <p className={s.timezone}>
                      Время указано в вашем часовом поясе:{' '}
                      {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                    </p>
                  </>
                )}
                {tab === 'history' && (
                  <>
                    <div className={s.sectionTitle}>
                      <h2>Принятые ставки</h2>
                      <span>От новых к старым</span>
                    </div>
                    {auction.bids.length === 0 ? (
                      <div className={s.emptyHistory}>
                        <I name="gavel" size={32} />
                        <strong>Первая ставка может стать вашей</strong>
                        <p>
                          {auction.status === 'draft'
                            ? 'Ставки появятся после публикации аукциона.'
                            : auction.status === 'ended'
                              ? 'Аукцион завершился без ставок.'
                              : 'Пока никто не сделал ставку. Начните со стартовой цены.'}
                        </p>
                      </div>
                    ) : (
                      <ol className={s.bidList}>
                        {[...auction.bids].reverse().map((bid, index) => (
                          <li key={bid.id}>
                            <span
                              className={`${s.bidAvatar} ${bid.bidder === 'you' ? s.myAvatar : ''}`}
                            >
                              <I name={index === 0 ? 'gavel' : 'user'} size={17} />
                            </span>
                            <div>
                              <strong>{money(bid.amount)}</strong>
                              <span>
                                {bid.bidder === 'you' ? 'Вы' : bid.bidder}
                                {index === 0 ? ' · Лучшая ставка' : ''}
                              </span>
                            </div>
                            <time dateTime={new Date(bid.time).toISOString()}>
                              {time(bid.time)}
                            </time>
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </div>
            </section>

            <section className={s.explainer}>
              <div className={s.explainerIcon}>
                <I name="gavel" size={26} />
              </div>
              <div>
                <span className={s.smallLabel}>ПРОЗРАЧНО. ПО ШАГАМ.</span>
                <h2>
                  Новая возможность.
                  <br />
                  Знакомый Циан.
                </h2>
                <p>
                  Собственник задаёт условия, покупатели предлагают свою цену. Все ставки — в одном
                  месте.
                </p>
                <button onClick={openHelp}>
                  Как устроен аукцион <I name="arrow" size={17} />
                </button>
              </div>
              <span className={s.explainerGraphic} aria-hidden="true">
                <I name="gavel" size={100} />
              </span>
            </section>
          </div>

          <aside
            className={s.auctionColumn}
            aria-label={role === 'seller' ? 'Управление аукционом' : 'Участие в аукционе'}
          >
            <section ref={cardRef} className={`${c.card} ${s.auctionCard}`}>
              <div className={s.cardTop}>
                <span className={s.auctionBadge}>
                  <I name="gavel" size={14} />
                  Аукцион
                </span>
                <span className={s.cardRole}>
                  {role === 'seller' ? 'Для продавца' : 'Для покупателя'}
                </span>
              </div>

              {role === 'seller' && auction.status === 'draft' && (
                <>
                  <div
                    className={s.sellerSteps}
                    aria-label={`Шаг ${sellerStep === 'conditions' ? 1 : 2} из 3`}
                  >
                    <span className={s.stepActive}>
                      <b>{sellerStep === 'review' ? <I name="check" size={12} /> : '1'}</b>Условия
                    </span>
                    <span className={s.stepLine} />
                    <span className={sellerStep === 'review' ? s.stepActive : ''}>
                      <b>2</b>Проверка
                    </span>
                    <span className={s.stepLine} />
                    <span>
                      <b>3</b>Старт
                    </span>
                  </div>
                  <h2 ref={titleRef} tabIndex={-1} className={s.cardTitle}>
                    {sellerStep === 'conditions' ? (
                      <>
                        Ваша квартира.
                        <br />
                        Ваши условия.
                      </>
                    ) : (
                      'Всё верно? Публикуем.'
                    )}
                  </h2>
                  <p className={s.cardDescription}>
                    {sellerStep === 'conditions'
                      ? 'Задайте стартовую цену и дайте покупателям предложить больше.'
                      : 'После публикации условия нельзя изменить. Проверьте их ещё раз.'}
                  </p>
                  {sellerStep === 'conditions' ? (
                    <form className={s.sellerForm} onSubmit={review} noValidate>
                      <Input
                        label="Стартовая цена, ₽"
                        inputMode="numeric"
                        value={startPrice}
                        onChange={(e) => {
                          setStartPrice(e.target.value);
                          setFormError('');
                        }}
                        onBlur={() => {
                          const price = parseMoney(startPrice);
                          if (Number.isFinite(price)) setStartPrice(digits(price));
                        }}
                        error={formError}
                        hint="От этой суммы начнутся торги"
                      />
                      <Select
                        label="Минимальный шаг ставки"
                        value={step}
                        onChange={(e) => setStep(e.target.value)}
                        options={[
                          { value: '25000', label: '25 000 ₽' },
                          { value: '50000', label: '50 000 ₽' },
                          { value: '100000', label: '100 000 ₽' },
                        ]}
                      />
                      <Select
                        label="Длительность аукциона"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        options={[
                          { value: '1', label: '1 день с момента публикации' },
                          { value: '3', label: '3 дня с момента публикации' },
                          { value: '7', label: '7 дней с момента публикации' },
                        ]}
                      />
                      <div className={s.infoNote}>
                        <I name="info" size={18} />
                        <p>Побеждает самая высокая ставка. Условия фиксируются при публикации.</p>
                      </div>
                      <Button type="submit" fullWidth size="L" className={s.primaryButton}>
                        Проверить условия <I name="arrow" size={18} />
                      </Button>
                    </form>
                  ) : (
                    <div className={s.review}>
                      <Terms auction={{ ...auction, ...reviewTerms }} />
                      <div className={s.reviewObject}>
                        <I name="home" size={19} />
                        <div>
                          <strong>2-комн. квартира, 64 м²</strong>
                          <span>Ходынский бульвар, 2</span>
                        </div>
                      </div>
                      <Checkbox
                        checked={agreed}
                        disabled={publishing}
                        onChange={(e) => setAgreed(e.target.checked)}
                        label="Подтверждаю условия аукциона"
                      />
                      <Button
                        fullWidth
                        size="L"
                        className={s.primaryButton}
                        loading={publishing}
                        disabled={!agreed}
                        onClick={() => setPublishing(true)}
                      >
                        {publishing ? 'Публикуем аукцион…' : 'Опубликовать аукцион'}
                      </Button>
                      <button
                        className={s.textButton}
                        disabled={publishing}
                        onClick={() => setSellerStep('conditions')}
                      >
                        <I name="back" size={16} />
                        Изменить условия
                      </button>
                    </div>
                  )}
                </>
              )}

              {role === 'seller' && auction.status !== 'draft' && (
                <>
                  <div
                    className={`${s.resultIcon} ${auction.status === 'ended' ? s.resultMuted : ''}`}
                  >
                    <I name={auction.status === 'live' ? 'check' : 'gavel'} size={28} />
                  </div>
                  <h2 ref={titleRef} tabIndex={-1} className={s.cardTitle}>
                    {auction.status === 'live' ? 'Аукцион опубликован' : 'Аукцион завершён'}
                  </h2>
                  <p className={s.cardDescription}>
                    {auction.status === 'live'
                      ? 'Покупатели уже могут предложить свою цену. Все ставки появятся здесь.'
                      : auction.bids.length
                        ? 'Приём ставок окончен. Итоги доступны вам и участникам.'
                        : 'За время аукциона ставок не поступило. Можно создать новый аукцион.'}
                  </p>
                  <div className={s.priceBlock}>
                    <span>
                      {auction.bids.length
                        ? auction.status === 'ended'
                          ? 'Итоговая цена'
                          : 'Лучшая ставка'
                        : 'Стартовая цена'}
                    </span>
                    <strong>{money(current)}</strong>
                  </div>
                  {auction.status === 'live' && <Countdown endsAt={auction.endsAt} now={now} />}
                  <div className={s.auctionStats}>
                    <span>
                      <I name="user" size={16} />
                      {activeParticipants} участников
                    </span>
                    <span>
                      <I name="gavel" size={16} />
                      {auction.bids.length} ставок
                    </span>
                  </div>
                  <Terms auction={auction} />
                  <Button
                    fullWidth
                    size="L"
                    className={s.primaryButton}
                    onClick={() => changeRole('buyer')}
                  >
                    Посмотреть как покупатель <I name="arrow" size={17} />
                  </Button>
                  {auction.status === 'ended' && (
                    <button className={s.textButton} onClick={() => openReset('draft')}>
                      Создать новый аукцион
                    </button>
                  )}
                </>
              )}

              {role === 'buyer' && auction.status === 'draft' && (
                <>
                  <div className={`${s.resultIcon} ${s.resultMuted}`}>
                    <I name="clock" size={28} />
                  </div>
                  <h2 className={s.cardTitle}>Скоро на аукционе</h2>
                  <p className={s.cardDescription}>
                    Собственник ещё настраивает условия. Ставки можно будет делать после публикации.
                  </p>
                  <div className={s.priceBlock}>
                    <span>Ориентировочная стартовая цена</span>
                    <strong>{money(auction.startPrice)}</strong>
                  </div>
                  <Button fullWidth size="L" disabled>
                    Аукцион ещё не начался
                  </Button>
                  <button className={s.textButton} onClick={() => changeRole('seller')}>
                    Перейти к настройке как продавец <I name="arrow" size={16} />
                  </button>
                </>
              )}

              {role === 'buyer' && auction.status !== 'draft' && (
                <>
                  <div className={s.buyerStatus}>
                    <span className={live ? s.liveDot : s.staticDot} />
                    {live ? 'Принимаем ставки' : 'Приём ставок окончен'}
                  </div>
                  <div className={s.priceBlock}>
                    <span>
                      {auction.status === 'ended'
                        ? auction.bids.length
                          ? 'Победившая ставка'
                          : 'Стартовая цена'
                        : auction.bids.length
                          ? 'Текущая ставка'
                          : 'Стартовая цена'}
                    </span>
                    <strong>{money(current)}</strong>
                    {auction.bids.length > 0 && (
                      <small>Стартовали с {money(auction.startPrice)}</small>
                    )}
                  </div>
                  {live && <Countdown endsAt={auction.endsAt} now={now} />}
                  <div className={s.auctionStats}>
                    <span>
                      <I name="user" size={16} />
                      {activeParticipants} участников
                    </span>
                    <button onClick={() => showTab('history')}>
                      <I name="gavel" size={16} />
                      {auction.bids.length} ставок <I name="chevron" size={12} />
                    </button>
                  </div>

                  <div aria-live="polite" aria-atomic="true">
                    {request.status === 'pending' && (
                      <div className={`${s.notice} ${s.noticeBlue}`} role="status">
                        <Spinner size={21} />
                        <div>
                          <strong>Отправляем вашу ставку</strong>
                          <p>
                            {money(request.amount)} · Ожидаем подтверждения. Пока ставка не учтена.
                          </p>
                        </div>
                      </div>
                    )}
                    {request.status === 'error' && request.kind !== 'low' && (
                      <div className={`${s.notice} ${s.noticeError}`} role="alert">
                        <I name="info" />
                        <div>
                          <strong>
                            {request.kind === 'network'
                              ? 'Ставка не отправлена'
                              : 'Ставка не принята'}
                          </strong>
                          <p>{request.message}</p>
                          {request.kind === 'network' && live && (
                            <button onClick={() => sendBid(request.amount)}>
                              Попробовать ещё раз <I name="refresh" size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {auction.status === 'ended' ? (
                      <div
                        className={`${s.notice} ${leading ? s.noticeGreen : s.noticeNeutral}`}
                        role="status"
                      >
                        <I name={leading ? 'check' : 'gavel'} />
                        <div>
                          <strong>
                            {leading
                              ? 'Ваша ставка победила!'
                              : auction.bids.length
                                ? 'Аукцион завершён'
                                : 'Аукцион завершён без ставок'}
                          </strong>
                          <p>
                            {leading
                              ? `Итоговая ставка — ${money(current)}. Спасибо за участие!`
                              : ownBid
                                ? `Победила ставка ${money(current)} другого участника. Ваша ставка — ${money(ownBid.amount)}.`
                                : auction.bids.length
                                  ? `Лучшая принятая ставка — ${money(current)}.`
                                  : 'Никто не принял участие. Новые ставки больше не принимаются.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      ownBid &&
                      !pending && (
                        <div
                          className={`${s.notice} ${leading ? s.noticeGreen : s.noticeAmber}`}
                          role="status"
                        >
                          <I name={leading ? 'check' : 'info'} />
                          <div>
                            <strong>
                              {leading ? 'Ваша ставка лидирует' : 'Вашу ставку перебили'}
                            </strong>
                            <p>
                              {leading
                                ? `${money(ownBid.amount)} приняты. Следите за ходом аукциона.`
                                : `Ваша ставка — ${money(ownBid.amount)}. Предложите больше, чтобы снова стать первым.`}
                            </p>
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {live ? (
                    <form
                      className={s.bidForm}
                      onSubmit={(event) => {
                        event.preventDefault();
                        startBid();
                      }}
                      noValidate
                    >
                      <div className={s.bidLabel}>
                        <label htmlFor="bid-amount">Ваша ставка, ₽</label>
                        <span>Шаг {money(auction.bidStep)}</span>
                      </div>
                      <div
                        className={`${s.bidControl} ${bidError || request.kind === 'low' ? s.bidInvalid : ''}`}
                      >
                        <button
                          type="button"
                          disabled={pending || parseMoney(bidValue) <= minimum}
                          aria-label="Уменьшить ставку на один шаг"
                          onClick={() => {
                            setBidValue(
                              digits(Math.max(minimum, parseMoney(bidValue) - auction.bidStep)),
                            );
                            setBidError('');
                            dispatch({ type: 'clear-request' });
                          }}
                        >
                          <I name="minus" size={17} />
                        </button>
                        <input
                          id="bid-amount"
                          inputMode="numeric"
                          value={bidValue}
                          disabled={pending}
                          aria-invalid={!!(bidError || request.kind === 'low')}
                          aria-describedby="bid-hint"
                          onChange={(e) => {
                            setBidValue(e.target.value);
                            setBidError('');
                            dispatch({ type: 'clear-request' });
                          }}
                        />
                        <button
                          type="button"
                          disabled={pending}
                          aria-label="Увеличить ставку на один шаг"
                          onClick={() => {
                            setBidValue(
                              digits(
                                (Number.isFinite(parseMoney(bidValue))
                                  ? parseMoney(bidValue)
                                  : minimum) + auction.bidStep,
                              ),
                            );
                            setBidError('');
                            dispatch({ type: 'clear-request' });
                          }}
                        >
                          <I name="plus" size={17} />
                        </button>
                      </div>
                      <p
                        id="bid-hint"
                        className={bidError || request.kind === 'low' ? s.inputError : s.inputHint}
                      >
                        {bidError ||
                          (request.kind === 'low' ? request.message : `Минимум ${money(minimum)}`)}
                      </p>
                      <Button
                        type="submit"
                        fullWidth
                        size="L"
                        className={s.primaryButton}
                        loading={pending}
                      >
                        {pending ? 'Ожидаем подтверждения…' : 'Сделать ставку'}
                        {!pending && <I name="arrow" size={18} />}
                      </Button>
                      <p className={s.bidTerms}>
                        Ставка участвует только после подтверждения.
                        <br />
                        <button type="button" onClick={() => showTab('terms')}>
                          Изучить условия аукциона
                        </button>
                      </p>
                    </form>
                  ) : (
                    <Button fullWidth size="L" disabled>
                      Аукцион завершён
                    </Button>
                  )}
                </>
              )}
              <div className={s.cardFoot}>
                <I name="shield" size={17} />
                <span>Открытые условия. Видимая история ставок.</span>
              </div>
            </section>
            <div className={s.sideNote}>
              <I name="info" size={18} />
              <p>
                Это учебный аукцион. Все цены и условия условные. Оплаты и оформления сделки здесь
                нет.
              </p>
            </div>
          </aside>
        </div>

        <details className={s.demoPanel}>
          <summary>
            <span>
              <I name="sliders" size={18} />
              <strong>Режим практики</strong>
              <span>Проверить состояния и начать заново</span>
            </span>
            <I name="chevron" size={17} />
          </summary>
          <div className={s.demoContent}>
            <p>Действия ниже моделируют события и меняют только учебный аукцион в этом браузере.</p>
            <div className={s.demoActions}>
              <button onClick={() => openReset('example')} disabled={pending || publishing}>
                <I name="spark" size={16} />
                Готовый пример со ставками
              </button>
              <button
                onClick={() => dispatch({ type: 'outbid', now: Date.now() })}
                disabled={!live}
              >
                <I name="plus" size={16} />
                Ставка другого участника
              </button>
              <button onClick={() => dispatch({ type: 'finish' })} disabled={!live || publishing}>
                <I name="clock" size={16} />
                Завершить аукцион
              </button>
              <button onClick={() => openReset('draft')} disabled={pending || publishing}>
                <I name="refresh" size={16} />
                Начать заново
              </button>
            </div>
            <Checkbox
              label="Смоделировать ошибку следующей отправки ставки"
              checked={failNext}
              disabled={!live || pending}
              onChange={(event) => setFailNext(event.target.checked)}
            />
            <p className={s.demoHint}>
              Чтобы увидеть ошибку суммы, введите ставку ниже минимальной. После отправки ожидание
              длится 1,6 секунды.
            </p>
          </div>
        </details>
        {storageError && (
          <p className={s.storageWarning} role="status">
            Браузер не разрешил сохранить демо. После обновления страницы прогресс будет потерян.
          </p>
        )}
      </main>

      {!preview && <AuctionFooter />}

      <Modal
        preview={preview}
        open={confirmBid !== null}
        title="Подтвердите ставку"
        onClose={closeBid}
      >
        <div className={s.confirmBody}>
          <span className={s.smallLabel}>ВАШЕ ПРЕДЛОЖЕНИЕ</span>
          <strong className={s.confirmPrice}>{money(confirmBid ?? minimum)}</strong>
          <p>
            2-комн. квартира, 64 м²
            <br />
            Москва, Ходынский бульвар, 2
          </p>
          <div className={s.infoNote}>
            <I name="info" size={18} />
            <p>
              Ставка станет видна в истории после принятия. В рамках учебного аукциона отменить её
              нельзя.
            </p>
          </div>
          <p className={s.inputHint}>
            Подтверждая ставку, вы принимаете условия аукциона. Оплата и оформление сделки не
            предусмотрены.
          </p>
          <Button
            fullWidth
            size="L"
            className={s.primaryButton}
            disabled={!live || pending}
            onClick={() => sendBid(confirmBid ?? minimum)}
          >
            Подтвердить ставку
          </Button>
          {!live && (
            <p role="alert" className={s.inputError}>
              Аукцион завершён. Ставки больше не принимаются.
            </p>
          )}
        </div>
      </Modal>

      <AuctionHelp preview={preview} open={help} onClose={closeHelp} />

      <Modal
        preview={preview}
        open={gallery}
        title={`Квартира · Фото ${photo + 1} из 3`}
        onClose={closeGallery}
      >
        <div className={s.galleryModal}>
          <img src={photos[photo].src} alt={photos[photo].alt} />
          <div>
            <button
              disabled={photo === 0}
              onClick={() => setPhoto(photo - 1)}
              aria-label="Предыдущее фото"
            >
              <I name="back" />
            </button>
            <span>{photo + 1} / 3</span>
            <button
              disabled={photo === 2}
              onClick={() => setPhoto(photo + 1)}
              aria-label="Следующее фото"
            >
              <I name="arrow" />
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        preview={preview}
        open={reset !== null}
        title={reset === 'example' ? 'Открыть готовый пример?' : 'Начать новый аукцион?'}
        onClose={closeReset}
      >
        <div className={s.confirmBody}>
          <p>
            Текущие учебные условия и ставки будут заменены{' '}
            {reset === 'example'
              ? 'примером с тремя ставками. Вы перейдёте в роль покупателя.'
              : initialRole === 'buyer'
                ? 'аукционом до старта. Ставки будут доступны после публикации.'
                : 'новым черновиком. Вы перейдёте в роль продавца.'}
          </p>
          <Button fullWidth className={s.primaryButton} onClick={() => resetDemo(reset ?? 'draft')}>
            {reset === 'example'
              ? 'Открыть пример'
              : initialRole === 'buyer'
                ? 'Открыть аукцион до старта'
                : 'Создать новый черновик'}
          </Button>
          <button className={s.textButton} onClick={closeReset}>
            Оставить текущий аукцион
          </button>
        </div>
      </Modal>
    </div>
  );
}
