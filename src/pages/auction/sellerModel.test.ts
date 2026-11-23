import { beforeEach, describe, expect, it } from 'vitest';
import {
  DAY_MS,
  defaultSession,
  initialSellerState,
  readSellerSession,
  SELLER_STORAGE_KEY,
  sellerReducer as reduce,
  validatePrice,
} from './sellerModel';

const now = Date.UTC(2026, 10, 23, 10);
function ready() {
  return reduce(reduce(initialSellerState(defaultSession()), { type: 'review' }), {
    type: 'agree',
    value: true,
  });
}

describe('seller auction model', () => {
  beforeEach(() => localStorage.clear());

  it('accepts positive whole rubles and rejects empty, negative, fractional and unsafe values', () => {
    for (const value of ['', ' ', '0', '-1', '123.5', '123,5', 'цена', '1e7', '9007199254740992']) {
      expect(validatePrice(value), value).not.toBe('');
    }
    for (const value of [
      '1',
      '13 500 000',
      '13\u00a0500\u202f000',
      String(Number.MAX_SAFE_INTEGER),
    ]) {
      expect(validatePrice(value), value).toBe('');
    }
  });

  it('retains edited conditions and resets agreement when returning from review', () => {
    let state = ready();
    state = reduce(state, { type: 'back' });
    expect(state.agreed).toBe(false);
    state = reduce(state, {
      type: 'edit',
      draft: { priceInput: '18000000', bidStep: 100_000, durationDays: 7 },
    });
    state = reduce(state, { type: 'review' });
    expect(state.session.draft).toEqual({
      priceInput: '18000000',
      bidStep: 100_000,
      durationDays: 7,
    });
    expect(state.agreed).toBe(false);
  });

  it('requires review and agreement, blocks concurrent edits and publishes once', () => {
    const initial = initialSellerState(defaultSession());
    expect(reduce(initial, { type: 'publish', fail: false })).toBe(initial);
    let state = ready();
    state = reduce(state, { type: 'publish', fail: false });
    expect(state.request).toBe('pending');
    expect(reduce(state, { type: 'publish', fail: false })).toBe(state);
    expect(reduce(state, { type: 'back' })).toBe(state);
    expect(
      reduce(state, { type: 'edit', draft: { priceInput: '1', bidStep: 25000, durationDays: 1 } }),
    ).toBe(state);
    state = reduce(state, { type: 'resolve', now });
    expect(state.session.stage).toBe('published');
    expect(state.session.publication?.endsAt).toBe(now + 3 * DAY_MS);
    expect(state.session.publication?.startedAt).toBe(now);
    expect(reduce(state, { type: 'resolve', now: now + 10 })).toBe(state);
    expect(reduce(state, { type: 'publish', fail: false })).toBe(state);
  });

  it('does not publish on failure and retries with the same terms', () => {
    let state = reduce(ready(), { type: 'publish', fail: true });
    const draft = state.session.draft;
    state = reduce(state, { type: 'resolve', now });
    expect(state.request).toBe('error');
    expect(state.session.publication).toBeNull();
    expect(state.session.draft).toEqual(draft);
    state = reduce(state, { type: 'publish', fail: false });
    state = reduce(state, { type: 'resolve', now: now + 10000 });
    expect(state.session.publication?.endsAt).toBe(now + 10000 + 3 * DAY_MS);
    expect(state.session.draft).toEqual(draft);
  });

  it('restores drafts and review without persisting agreement or in-flight requests', () => {
    const state = reduce(ready(), { type: 'publish', fail: false });
    localStorage.setItem(SELLER_STORAGE_KEY, JSON.stringify(state.session));
    const restored = initialSellerState(readSellerSession());
    expect(restored.session.stage).toBe('review');
    expect(restored.request).toBe('idle');
    expect(restored.agreed).toBe(false);
    expect(restored.session.publication).toBeNull();
  });

  it('restores a published auction and safely ignores corrupted data', () => {
    const state = reduce(reduce(ready(), { type: 'publish', fail: false }), {
      type: 'resolve',
      now,
    });
    localStorage.setItem(SELLER_STORAGE_KEY, JSON.stringify(state.session));
    expect(readSellerSession()).toEqual(state.session);
    localStorage.setItem(SELLER_STORAGE_KEY, '{broken');
    expect(readSellerSession()).toEqual(defaultSession());
    localStorage.setItem(
      SELLER_STORAGE_KEY,
      JSON.stringify({
        ...state.session,
        publication: { ...state.session.publication, endsAt: NaN },
      }),
    );
    expect(readSellerSession()).toEqual(defaultSession());
  });
});
