export const SELLER_STORAGE_KEY = 'cian-auction-seller-v1';
export const DAY_MS = 86_400_000;
export const BID_STEPS = [25_000, 50_000, 100_000] as const;
export const DURATIONS = [1, 3, 7] as const;
export const AUCTION_TIME_ZONE = 'Asia/Novosibirsk';

export interface SellerDraft {
  priceInput: string;
  bidStep: number;
  durationDays: number;
}

export interface Publication {
  id: string;
  startPrice: number;
  bidStep: number;
  durationDays: number;
  startedAt: number;
  endsAt: number;
}

export interface SellerSession {
  version: 1;
  draft: SellerDraft;
  stage: 'conditions' | 'review' | 'published';
  publication: Publication | null;
}

export interface SellerState {
  session: SellerSession;
  agreed: boolean;
  priceError: string;
  request: 'idle' | 'pending' | 'error';
  failRequest: boolean;
}

export type SellerAction =
  | { type: 'edit'; draft: SellerDraft }
  | { type: 'review' }
  | { type: 'back' }
  | { type: 'agree'; value: boolean }
  | { type: 'publish'; fail: boolean }
  | { type: 'resolve'; now: number }
  | { type: 'reset' };

export function parsePrice(value: string): number {
  const clean = value.replace(/[ \u00a0\u202f]/g, '');
  return /^\d+$/.test(clean) && Number.isSafeInteger(Number(clean)) ? Number(clean) : NaN;
}

export function validatePrice(value: string) {
  if (!value.trim()) return 'Укажите стартовую цену квартиры.';
  const price = parsePrice(value);
  if (!Number.isSafeInteger(price) || price <= 0) {
    return 'Введите положительную цену целыми рублями, без букв и дробной части.';
  }
  return '';
}

export const formatNumber = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
export const formatPrice = (value: number) => `${formatNumber(value)} ₽`;
export const durationLabel = (value: number) =>
  `${value} ${value === 1 ? 'день' : value === 3 ? 'дня' : 'дней'}`;
export const formatAuctionDate = (value: number) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: AUCTION_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);

export function defaultSession(): SellerSession {
  return {
    version: 1,
    draft: { priceInput: '13 500 000', bidStep: 50_000, durationDays: 3 },
    stage: 'conditions',
    publication: null,
  };
}

function validDraft(value: unknown): value is SellerDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as SellerDraft;
  return (
    typeof d.priceInput === 'string' &&
    d.priceInput.length <= 200 &&
    BID_STEPS.some((step) => step === d.bidStep) &&
    DURATIONS.some((days) => days === d.durationDays)
  );
}

function validPublication(value: unknown, draft: SellerDraft): value is Publication {
  if (!value || typeof value !== 'object') return false;
  const p = value as Publication;
  return (
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    Number.isSafeInteger(p.startPrice) &&
    p.startPrice > 0 &&
    p.startPrice === parsePrice(draft.priceInput) &&
    p.bidStep === draft.bidStep &&
    p.durationDays === draft.durationDays &&
    Number.isSafeInteger(p.startedAt) &&
    p.startedAt > 0 &&
    Number.isSafeInteger(p.endsAt) &&
    p.endsAt < 8_640_000_000_000_000 &&
    p.endsAt === p.startedAt + p.durationDays * DAY_MS
  );
}

export function readSellerSession(): SellerSession {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SELLER_STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return defaultSession();
    const saved = raw as SellerSession;
    if (
      saved.version !== 1 ||
      !validDraft(saved.draft) ||
      !['conditions', 'review', 'published'].includes(saved.stage)
    )
      return defaultSession();
    if (saved.stage === 'published') {
      return validPublication(saved.publication, saved.draft) ? saved : defaultSession();
    }
    return {
      version: 1,
      draft: saved.draft,
      publication: null,
      stage:
        saved.stage === 'review' && !validatePrice(saved.draft.priceInput)
          ? 'review'
          : 'conditions',
    };
  } catch {
    return defaultSession();
  }
}

export function initialSellerState(session = readSellerSession()): SellerState {
  return { session, agreed: false, priceError: '', request: 'idle', failRequest: false };
}

export function sellerReducer(state: SellerState, action: SellerAction): SellerState {
  const { session } = state;
  if (state.request === 'pending' && action.type !== 'resolve') return state;
  switch (action.type) {
    case 'edit':
      if (session.publication || !validDraft(action.draft)) return state;
      return {
        ...state,
        session: { ...session, draft: action.draft, stage: 'conditions' },
        agreed: false,
        priceError: '',
        request: 'idle',
      };
    case 'review': {
      if (session.publication) return state;
      const priceError = validatePrice(session.draft.priceInput);
      if (priceError) return { ...state, priceError };
      return {
        ...state,
        session: { ...session, stage: 'review' },
        agreed: false,
        priceError: '',
        request: 'idle',
      };
    }
    case 'back':
      return session.publication
        ? state
        : {
            ...state,
            session: { ...session, stage: 'conditions' },
            agreed: false,
            request: 'idle',
          };
    case 'agree':
      return { ...state, agreed: action.value };
    case 'publish':
      if (
        session.publication ||
        session.stage !== 'review' ||
        !state.agreed ||
        validatePrice(session.draft.priceInput)
      )
        return state;
      return { ...state, request: 'pending', failRequest: action.fail };
    case 'resolve': {
      if (state.request !== 'pending') return state;
      if (state.failRequest) return { ...state, request: 'error', failRequest: false };
      const { draft } = session;
      const publication: Publication = {
        id: `auction-${action.now}`,
        startPrice: parsePrice(draft.priceInput),
        bidStep: draft.bidStep,
        durationDays: draft.durationDays,
        startedAt: action.now,
        endsAt: action.now + draft.durationDays * DAY_MS,
      };
      return {
        ...state,
        session: { ...session, stage: 'published', publication },
        request: 'idle',
        failRequest: false,
      };
    }
    case 'reset':
      return initialSellerState(defaultSession());
    default:
      return state;
  }
}
