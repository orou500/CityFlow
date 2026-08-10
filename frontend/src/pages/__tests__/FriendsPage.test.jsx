import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const authState = vi.hoisted(() => ({
  user: { _id: 'u1', username: 'me', balance: 1000 },
  token: 'test-token',
}));

vi.mock('../../store/useAuthStore', () => {
  const hook = (selector) => selector(authState);
  hook.getState = () => authState;
  return { useAuthStore: hook };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000',
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import FriendsPage from '../../pages/FriendsPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <FriendsPage />
    </MemoryRouter>,
  );
}

describe('FriendsPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url) => {
      if (url.includes('/friends/requests')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ incoming: [], sent: [] }) });
      }
      if (url.includes('/friends')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                _id: 'f1',
                username: 'alice',
                displayName: 'Alice',
                avatar: '',
                balance: 5000,
                propertiesCount: 2,
                netWorth: 100000,
              },
            ]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('renders the friends page without the Link runtime error', async () => {
    renderPage();
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });

  it('renders profile links with the correct href', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /Alice/i });
    expect(link).toHaveAttribute('href', '/profile/alice');
  });

  it('navigates between friends, incoming and sent tabs', async () => {
    renderPage();
    await screen.findByText('Alice');

    fireEvent.click(screen.getByText('friends.tab.incoming'));
    fireEvent.click(screen.getByText('friends.tab.sent'));
    // switching tabs must not throw
    expect(screen.getByText('friends.tab.sent')).toBeInTheDocument();
  });
});
