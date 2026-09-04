import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const authState = vi.hoisted(() => ({
  user: { _id: 'u1', username: 'me' },
}));

const navigateMock = vi.hoisted(() => vi.fn());
const markReadMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateMock };
});

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
    markNotificationRead: markReadMock,
    markAllRead: vi.fn(),
    deleteNotification: vi.fn(),
  };
  const hook = () => gameState;
  hook.getState = () => gameState;
  return { useGameStore: hook };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

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

function makeNotification(overrides = {}) {
  return {
    _id: 'n1',
    type: 'system',
    title: 'T',
    message: 'M',
    read: false,
    priority: 'high',
    ...overrides,
  };
}

describe('NotificationsPage navigation', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    markReadMock.mockReset();
  });

  it('navigates to the backend route and merges the tab query without corrupting ?section', async () => {
    const { useGameStore } = await import('../../store/useGameStore');
    useGameStore.getState().notifications = [
      makeNotification({
        route: '/property/p123?section=offers',
        tab: 'offers',
        entityType: 'property',
        entityId: 'p123',
      }),
    ];
    renderPage();
    const item = await screen.findByText('M');
    fireEvent.click(item);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/property/p123?section=offers&tab=offers');
    });
    expect(markReadMock).toHaveBeenCalledWith('n1');
  });

  it('offer notification without a backend route deep-links to the property offers section', async () => {
    const { useGameStore } = await import('../../store/useGameStore');
    useGameStore.getState().notifications = [
      makeNotification({ type: 'property_offer', entityId: 'p456', read: true }),
    ];
    renderPage();
    const item = await screen.findByText('M');
    fireEvent.click(item);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/property/p456?section=offers');
    });
  });

  it('plain route navigation still works (auction notification)', async () => {
    const { useGameStore } = await import('../../store/useGameStore');
    useGameStore.getState().notifications = [
      makeNotification({ route: '/auctions/a1', entityType: 'auction', entityId: 'a1', read: true }),
    ];
    renderPage();
    const item = await screen.findByText('M');
    fireEvent.click(item);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/auctions/a1');
    });
  });

  it('company auction bid proposal deep-links to tab=auctions with proposalId', async () => {
    const { useGameStore } = await import('../../store/useGameStore');
    useGameStore.getState().notifications = [
      makeNotification({
        route: '/real-estate-companies/c1',
        tab: 'auctions',
        proposalId: 'prop1',
        auctionId: 'a1',
        entityType: 'company',
        entityId: 'c1',
        read: true,
      }),
    ];
    renderPage();
    const item = await screen.findByText('M');
    fireEvent.click(item);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/real-estate-companies/c1?tab=auctions&proposalId=prop1');
    });
  });

  it('proposal deep-link preserves existing query params on the route', async () => {
    const { useGameStore } = await import('../../store/useGameStore');
    useGameStore.getState().notifications = [
      makeNotification({
        route: '/real-estate-companies/c1?from=list',
        tab: 'auctions',
        proposalId: 'prop2',
        read: true,
      }),
    ];
    renderPage();
    const item = await screen.findByText('M');
    fireEvent.click(item);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/real-estate-companies/c1?from=list&tab=auctions&proposalId=prop2');
    });
  });

  it('contract notification deep-links to Company → Contracts → Offered sub-view with the contract id', async () => {
    const { useGameStore } = await import('../../store/useGameStore');
    useGameStore.getState().notifications = [
      makeNotification({
        route: '/real-estate-companies/c1',
        tab: 'contracts',
        subTab: 'proposed',
        contractId: 'ct9',
        entityType: 'company',
        entityId: 'c1',
        read: true,
      }),
    ];
    renderPage();
    const item = await screen.findByText('M');
    fireEvent.click(item);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        '/real-estate-companies/c1?tab=contracts&subTab=proposed&contractId=ct9',
      );
    });
  });
});
