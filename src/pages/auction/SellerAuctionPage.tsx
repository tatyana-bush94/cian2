import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { newEventId, restartFlow, trackGoal, useScreenGoal } from '@/analytics/auction';
import { PREVIEW_NOW, sellerPreview } from './map/preview';
import { Badge, Button, Checkbox, Input, Modal, Select } from '@/ui';
import { AuctionIcon as I } from './AuctionIcon';
import {
  BID_STEPS,
  DURATIONS,
  durationLabel,
  formatAuctionDate,
  formatNumber,
  formatPrice,
  initialSellerState,
  parsePrice,
  SELLER_STORAGE_KEY,
  sellerReducer,
  validatePrice,
  type SellerDraft,
} from './sellerModel';
import s from './SellerAuctionPage.module.css';

const steps = ['Условия', 'Проверка', 'Публикация'];

export function SellerAuctionPage({ previewScreen }: { previewScreen?: string }) {
  const preview = !!previewScreen;
  const [state, dispatch] = useReducer(sellerReducer, undefined, () =>
    previewScreen ? sellerPreview(previewScreen) : initialSellerState(),
  );
  const { session, request, agreed, priceError } = state;
  const { draft, publication, stage } = session;
  const pending = request === 'pending';
  const [help, setHelp] = useState(previewScreen === 'help');
  const [showListing, setShowListing] = useState(
    previewScreen === 'listing' || previewScreen === 'listing_ended',
  );
  const [failNext, setFailNext] = useState(false);
  const [resetOpen, setResetOpen] = useState(previewScreen === 'reset');
  const [storageError, setStorageError] = useState(false);
  const [now, setNow] = useState(() => (preview ? PREVIEW_NOW : Date.now()));
  const heading = useRef<HTMLHeadingElement>(null);
  const priceInput = useRef<HTMLDivElement>(null);
  const stepIndex = stage === 'conditions' ? 0 : stage === 'review' ? 1 : 2;
  const ended = publication !== null && publication.endsAt <= now;
  const price = parsePrice(draft.priceInput);

  useEffect(() => {
    if (preview) return;
    document.title = 'Продажа на аукционе · Циан';
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    try {
      localStorage.setItem(SELLER_STORAGE_KEY, JSON.stringify(session));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [session, preview]);

  useEffect(() => {
    if (!pending || preview) return;
    const timer = window.setTimeout(() => dispatch({ type: 'resolve', now: Date.now() }), 1200);
    return () => window.clearTimeout(timer);
  }, [pending, preview]);

  useEffect(() => {
    if (preview) return;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [stage, showListing, preview]);

  useEffect(() => {
    if (!preview && priceError) priceInput.current?.querySelector('input')?.focus();
  }, [priceError, preview]);

  useEffect(() => {
    if (!publication || preview) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [publication, preview]);

  const screen = `seller_${help ? 'help' : resetOpen ? 'reset' : pending ? 'pending' : request === 'error' ? 'error' : priceError ? 'invalid' : showListing ? (ended ? 'listing_ended' : 'listing') : stage === 'published' && ended ? 'ended' : stage}`;
  const analyticsStep =
    stage === 'conditions'
      ? 1
      : stage === 'review' && !pending && request !== 'error'
        ? 2
        : showListing
          ? 4
          : 3;
  useScreenGoal('seller', screen, analyticsStep, preview, publication?.id);
  const attemptId = useRef('');
  const previousRequest = useRef(request);
  const wasEnded = useRef(ended);
  useEffect(() => {
    if (!preview && previousRequest.current === 'pending' && request !== 'pending') {
      trackGoal(request === 'error' ? 'auction_publish_error' : 'auction_publish_success', {
        role: 'seller',
        step: 3,
        screen,
        attempt_id: attemptId.current,
        auction_id: publication?.id,
        result: request === 'error' ? 'network' : 'success',
      });
    }
    previousRequest.current = request;
    if (!preview && !wasEnded.current && ended) {
      trackGoal('auction_expired', {
        role: 'seller',
        step: analyticsStep,
        screen,
        auction_id: publication?.id,
      });
    }
    wasEnded.current = ended;
  }, [request, screen, publication, ended, analyticsStep, preview]);

  function goal(
    name: string,
    extra: { source?: string; result?: string; target_role?: 'buyer' | 'seller' } = {},
  ) {
    if (!preview) trackGoal(name, { role: 'seller', step: analyticsStep, screen, ...extra });
  }
  function closeHelp() {
    goal('auction_help_close');
    setHelp(false);
  }
  function closeReset() {
    goal('auction_reset_cancel');
    setResetOpen(false);
  }

  function updateDraft(update: Partial<SellerDraft>) {
    dispatch({ type: 'edit', draft: { ...draft, ...update } });
  }

  function review(event: FormEvent) {
    event.preventDefault();
    goal(validatePrice(draft.priceInput) ? 'auction_validation_error' : 'auction_review', {
      result: validatePrice(draft.priceInput) ? 'price' : 'valid',
    });
    dispatch({ type: 'review' });
  }

  function publish() {
    if (!agreed || pending) return;
    attemptId.current = newEventId();
    if (!preview)
      trackGoal('auction_publish_submit', {
        role: 'seller',
        step: 3,
        screen,
        attempt_id: attemptId.current,
        source: request === 'error' ? 'retry' : 'review',
      });
    dispatch({ type: 'publish', fail: failNext });
    setFailNext(false);
  }

  function reset() {
    goal('auction_reset');
    if (!preview) restartFlow('seller');
    dispatch({ type: 'reset' });
    setShowListing(false);
    setFailNext(false);
    setResetOpen(false);
  }

  const title = showListing
    ? 'Ваше объявление'
    : stage === 'conditions'
      ? 'Ваша квартира. Ваши условия.'
      : stage === 'review'
        ? 'Осталось всё проверить.'
        : ended
          ? 'Аукцион завершён'
          : 'Хорошее начало новой истории.';

  const subtitle = showListing
    ? 'Так выглядит опубликованная квартира с условиями аукциона.'
    : stage === 'conditions'
      ? 'Задайте стартовую цену. Покупатели смогут предложить больше.'
      : stage === 'review'
        ? 'Убедитесь, что условия подходят вам, и запустите аукцион.'
        : ended
          ? 'Срок аукциона истёк. Приём новых ставок закрыт.'
          : 'Аукцион запущен — теперь покупатели могут делать ставки.';

  return (
    <div className={`${s.app} ${preview ? s.mapPreview : ''}`}>
      <a href="#seller-main" className="skip-link">
        К содержимому
      </a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <img className={s.logo} src="/images/cian-logo.svg" alt="Циан" width="112" height="28" />
          <span className={s.headerSection}>
            Моё объявление <span>/</span> Аукцион
          </span>
          <button
            className={s.helpButton}
            onClick={() => {
              goal('auction_help_open');
              setHelp(true);
            }}
          >
            <I name="info" size={17} />
            <span>Как это работает</span>
          </button>
          <span className={s.avatar} aria-label="Профиль Татьяны">
            Т
          </span>
        </div>
      </header>

      <main id="seller-main" className={s.main}>
        <div className={s.intro}>
          <div>
            <div className={s.eyebrow}>
              <I name="gavel" size={15} />
              ПРОДАЖА НА АУКЦИОНЕ
            </div>
            <h1 ref={heading} tabIndex={-1}>
              {title}
            </h1>
            <p>{subtitle}</p>
          </div>
          <span className={s.sellerLabel}>
            <I name="home" size={16} />
            Вы — продавец
            <Link
              to="/auction/buyer"
              onClick={() => goal('auction_role_switch', { target_role: 'buyer' })}
            >
              Я покупатель ↗
            </Link>
          </span>
        </div>

        <ol className={s.progress} aria-label="Этапы публикации аукциона">
          {steps.map((name, index) => (
            <li
              key={name}
              className={`${index === stepIndex ? s.currentStep : ''} ${index < stepIndex ? s.completedStep : ''}`}
              aria-current={index === stepIndex ? 'step' : undefined}
            >
              <span>{index < stepIndex ? <I name="check" size={15} /> : `0${index + 1}`}</span>
              <strong>{name}</strong>
              {index === stepIndex && <small>{index === 2 ? 'Готово' : 'Сейчас'}</small>}
            </li>
          ))}
        </ol>

        <div className={s.columns}>
          <section className={s.property} aria-label="Выбранная квартира">
            <div className={s.propertyPhoto}>
              <img
                src="/images/auction-living-room.jpg"
                alt="Светлая гостиная с большими окнами в учебной квартире"
                fetchPriority="high"
              />
              <span>
                <I name="home" size={14} />
                Ваше объявление
              </span>
              <div className={s.photoCaption}>
                У каждого дома —<br />
                своя следующая глава.
              </div>
            </div>
            <div className={s.propertyInfo}>
              <div className={s.propertyHeading}>
                <h2>2-комн. квартира, 64 м²</h2>
                <Badge tone="neutral">Собственник</Badge>
              </div>
              <p>Москва, Ходынский бульвар, 2</p>
              <div className={s.propertyMeta}>
                <span>
                  <i />
                  ЦСКА
                </span>
                <span>
                  <I name="walk" size={15} />7 минут пешком
                </span>
                <span>8 из 22 этаж</span>
              </div>
            </div>
            <div className={s.propertyBottom}>
              <I name="shield" size={19} />
              <p>Квартира выбрана. Осталось задать условия, на которых вы готовы начать торги.</p>
            </div>
          </section>

          <section
            className={s.workflow}
            aria-label={
              stage === 'conditions'
                ? 'Настройка аукциона'
                : stage === 'review'
                  ? 'Проверка условий'
                  : 'Опубликованный аукцион'
            }
          >
            <div className={s.workflowTop}>
              <span className={s.auctionLabel}>
                <I name="gavel" size={15} />
                Аукцион
              </span>
              <span>Шаг {stepIndex + 1} из 3</span>
            </div>

            {stage === 'conditions' && (
              <>
                <h2>Начнём с ваших условий</h2>
                <p className={s.description}>Вы задаёте правила. Покупатели предлагают цену.</p>
                <form onSubmit={review} noValidate className={s.form}>
                  <div ref={priceInput}>
                    <Input
                      className={s.priceField}
                      label="Стартовая цена, ₽"
                      inputMode="numeric"
                      autoComplete="off"
                      value={draft.priceInput}
                      maxLength={200}
                      onChange={(event) => updateDraft({ priceInput: event.target.value })}
                      onBlur={() => {
                        if (Number.isSafeInteger(price) && price > 0)
                          updateDraft({ priceInput: formatNumber(price) });
                      }}
                      error={priceError}
                      hint="Минимальная сумма первой ставки"
                    />
                  </div>
                  <div className={s.formRow}>
                    <Select
                      label="Минимальный шаг ставки"
                      value={String(draft.bidStep)}
                      onChange={(event) => updateDraft({ bidStep: Number(event.target.value) })}
                      options={BID_STEPS.map((value) => ({
                        value: String(value),
                        label: formatPrice(value),
                      }))}
                    />
                    <Select
                      label="Длительность"
                      value={String(draft.durationDays)}
                      onChange={(event) =>
                        updateDraft({ durationDays: Number(event.target.value) })
                      }
                      options={DURATIONS.map((value) => ({
                        value: String(value),
                        label: durationLabel(value),
                      }))}
                    />
                  </div>
                  <div className={s.howItWorks}>
                    <span className={s.noteIcon}>
                      <I name="spark" size={20} />
                    </span>
                    <div>
                      <strong>Начните с комфортной цены</strong>
                      <p>
                        Побеждает самая высокая принятая ставка. Аукцион начнётся сразу после
                        публикации.
                      </p>
                    </div>
                  </div>
                  <Button fullWidth size="L" type="submit" className={s.primary}>
                    Проверить условия <I name="arrow" size={18} />
                  </Button>
                  <p className={s.actionHint}>
                    <I name="shield" size={14} />
                    На следующем шаге всё можно проверить и изменить
                  </p>
                </form>
              </>
            )}

            {stage === 'review' && (
              <>
                <h2>Всё верно? Публикуем.</h2>
                <p className={s.description}>После запуска условия будут зафиксированы.</p>
                <div className={s.summaryPrice}>
                  <span>Стартовая цена</span>
                  <strong>{formatPrice(price)}</strong>
                </div>
                <dl className={s.terms}>
                  <div>
                    <dt>Минимальный шаг</dt>
                    <dd>{formatPrice(draft.bidStep)}</dd>
                  </div>
                  <div>
                    <dt>Длительность</dt>
                    <dd>{durationLabel(draft.durationDays)}</dd>
                  </div>
                  <div>
                    <dt>Начало</dt>
                    <dd>Сразу после публикации</dd>
                  </div>
                </dl>
                <div className={s.neutralNote}>
                  <I name="info" size={18} />
                  <p>
                    Срок отсчитывается от успешной публикации. Точная дата завершения появится после
                    запуска.
                  </p>
                </div>
                <div className={s.agreement}>
                  <Checkbox
                    checked={agreed}
                    disabled={pending}
                    onChange={(event) => {
                      goal('auction_agree', {
                        result: event.target.checked ? 'accepted' : 'revoked',
                      });
                      dispatch({ type: 'agree', value: event.target.checked });
                    }}
                    label="Подтверждаю условия аукциона"
                  />
                </div>
                {request === 'error' && (
                  <div className={s.errorNotice} role="alert">
                    <I name="info" size={20} />
                    <div>
                      <strong>Не удалось опубликовать аукцион</strong>
                      <p>
                        Учебное соединение прервалось. Аукцион не запущен, ваши условия сохранены.
                        Попробуйте ещё раз.
                      </p>
                    </div>
                  </div>
                )}
                <div aria-live="polite" aria-atomic="true">
                  {pending && (
                    <p className={s.pendingNotice} role="status">
                      Публикуем аукцион… Дождитесь подтверждения.
                    </p>
                  )}
                </div>
                <Button
                  fullWidth
                  size="L"
                  className={s.primary}
                  loading={pending}
                  disabled={!agreed}
                  onClick={publish}
                >
                  {pending
                    ? 'Публикуем аукцион…'
                    : request === 'error'
                      ? 'Попробовать ещё раз'
                      : 'Опубликовать аукцион'}
                  {!pending && <I name={request === 'error' ? 'refresh' : 'arrow'} size={18} />}
                </Button>
                <Button
                  theme="stroke_secondary"
                  fullWidth
                  size="L"
                  className={s.secondary}
                  disabled={pending}
                  onClick={() => {
                    goal('auction_edit');
                    dispatch({ type: 'back' });
                  }}
                >
                  <I name="back" size={17} />
                  Изменить условия
                </Button>
                <p className={s.actionHint}>
                  <I name="shield" size={14} />
                  Только учебная публикация, без оплаты и обязательств
                </p>
              </>
            )}

            {stage === 'published' && publication && !showListing && (
              <>
                <div className={`${s.successIcon} ${ended ? s.endedIcon : ''}`}>
                  <I name={ended ? 'clock' : 'check'} size={30} />
                </div>
                <Badge tone={ended ? 'neutral' : 'positive'}>
                  {ended ? 'Приём ставок закрыт' : 'Опубликовано'}
                </Badge>
                <h2 className={s.successTitle}>{ended ? 'Аукцион завершён' : 'Аукцион запущен'}</h2>
                <p className={s.description}>
                  {ended
                    ? 'Указанное время истекло. Условия сохранены в объявлении.'
                    : 'Покупатели могут делать ставки. Условия вашего аукциона уже видны в объявлении.'}
                </p>
                <div className={s.publishedPrice}>
                  <span>Стартовая цена</span>
                  <strong>{formatPrice(publication.startPrice)}</strong>
                </div>
                <dl className={s.terms}>
                  <div>
                    <dt>Минимальный шаг</dt>
                    <dd>{formatPrice(publication.bidStep)}</dd>
                  </div>
                  <div>
                    <dt>Длительность</dt>
                    <dd>{durationLabel(publication.durationDays)}</dd>
                  </div>
                  <div>
                    <dt>Начало</dt>
                    <dd>{formatAuctionDate(publication.startedAt)}</dd>
                  </div>
                  <div>
                    <dt>Завершение</dt>
                    <dd>{formatAuctionDate(publication.endsAt)}</dd>
                  </div>
                </dl>
                <p className={s.timezone}>Время Новосибирска · UTC+7</p>
                <Button
                  fullWidth
                  size="L"
                  className={s.primary}
                  onClick={() => {
                    goal('auction_listing_open');
                    setShowListing(true);
                  }}
                >
                  Посмотреть объявление <I name="arrow" size={18} />
                </Button>
              </>
            )}

            {stage === 'published' && publication && showListing && (
              <>
                <div className={s.listingStatus}>
                  <span className={ended ? s.endedDot : s.liveDot} />
                  <strong>{ended ? 'Аукцион завершён' : 'Идёт аукцион'}</strong>
                </div>
                <h2>2-комн. квартира, 64 м²</h2>
                <p className={s.description}>Москва, Ходынский бульвар, 2</p>
                <div className={s.summaryPrice}>
                  <span>Стартовая цена</span>
                  <strong>{formatPrice(publication.startPrice)}</strong>
                </div>
                <dl className={s.terms}>
                  <div>
                    <dt>Минимальный шаг</dt>
                    <dd>{formatPrice(publication.bidStep)}</dd>
                  </div>
                  <div>
                    <dt>Длительность</dt>
                    <dd>{durationLabel(publication.durationDays)}</dd>
                  </div>
                  <div>
                    <dt>Завершение</dt>
                    <dd>{formatAuctionDate(publication.endsAt)}</dd>
                  </div>
                </dl>
                <p className={s.timezone}>Время Новосибирска · UTC+7</p>
                <div className={s.neutralNote}>
                  <I name="info" size={18} />
                  <p>
                    Это просмотр объявления продавцом. Переключитесь в роль покупателя, чтобы пройти
                    учебный сценарий ставки.
                  </p>
                </div>
                <Button
                  theme="stroke_secondary"
                  fullWidth
                  size="L"
                  className={s.secondary}
                  onClick={() => {
                    goal('auction_listing_close');
                    setShowListing(false);
                  }}
                >
                  <I name="back" size={17} />К результату публикации
                </Button>
              </>
            )}
          </section>
        </div>

        <div className={s.trustLine}>
          <span>
            <I name="shield" size={19} />
            Понятные условия
          </span>
          <i />
          <span>
            <I name="clock" size={19} />
            Фиксированный срок
          </span>
          <i />
          <span>
            <I name="gavel" size={19} />
            Открытый аукцион
          </span>
        </div>

        <details className={s.practice}>
          <summary>
            <span>
              <I name="sliders" size={18} />
              <strong>Режим практики</strong>
              <span>Проверить ошибку публикации</span>
            </span>
            <I name="chevron" size={17} />
          </summary>
          <div>
            <p>Действия меняют только учебные данные в этом браузере.</p>
            <Checkbox
              label="Смоделировать ошибку следующей публикации"
              checked={failNext}
              disabled={pending || publication !== null}
              onChange={(event) => setFailNext(event.target.checked)}
            />
            <Button
              size="XS"
              theme="stroke_secondary"
              disabled={pending}
              onClick={() => {
                goal('auction_reset_open');
                setResetOpen(true);
              }}
            >
              Начать заново
            </Button>
          </div>
        </details>
        {storageError && (
          <p className={s.storageWarning} role="status">
            Браузер не разрешил сохранить черновик. Пока страница открыта, можно продолжать; после
            перезагрузки данные будут потеряны.
          </p>
        )}
        <footer className={s.footer}>
          <span>
            <I name="info" size={15} />
            Учебный прототип
          </span>
          <p>Реальной публикации на Циане нет. Оплата и оформление сделки не предусмотрены.</p>
          <Link to="/map">Карта экранов</Link>
          <Link
            to="/auction/buyer"
            onClick={() => goal('auction_role_switch', { target_role: 'buyer' })}
          >
            Я покупатель
          </Link>
          <Link to="/ui-kit">
            UI-kit <I name="arrow" size={14} />
          </Link>
        </footer>
      </main>

      <Modal preview={preview} open={help} title="Как продать на аукционе" onClose={closeHelp}>
        <div className={s.modalContent}>
          <ol>
            <li>
              <strong>Задайте условия.</strong> Укажите стартовую цену, выберите шаг ставки и срок:
              1, 3 или 7 дней.
            </li>
            <li>
              <strong>Проверьте всё.</strong> До публикации можно вернуться и изменить любое
              значение.
            </li>
            <li>
              <strong>Запустите аукцион.</strong> После подтверждения он начнётся сразу. Условия
              больше не редактируются.
            </li>
          </ol>
          <p>
            Побеждает самая высокая принятая ставка к моменту окончания. Это учебный сценарий
            продавца: реальные покупатели, платежи и оформление не подключены.
          </p>
          <Button fullWidth onClick={closeHelp}>
            Понятно
          </Button>
        </div>
      </Modal>
      <Modal preview={preview} open={resetOpen} title="Начать заново?" onClose={closeReset}>
        <div className={s.modalContent}>
          <p>Текущий учебный аукцион будет заменён новым черновиком с начальными условиями.</p>
          <Button fullWidth onClick={reset}>
            Создать новый черновик
          </Button>
          <Button fullWidth theme="stroke_secondary" onClick={closeReset}>
            Оставить текущий аукцион
          </Button>
        </div>
      </Modal>
    </div>
  );
}
