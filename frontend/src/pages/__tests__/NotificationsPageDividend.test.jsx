import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import i18n from '../../i18n';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useTranslation: () => ({ t: (key, opts) => i18n.t(key, opts), i18n }),
  };
});

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateMock };
});

const authState = vi.hoisted(() => ({ user: { _id: 'u1', username: 'me' } }));

vi.mock('../../store/useAuthStore', () => {
  const hook = () => authState;
  hook.getState = () => authState;
  return { useAuthStore: hook };
});

vi.mock('../../store/useGameStore', () => {
  const gameState = {
    notifications: [],
    notificationPage: 1,
    notificationTotalPages: 1,
    fetchNotifications: vi.fn(),
    fetchUnreadCount: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllRead: vi.fn(),
    deleteNotification: vi.fn(),
  };
  const hook = () => gameState;
  hook.getState = () => gameState;
  return { useGameStore: hook };
});

vi.mock('../../components/Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('../../components/Pagination', () => ({ default: () => null }));

import NotificationsPage from '../NotificationsPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

function makeDividendNotification(overrides = {}) {
  return {
    _id: 'n1',
    type: 'dividend',
    title: 'Dividend received from ABC Corp',
    message: 'You received a $1,250 dividend from ABC Corp.',
    amount: 1250,
    companyName: 'ABC Corp',
    route: '/company/c1',
    entityType: 'company',
    entityId: 'c1',
    read: true,
    priority: 'medium',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(async () => {
  navigateMock.mockReset();
  await i18n.changeLanguage('en');
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('NotificationsPage — dividend notification rendering', () => {
  it('renders the localized dividend text in English with amount and company', async () => {
    const { useGameStore } = await import('../../store/useGameStore');
    useGameStore.getState().notifications = [makeDividendNotification()];
    renderPage();

    await screen.findByText('Dividend Received');
    await screen.findByText('You received a $1,250 dividend from ABC Corp');
  });

  it('renders the localized dividend text in Hebrew', async () => {
    await i18n.changeLanguage('he');
    const { useGameStore } = await import('../../store/useGameStore');
    useGameStore.getState().notifications = [makeDividendNotification()];
    renderPage();

    await screen.findByText('התקבל דיבידנד');
    await screen.findByText('קיבלת דיבידנד בסך $1,250 מחברת ABC Corp');
  });

  it('navigates to the company page when clicked (route metadata)', async () => {
    const { useGameStore } = await import('../../store/useGameStore');
    useGameStore.getState().notifications = [makeDividendNotification()];
    renderPage();

    const item = await screen.findByText('You received a $1,250 dividend from ABC Corp');
    fireEvent.click(item);

    expect(navigateMock).toHaveBeenCalledWith('/company/c1');
  });
});
