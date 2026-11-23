import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellerAuctionPage } from './SellerAuctionPage';
import { DAY_MS, SELLER_STORAGE_KEY } from './sellerModel';

function openPage() {
  return render(
    <MemoryRouter>
      <SellerAuctionPage />
    </MemoryRouter>,
  );
}
function review() {
  fireEvent.click(screen.getByRole('button', { name: /Проверить условия/ }));
}
function agreeAndPublish() {
  fireEvent.click(screen.getByLabelText('Подтверждаю условия аукциона'));
  fireEvent.click(screen.getByRole('button', { name: /Опубликовать аукцион/ }));
}

describe('seller publication journey', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 23, 10));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('completes three screens and opens the listing without buyer bidding controls', () => {
    openPage();
    fireEvent.change(screen.getByLabelText('Стартовая цена, ₽'), { target: { value: '14200000' } });
    fireEvent.change(screen.getByLabelText('Минимальный шаг ставки'), {
      target: { value: '100000' },
    });
    fireEvent.change(screen.getByLabelText('Длительность'), { target: { value: '7' } });
    review();
    expect(screen.getByRole('heading', { name: 'Всё верно? Публикуем.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Опубликовать аукцион/ })).toBeDisabled();
    expect(screen.getByText('7 дней')).toBeInTheDocument();
    agreeAndPublish();
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Публикуем аукцион');
    expect(screen.getByRole('button', { name: 'Изменить условия' })).toBeDisabled();
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole('heading', { name: 'Аукцион запущен' })).toBeInTheDocument();
    expect(screen.getByText('Время Новосибирска · UTC+7')).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(SELLER_STORAGE_KEY)!);
    expect(saved.publication.endsAt - saved.publication.startedAt).toBe(7 * DAY_MS);
    fireEvent.click(screen.getByRole('button', { name: /Посмотреть объявление/ }));
    expect(screen.getByText('Идёт аукцион')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сделать ставку' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /К результату публикации/ }));
    expect(screen.getByRole('heading', { name: 'Аукцион запущен' })).toBeInTheDocument();
  });

  it('focuses the invalid field and preserves all values after editing', () => {
    openPage();
    fireEvent.change(screen.getByLabelText('Стартовая цена, ₽'), { target: { value: '0' } });
    review();
    expect(screen.getByLabelText('Стартовая цена, ₽')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Стартовая цена, ₽')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Стартовая цена, ₽'), { target: { value: '17000000' } });
    fireEvent.change(screen.getByLabelText('Минимальный шаг ставки'), {
      target: { value: '25000' },
    });
    fireEvent.change(screen.getByLabelText('Длительность'), { target: { value: '1' } });
    review();
    fireEvent.click(screen.getByLabelText('Подтверждаю условия аукциона'));
    fireEvent.click(screen.getByRole('button', { name: 'Изменить условия' }));
    expect(screen.getByLabelText('Стартовая цена, ₽')).toHaveValue('17000000');
    expect(screen.getByLabelText('Минимальный шаг ставки')).toHaveValue('25000');
    expect(screen.getByLabelText('Длительность')).toHaveValue('1');
    review();
    expect(screen.getByLabelText('Подтверждаю условия аукциона')).not.toBeChecked();
  });

  it('shows a publication error and retries without losing conditions', () => {
    openPage();
    review();
    fireEvent.click(screen.getByLabelText('Смоделировать ошибку следующей публикации'));
    agreeAndPublish();
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось опубликовать аукцион');
    expect(JSON.parse(localStorage.getItem(SELLER_STORAGE_KEY)!).publication).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Попробовать ещё раз/ }));
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole('heading', { name: 'Аукцион запущен' })).toBeInTheDocument();
  });

  it('restores incomplete input, review, interrupted sending and successful publication', () => {
    let page = openPage();
    fireEvent.change(screen.getByLabelText('Стартовая цена, ₽'), { target: { value: '19000000' } });
    page.unmount();
    page = openPage();
    expect(screen.getByLabelText('Стартовая цена, ₽')).toHaveValue('19000000');
    review();
    agreeAndPublish();
    page.unmount();
    page = openPage();
    expect(screen.getByRole('heading', { name: 'Всё верно? Публикуем.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Подтверждаю условия аукциона')).not.toBeChecked();
    agreeAndPublish();
    act(() => vi.advanceTimersByTime(1200));
    page.unmount();
    openPage();
    expect(screen.getByRole('heading', { name: 'Аукцион запущен' })).toBeInTheDocument();
  });

  it('reports unavailable storage and still allows publication in memory', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    openPage();
    expect(screen.getByText(/Браузер не разрешил сохранить черновик/)).toBeInTheDocument();
    review();
    agreeAndPublish();
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole('heading', { name: 'Аукцион запущен' })).toBeInTheDocument();
  });
});
