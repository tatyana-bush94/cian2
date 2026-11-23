export const STORAGE_KEY = 'cian-auction-demo-v1';
export const DAY = 86_400_000;

export interface Bid {
  id: string;
  amount: number;
  bidder: string;
  time: number;
}

export interface Auction {
  version: 1;
  status: 'draft' | 'live' | 'ended';
  startPrice: number;
  bidStep: number;
  endsAt: number;
  publishedAt: number | null;
  bids: Bid[];
}

export interface Request {
  status: 'idle' | 'pending' | 'success' | 'error';
  amount: number;
  fail: boolean;
  kind?: 'low' | 'network' | 'closed';
  message?: string;
}

export interface AuctionState {
  auction: Auction;
  request: Request;
}

export type AuctionAction =
  | { type: 'publish'; terms: Pick<Auction, 'startPrice' | 'bidStep' | 'endsAt'>; now: number }
  | { type: 'submit'; amount: number; fail: boolean; now: number }
  | { type: 'resolve'; now: number }
  | { type: 'expire'; now: number }
  | { type: 'finish' }
  | { type: 'outbid'; now: number }
  | { type: 'example'; now: number }
  | { type: 'reset'; now: number }
  | { type: 'clear-request' };

const idleRequest = (): Request => ({ status: 'idle', amount: 0, fail: false });

export const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
export const digits = (value: number) => new Intl.NumberFormat('ru-RU').format(value);

export function parseMoney(value: string) {
  const clean = value.replace(/[\s\u00a0\u202f]/g, '');
  return /^\d+$/.test(clean) && Number.isSafeInteger(Number(clean)) ? Number(clean) : NaN;
}

export function createDraft(now = Date.now()): Auction {
  return {
    version: 1,
    status: 'draft',
    startPrice: 13_500_000,
    bidStep: 50_000,
    endsAt: now + 3 * DAY,
    publishedAt: null,
    bids: [],
  };
}

export function currentPrice(auction: Auction) {
  return auction.bids.at(-1)?.amount ?? auction.startPrice;
}

export function minimumBid(auction: Auction) {
  return auction.bids.length ? currentPrice(auction) + auction.bidStep : auction.startPrice;
}

export function canBid(auction: Auction, now: number) {
  return auction.status === 'live' && now < auction.endsAt;
}

export function readAuction(now = Date.now()): Auction {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return createDraft(now);
    const a = saved as Auction;
    if (
      a.version !== 1 ||
      !['draft', 'live', 'ended'].includes(a.status) ||
      !Number.isSafeInteger(a.startPrice) || a.startPrice < 1_000_000 || a.startPrice > 1_000_000_000_000 ||
      ![25_000, 50_000, 100_000].includes(a.bidStep) ||
      !Number.isFinite(a.endsAt) || a.endsAt <= 0 || a.endsAt > 8_640_000_000_000_000 ||
      (a.publishedAt !== null && !Number.isFinite(a.publishedAt)) ||
      !Array.isArray(a.bids) ||
      !a.bids.every((bid, index) =>
        bid && typeof bid.id === 'string' && typeof bid.bidder === 'string' &&
        Number.isSafeInteger(bid.amount) && Number.isFinite(bid.time) &&
        bid.amount >= (index === 0 ? a.startPrice : a.bids[index - 1].amount + a.bidStep),
      )
    ) return createDraft(now);
    return a.status === 'live' && a.endsAt <= now ? { ...a, status: 'ended' } : a;
  } catch {
    return createDraft(now);
  }
}

export function initialState(auction: Auction): AuctionState {
  return { auction, request: idleRequest() };
}

function bidError(auction: Auction, amount: number, now: number): Request | null {
  if (!canBid(auction, now)) {
    return { status: 'error', amount, fail: false, kind: 'closed', message: 'Аукцион завершён. Новые ставки больше не принимаются.' };
  }
  if (!Number.isSafeInteger(amount) || amount < minimumBid(auction)) {
    return { status: 'error', amount, fail: false, kind: 'low', message: `Минимальная ставка — ${money(minimumBid(auction))}. Увеличьте сумму.` };
  }
  return null;
}

export function auctionReducer(state: AuctionState, action: AuctionAction): AuctionState {
  const { auction, request } = state;
  switch (action.type) {
    case 'publish':
      if (auction.status !== 'draft' || action.terms.endsAt <= action.now) return state;
      return initialState({ ...auction, ...action.terms, status: 'live', publishedAt: action.now, bids: [] });
    case 'submit': {
      if (request.status === 'pending') return state;
      const error = bidError(auction, action.amount, action.now);
      return { ...state, request: error ?? { status: 'pending', amount: action.amount, fail: action.fail } };
    }
    case 'resolve': {
      if (request.status !== 'pending') return state;
      const error = bidError(auction, request.amount, action.now);
      if (error) return { ...state, request: error };
      if (request.fail) return { ...state, request: { ...request, status: 'error', kind: 'network', message: 'Не удалось отправить ставку. Она не учтена. Проверьте соединение и попробуйте ещё раз.' } };
      return {
        auction: { ...auction, bids: [...auction.bids, { id: `you-${action.now}`, amount: request.amount, bidder: 'you', time: action.now }] },
        request: { ...request, status: 'success', fail: false },
      };
    }
    case 'expire':
      if (auction.status !== 'live' || auction.endsAt > action.now) return state;
      return auctionReducer(state, { type: 'finish' });
    case 'finish':
      if (auction.status !== 'live') return state;
      return {
        auction: { ...auction, status: 'ended' },
        request: request.status === 'pending'
          ? { ...request, status: 'error', kind: 'closed', message: 'Аукцион завершился до подтверждения. Ваша ставка не была учтена.' }
          : idleRequest(),
      };
    case 'outbid':
      if (!canBid(auction, action.now)) return state;
      return {
        ...state,
        auction: { ...auction, bids: [...auction.bids, { id: `demo-${action.now}`, bidder: 'Участник • 2841', amount: minimumBid(auction), time: action.now }] },
      };
    case 'example':
      return initialState({
        ...createDraft(action.now), status: 'live', publishedAt: action.now - DAY,
        bids: [
          { id: 'example-1', bidder: 'Участник • 1703', amount: 14_150_000, time: action.now - 1_800_000 },
          { id: 'example-2', bidder: 'Участник • 8102', amount: 14_200_000, time: action.now - 900_000 },
          { id: 'example-3', bidder: 'Участник • 2841', amount: 14_250_000, time: action.now - 300_000 },
        ],
      });
    case 'reset': return initialState(createDraft(action.now));
    case 'clear-request': return request.status === 'pending' ? state : { ...state, request: idleRequest() };
    default: return state;
  }
}
