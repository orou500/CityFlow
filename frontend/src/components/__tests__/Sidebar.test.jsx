import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import Sidebar from '../Sidebar';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key ?? '',
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: () => ({
    user: {
      role: 'user',
      displayName: 'Test',
      username: 'test',
      balance: 1234,
      level: 4,
      avatar: null,
      cosmetics: {},
    },
    logout: vi.fn(),
  }),
}));

vi.mock('../../store/useGameStore', () => ({
  useGameStore: (selector) => selector({ unreadCount: 0, fetchUnreadCount: vi.fn() }),
}));

vi.mock('../ThemeProvider', () => ({
  useTheme: () => ({ preference: 'light', setPreference: vi.fn() }),
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000/api',
}));

vi.mock('../UserSearch', () => ({ default: () => null }));
vi.mock('../CompactValue', () => ({ default: () => null }));
vi.mock('../Avatar', () => ({ default: () => null }));
vi.mock('../AudioPlayer', () => ({ default: () => null }));

function renderSidebar(collapsed = false) {
  return render(
    <MemoryRouter>
      <Sidebar collapsed={collapsed} onToggleCollapse={() => {}} />
    </MemoryRouter>,
  );
}

describe('Sidebar — iOS/Android standalone safe-area handling', () => {
  beforeEach(() => {
    document.body.dir = 'ltr';
  });

  afterEach(() => {
    document.body.dir = '';
  });

  it('floating mobile menu button keeps its position but is additive to the top safe-area', () => {
    renderSidebar();
    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(button.className).toContain('lg:hidden');
    expect(button.className).toContain('fixed');
    expect(button.className).toContain('top-[calc(0.75rem+env(safe-area-inset-top,0px))]');
    expect(button.className).toContain('start-3');
  });

  it('mobile menu button does not grow an arbitrary fixed top margin', () => {
    renderSidebar();
    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(button.className).not.toMatch(/top-\[\d+px\]/);
    expect(button.className).not.toMatch(/top-\[4[0-9]px|5[0-9]px/);
  });

  it('sidebar drawer stays fixed full-height and adds safe-area padding to the top', () => {
    const { container } = renderSidebar();
    const aside = container.querySelector('aside');
    expect(aside).toBeInTheDocument();
    expect(aside.className).toContain('fixed');
    expect(aside.className).toContain('inset-y-0');
    expect(aside.className).toContain('left-0');
    expect(aside.className).toContain('pt-[env(safe-area-inset-top,0px)]');
    expect(aside.className).not.toContain('overflow-x');
  });

  it('collapsed desktop sidebar still applies the same safe-area top padding', () => {
    const { container } = renderSidebar(true);
    const aside = container.querySelector('aside');
    expect(aside.className).toContain('pt-[env(safe-area-inset-top,0px)]');
    expect(aside.className).toContain('w-16');
  });

  it('safe-area geometry is direction-independent (RTL keeps start-3 and left-0)', () => {
    document.body.dir = 'rtl';
    const { container } = renderSidebar();
    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(button.className).toContain('start-3');
    expect(button.className).toContain('top-[calc(0.75rem+env(safe-area-inset-top,0px))]');
    const aside = container.querySelector('aside');
    expect(aside.className).toContain('left-0');
    expect(aside.className).toContain('pt-[env(safe-area-inset-top,0px)]');
  });
});
