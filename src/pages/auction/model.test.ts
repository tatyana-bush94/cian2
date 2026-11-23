import { beforeEach, describe, expect, it } from 'vitest';
import { auctionReducer as reduce, createDraft, DAY, initialState, minimumBid, readAuction, STORAGE_KEY } from './model';

const now = Date.UTC(2026, 10, 23, 10);
function published() {
  return reduce(initialState(createDraft(now)), {
    type: 'publish', now,
    terms: { startPrice: 13_500_000, bidStep: 50_000, endsAt: now + DAY },
  });
}

describe('auction rules', () => {
  beforeEach(() => localStorage.clear());

  it('publishes seller terms and accepts the starting price as the first bid', () => {
    let state = published();
    expect(state.auction.status).toBe('live');
    expect(minimumBid(state.auction)).toBe(13_500_000);
    state = reduce(state, { type: 'submit', amount: 13_500_000, fail: false, now });
    expect(state.request.status).toBe('pending');
    expect(state.auction.bids).toHaveLength(0);
    state = reduce(state, { type: 'resolve', now: now + 1600 });
    expect(state.auction.bids).toHaveLength(1);
    expect(state.auction.bids[0].bidder).toBe('you');
    expect(minimumBid(state.auction)).toBe(13_550_000);
  });

  it('rejects too-low and invalid bids without adding them to history', () => {
    for (const amount of [13_499_999, NaN, -1, 13_500_000.5, Infinity]) {
      const state = reduce(published(), { type: 'submit', amount, fail: false, now });
      expect(state.request.kind).toBe('low');
      expect(state.auction.bids).toHaveLength(0);
    }
  });

  it('does not count a failed request and retries without duplicate bids', () => {
    let state = reduce(published(), { type: 'submit', amount: 13_500_000, fail: true, now });
    state = reduce(state, { type: 'resolve', now: now + 1600 });
    expect(state.request.kind).toBe('network');
    expect(state.auction.bids).toHaveLength(0);
    state = reduce(state, { type: 'submit', amount: 13_500_000, fail: false, now: now + 2000 });
    const pending = state;
    expect(reduce(state, { type: 'submit', amount: 13_600_000, fail: false, now })).toBe(pending);
    state = reduce(state, { type: 'resolve', now: now + 3600 });
    expect(state.auction.bids).toHaveLength(1);
    expect(reduce(state, { type: 'resolve', now: now + 4000 })).toBe(state);
  });

  it('rechecks the minimum if another participant bids while a request is pending', () => {
    let state = reduce(published(), { type: 'submit', amount: 13_500_000, fail: false, now });
    state = reduce(state, { type: 'outbid', now: now + 500 });
    state = reduce(state, { type: 'resolve', now: now + 1600 });
    expect(state.request.kind).toBe('low');
    expect(state.auction.bids).toHaveLength(1);
    expect(state.auction.bids[0].bidder).not.toBe('you');
  });

  it('never accepts a pending or new bid after the auction closes', () => {
    let state = reduce(published(), { type: 'submit', amount: 13_500_000, fail: false, now });
    state = reduce(state, { type: 'expire', now: now + DAY });
    expect(state.auction.status).toBe('ended');
    state = reduce(state, { type: 'resolve', now: now + DAY + 1 });
    expect(state.auction.bids).toHaveLength(0);
    state = reduce(state, { type: 'submit', amount: 20_000_000, fail: false, now: now + DAY + 2 });
    expect(state.request.kind).toBe('closed');
    expect(state.auction.bids).toHaveLength(0);
  });

  it('restores saved progress, expires old auctions and ignores damaged storage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(published().auction));
    expect(readAuction(now).status).toBe('live');
    expect(readAuction(now + DAY).status).toBe('ended');
    localStorage.setItem(STORAGE_KEY, '{broken');
    expect(readAuction(now).status).toBe('draft');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...published().auction, bidStep: -100 }));
    expect(readAuction(now).status).toBe('draft');
  });
});
