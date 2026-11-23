import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { ROLE_MESSAGE } from './roleNavigation';

describe('iPhone presentation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('shows the working application inside a separate mobile viewport', () => {
    render(
      <MemoryRouter initialEntries={['/auction']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTitle('Мобильное приложение Циан — сценарий продавца')).toHaveAttribute(
      'src',
      '/auction/app',
    );
    expect(screen.getByRole('link', { name: 'Открыть без рамки' })).toHaveAttribute(
      'href',
      '/auction/app',
    );
  });

  it('opens the direct application without nesting another phone frame', () => {
    render(
      <MemoryRouter initialEntries={['/auction/app']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Начнём с ваших условий' })).toBeInTheDocument();
    expect(
      screen.queryByTitle('Мобильное приложение Циан — сценарий продавца'),
    ).not.toBeInTheDocument();
  });

  it('keeps one phone frame when changing roles and updates the fullscreen link', () => {
    render(
      <MemoryRouter initialEntries={['/auction']}>
        <App />
      </MemoryRouter>,
    );
    const frame = screen.getByTitle(
      'Мобильное приложение Циан — сценарий продавца',
    ) as HTMLIFrameElement;
    fireEvent(
      window,
      new MessageEvent('message', {
        origin: window.location.origin,
        source: frame.contentWindow,
        data: { type: ROLE_MESSAGE, role: 'buyer' },
      }),
    );
    expect(screen.getByTitle('Мобильное приложение Циан — сценарий покупателя')).toHaveAttribute(
      'src',
      '/auction/buyer/app',
    );
    expect(screen.getByRole('link', { name: 'Открыть без рамки' })).toHaveAttribute(
      'href',
      '/auction/buyer/app',
    );
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    fireEvent(
      window,
      new MessageEvent('message', {
        origin: window.location.origin,
        source: frame.contentWindow,
        data: { type: ROLE_MESSAGE, role: 'seller' },
      }),
    );
    expect(screen.getByTitle('Мобильное приложение Циан — сценарий продавца')).toHaveAttribute(
      'src',
      '/auction/app',
    );
  });

  it('ignores role messages from outside the application frame', () => {
    render(
      <MemoryRouter initialEntries={['/auction']}>
        <App />
      </MemoryRouter>,
    );
    fireEvent(
      window,
      new MessageEvent('message', {
        origin: window.location.origin,
        source: window,
        data: { type: ROLE_MESSAGE, role: 'buyer' },
      }),
    );
    expect(screen.getByTitle('Мобильное приложение Циан — сценарий продавца')).toHaveAttribute(
      'src',
      '/auction/app',
    );
  });

  it('switches direct applications both ways without losing the draft or accepted bid', () => {
    vi.useFakeTimers();
    try {
      render(
        <MemoryRouter initialEntries={['/auction/app']}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.change(screen.getByLabelText('Стартовая цена, ₽'), {
        target: { value: '17000000' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Я покупатель' }));
      expect(screen.getByRole('button', { name: 'Я покупатель' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(within(screen.getByRole('banner')).getByAltText('Циан')).toHaveAttribute(
        'src',
        '/images/cian-logo.svg',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Сделать ставку' }));
      fireEvent.click(screen.getByRole('button', { name: 'Подтвердить ставку' }));
      expect(screen.getByRole('button', { name: 'Я продавец' })).toBeDisabled();
      act(() => vi.advanceTimersByTime(1600));
      expect(screen.getByText('Ваша ставка лидирует')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Я продавец' }));
      expect(screen.getByRole('button', { name: 'Я продавец' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByLabelText('Стартовая цена, ₽')).toHaveValue('17000000');
      fireEvent.click(screen.getByRole('button', { name: 'Я покупатель' }));
      expect(screen.getByText('Ваша ставка лидирует')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
