import {
  auctionReducer,
  createDraft,
  initialState,
  readAuction,
  type AuctionState,
} from '../model';
import {
  defaultSession,
  initialSellerState,
  readSellerSession,
  type SellerState,
} from '../sellerModel';

export const PREVIEW_NOW = Date.UTC(2026, 10, 23, 10);

export function sellerPreview(id: string): SellerState {
  const state = initialSellerState(defaultSession());
  if (['review', 'pending', 'error'].includes(id)) state.session.stage = 'review';
  if (id === 'invalid') {
    state.session.draft.priceInput = '0';
    state.priceError = 'Введите положительную цену целыми рублями, без букв и дробной части.';
  }
  if (id === 'pending' || id === 'error') {
    state.agreed = true;
    state.request = id === 'pending' ? 'pending' : 'error';
  }
  if (['published', 'listing', 'ended', 'listing_ended'].includes(id)) {
    const ended = id.includes('ended');
    const startedAt = PREVIEW_NOW - (ended ? 4 : 1) * 86_400_000;
    state.session.stage = 'published';
    state.session.publication = {
      id: 'preview-auction',
      startPrice: 13_500_000,
      bidStep: 50_000,
      durationDays: 3,
      startedAt,
      endsAt: startedAt + 3 * 86_400_000,
    };
  }
  return state;
}

export function buyerPreview(id: string): AuctionState {
  let state = auctionReducer(initialState(createDraft(PREVIEW_NOW)), {
    type: 'example',
    now: PREVIEW_NOW,
  });
  if (id === 'not_started') return initialState(createDraft(PREVIEW_NOW));
  if (['leading', 'outbid', 'won', 'lost'].includes(id)) {
    state = {
      ...state,
      auction: {
        ...state.auction,
        bids: [
          ...state.auction.bids,
          { id: 'own-preview', bidder: 'you', amount: 14_300_000, time: PREVIEW_NOW - 60_000 },
        ],
      },
    };
  }
  if (id === 'outbid' || id === 'lost')
    state = auctionReducer(state, { type: 'outbid', now: PREVIEW_NOW });
  if (id === 'empty') state = { ...state, auction: { ...state.auction, bids: [] } };
  if (['won', 'lost', 'ended', 'empty', 'closed'].includes(id))
    state = auctionReducer(state, { type: 'finish' });
  if (id === 'pending') state.request = { status: 'pending', amount: 14_300_000, fail: false };
  if (id === 'error')
    state.request = {
      status: 'error',
      amount: 14_300_000,
      fail: false,
      kind: 'network',
      message:
        'Не удалось отправить ставку. Она не учтена. Проверьте соединение и попробуйте ещё раз.',
    };
  if (id === 'closed')
    state.request = {
      status: 'error',
      amount: 14_300_000,
      fail: false,
      kind: 'closed',
      message: 'Аукцион завершился до подтверждения. Ваша ставка не была учтена.',
    };
  return state;
}

export function readBuyerState(): AuctionState {
  const saved = readAuction();
  const publication = readSellerSession().publication;
  // Both roles work with the conditions published by the seller.
  if (publication && saved.publishedAt !== publication.startedAt) {
    return initialState({
      version: 1,
      status: publication.endsAt <= Date.now() ? 'ended' : 'live',
      startPrice: publication.startPrice,
      bidStep: publication.bidStep,
      endsAt: publication.endsAt,
      publishedAt: publication.startedAt,
      bids: [],
    });
  }
  return saved.status === 'draft'
    ? auctionReducer(initialState(saved), { type: 'example', now: Date.now() })
    : initialState(saved);
}
