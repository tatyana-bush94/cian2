import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';

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
});
