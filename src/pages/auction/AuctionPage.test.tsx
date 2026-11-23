import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuctionPage } from './AuctionPage';

function openPage() {
  render(<MemoryRouter><AuctionPage /></MemoryRouter>);
}

function publish() {
  fireEvent.click(screen.getByRole('button', { name: /Проверить условия/ }));
  expect(screen.getByRole('heading', { name: 'Всё верно? Публикуем.' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Опубликовать аукцион' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Подтверждаю условия аукциона'));
  fireEvent.click(screen.getByRole('button', { name: 'Опубликовать аукцион' }));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('heading', { name: 'Аукцион опубликован' })).toBeInTheDocument();
}

function bid() {
  fireEvent.click(screen.getByRole('button', { name: 'Сделать ставку' }));
  expect(screen.getByRole('dialog', { name: 'Подтвердите ставку' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить ставку' }));
}

describe('auction user journeys', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('completes seller publication, buyer bid, pending status and final winning result', () => {
    openPage();
    expect(screen.getByRole('button', { name: 'Я продавец' })).toHaveAttribute('aria-pressed', 'true');
    publish();
    fireEvent.click(screen.getByRole('button', { name: /Посмотреть как покупатель/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Условия аукциона' }));
    expect(screen.getByRole('heading', { name: 'Всё об этом аукционе' })).toBeInTheDocument();
    bid();
    expect(screen.getByText('Отправляем вашу ставку')).toBeInTheDocument();
    expect(screen.getByLabelText('Ваша ставка, ₽')).toBeDisabled();
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByText('Ваша ставка лидирует')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Завершить аукцион' }));
    expect(screen.getByText('Ваша ставка победила!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Аукцион завершён' })).toBeDisabled();
  });

  it('validates seller price, returns from review and keeps entered conditions', () => {
    openPage();
    fireEvent.change(screen.getByLabelText('Стартовая цена, ₽'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Проверить условия/ }));
    expect(screen.getByLabelText('Стартовая цена, ₽')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Стартовая цена, ₽'), { target: { value: '15000000' } });
    fireEvent.click(screen.getByRole('button', { name: /Проверить условия/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Изменить условия' }));
    expect(screen.getByLabelText('Стартовая цена, ₽')).toHaveValue('15000000');
  });

  it('handles a low bid, a network error, retry and being outbid', () => {
    openPage();
    publish();
    fireEvent.click(screen.getByRole('button', { name: 'Я покупатель' }));
    fireEvent.change(screen.getByLabelText('Ваша ставка, ₽'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сделать ставку' }));
    expect(screen.getByLabelText('Ваша ставка, ₽')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Ваша ставка, ₽'), { target: { value: '13500000' } });
    fireEvent.click(screen.getByLabelText('Смоделировать ошибку следующей отправки ставки'));
    bid();
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByRole('alert')).toHaveTextContent('Ставка не отправлена');
    fireEvent.click(screen.getByRole('button', { name: /Попробовать ещё раз/ }));
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByText('Ваша ставка лидирует')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ставка другого участника' }));
    expect(screen.getByText('Вашу ставку перебили')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /История ставок/ }));
    expect(screen.getByText('Вы')).toBeInTheDocument();
    expect(screen.getByText(/Участник • 2841/)).toBeInTheDocument();
  });
});
