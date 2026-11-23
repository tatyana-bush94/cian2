import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { METRIKA_COUNTER_ID, trackGoal, readGoals, clearGoals } from '@/analytics/auction';
import { SellerAuctionPage } from '../SellerAuctionPage';
import { AuctionPage } from '../AuctionPage';
import { SELLER_STORAGE_KEY } from '../sellerModel';
import { digits, STORAGE_KEY } from '../model';
import { screens } from './scenario';

const goals = (name: string) =>
  (window.__auctionGoals ?? []).filter((event) => event.goal === name);
const mount = (node: React.ReactNode) =>
  render(
    <StrictMode>
      <MemoryRouter>{node}</MemoryRouter>
    </StrictMode>,
  );
function publish() {
  fireEvent.click(screen.getByRole('button', { name: /Проверить условия/ }));
  fireEvent.click(screen.getByLabelText('Подтверждаю условия аукциона'));
  fireEvent.click(screen.getByRole('button', { name: /Опубликовать аукцион/ }));
}
function bid() {
  fireEvent.click(screen.getByRole('button', { name: 'Сделать ставку' }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить ставку' }));
}

describe('auction analytics and scenario map', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.__auctionGoals = [];
    vi.useFakeTimers();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.ym;
  });

  it('logs one view in StrictMode and never calls a real counter in placeholder mode', () => {
    window.ym = vi.fn();
    mount(<SellerAuctionPage />);
    expect(goals('auction_screen_view')).toHaveLength(1);
    const record = trackGoal('test', { role: 'buyer', step: 2, screen: 'buyer_terms' });
    expect(record.params).toMatchObject({
      role: 'buyer',
      step: 2,
      prototype: true,
      event_id: record.event_id,
    });
    expect(record.params.session_id).toBeTruthy();
    expect(METRIKA_COUNTER_ID).toBe(0);
    expect(window.ym).not.toHaveBeenCalled();
  });

  it('retains the shared tab journal across application reloads and clears it consistently', () => {
    const record = trackGoal('auction_role_switch', {
      role: 'seller',
      step: 1,
      screen: 'seller_conditions',
      target_role: 'buyer',
    });
    delete window.__auctionGoals;
    expect(readGoals()).toEqual([record]);
    clearGoals();
    expect(readGoals()).toEqual([]);
    expect(window.__auctionGoals).toEqual([]);
  });

  it('joins publication results to attempts; retry has a new id and restored success is not a new conversion', () => {
    const page = mount(<SellerAuctionPage />);
    fireEvent.click(screen.getByLabelText('Смоделировать ошибку следующей публикации'));
    publish();
    expect(goals('auction_publish_success')).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1200));
    expect(goals('auction_publish_error')[0].params.attempt_id).toBe(
      goals('auction_publish_submit')[0].params.attempt_id,
    );
    fireEvent.click(screen.getByRole('button', { name: /Попробовать ещё раз/ }));
    act(() => vi.advanceTimersByTime(1200));
    const submits = goals('auction_publish_submit');
    expect(submits).toHaveLength(2);
    expect(submits[1].params.attempt_id).not.toBe(submits[0].params.attempt_id);
    expect(goals('auction_publish_success')).toHaveLength(1);
    expect(goals('auction_publish_success')[0].params.attempt_id).toBe(
      submits[1].params.attempt_id,
    );
    expect(goals('auction_publish_success')[0].params.auction_id).toBeTruthy();
    page.unmount();
    mount(<SellerAuctionPage />);
    expect(goals('auction_publish_success')).toHaveLength(1);
  });

  it('shares the published conditions and auction id between roles', () => {
    render(
      <MemoryRouter initialEntries={['/auction/app']}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Стартовая цена, ₽'), { target: { value: '17000000' } });
    publish();
    act(() => vi.advanceTimersByTime(1200));
    const publication = goals('auction_publish_success')[0];
    fireEvent.click(screen.getByRole('button', { name: 'Я покупатель' }));
    expect(screen.getByLabelText('Ваша ставка, ₽')).toHaveValue(digits(17_000_000));
    expect(goals('auction_screen_view').at(-1)?.params).toMatchObject({
      role: 'buyer',
      screen: 'buyer_listing',
      auction_id: publication.params.auction_id,
    });
    bid();
    expect(goals('auction_bid_success')).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1600));
    expect(goals('auction_bid_success')).toHaveLength(1);
    expect(goals('auction_bid_cancel')).toHaveLength(0);
    expect(goals('auction_bid_success')[0].params.auction_id).toBe(publication.params.auction_id);
    expect(goals('auction_bid_success')[0].params.attempt_id).toBe(
      goals('auction_bid_submit')[0].params.attempt_id,
    );
  });

  it('tracks invalid bid, network failure, retry, outbid and final outcome', () => {
    mount(<AuctionPage initialRole="buyer" />);
    fireEvent.change(screen.getByLabelText('Ваша ставка, ₽'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сделать ставку' }));
    expect(goals('auction_validation_error')[0].params.result).toBe('low');
    expect(goals('auction_bid_submit')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Ваша ставка, ₽'), { target: { value: '14300000' } });
    fireEvent.click(screen.getByLabelText('Смоделировать ошибку следующей отправки ставки'));
    bid();
    act(() => vi.advanceTimersByTime(1600));
    expect(goals('auction_bid_error')[0].params.result).toBe('network');
    expect(goals('auction_bid_success')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Попробовать ещё раз/ }));
    act(() => vi.advanceTimersByTime(1600));
    expect(goals('auction_bid_submit')[1].params.source).toBe('retry');
    expect(goals('auction_bid_submit')[0].params.attempt_id).not.toBe(
      goals('auction_bid_submit')[1].params.attempt_id,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ставка другого участника' }));
    expect(goals('auction_outbid')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Завершить аукцион' }));
    expect(goals('auction_result_view')[0].params.result).toBe('lost');
  });

  it('does not count a bid closed while pending as an accepted bid', () => {
    mount(<AuctionPage initialRole="buyer" />);
    bid();
    fireEvent.click(screen.getByRole('button', { name: 'Завершить аукцион' }));
    act(() => vi.advanceTimersByTime(1600));
    expect(goals('auction_bid_error')).toHaveLength(1);
    expect(goals('auction_bid_error')[0].params.result).toBe('closed');
    expect(goals('auction_bid_success')).toHaveLength(0);
  });

  it('keeps the buyer role when opening an auction before publication', () => {
    mount(<AuctionPage initialRole="buyer" />);
    fireEvent.click(screen.getByRole('button', { name: 'Начать заново' }));
    expect(goals('auction_screen_view').at(-1)?.params.screen).toBe('buyer_reset_draft');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть аукцион до старта' }));
    expect(screen.getByRole('heading', { name: 'Скоро на аукционе' })).toBeInTheDocument();
    expect(goals('auction_screen_view').at(-1)?.params).toMatchObject({
      role: 'buyer',
      screen: 'buyer_not_started',
    });
    expect(goals('auction_reset_cancel')).toHaveLength(0);
  });

  it('all 30 map previews are isolated from telemetry and persisted drafts', () => {
    localStorage.setItem(SELLER_STORAGE_KEY, 'sentinel-seller');
    localStorage.setItem(STORAGE_KEY, 'sentinel-buyer');
    for (const state of screens) {
      const id = state.id.slice(state.role.length + 1);
      const page = mount(
        state.role === 'seller' ? (
          <SellerAuctionPage previewScreen={id} />
        ) : (
          <AuctionPage initialRole="buyer" previewScreen={id} />
        ),
      );
      act(() => vi.advanceTimersByTime(2000));
      page.unmount();
    }
    expect(window.__auctionGoals).toEqual([]);
    expect(localStorage.getItem(SELLER_STORAGE_KEY)).toBe('sentinel-seller');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('sentinel-buyer');
  });

  it('opens the map by its own route and filters the transition register', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Весь сценарий/ })).toBeInTheDocument();
    expect(screen.getAllByTitle(/Миниатюра:/)).toHaveLength(30);
    expect(screen.getByRole('link', { name: 'Пройти за продавца ↗' })).toHaveAttribute(
      'href',
      '/auction',
    );
    expect(screen.getByRole('link', { name: 'Пройти за покупателя ↗' })).toHaveAttribute(
      'href',
      '/auction/buyer',
    );
    expect(screen.getByRole('link', { name: 'покупатель ↗' })).toHaveAttribute(
      'href',
      '/auction/buyer/app',
    );
    fireEvent.change(screen.getByLabelText('Поиск события'), {
      target: { value: 'auction_publish_error' },
    });
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Что считаем успехом' })).toBeInTheDocument();
  });
});
