import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import UserProfilePage from '../UserProfilePage';

const authState = vi.hoisted(() => ({
  user: { _id: 'user1', username: 'me', role: 'user' },
  token: 'test-token',
}));

const gameState = vi.hoisted(() => ({
  fetchPlayerSeasonHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: Object.assign((selector) => (selector ? selector(authState) : authState), {
    getState: () => authState,
  }),
  __esModule: true,
}));

vi.mock('../../store/useGameStore', () => ({
  useGameStore: Object.assign((selector) => (selector ? selector(gameState) : gameState), {
    getState: () => gameState,
  }),
  __esModule: true,
}));

const translations = vi.hoisted(() => ({
  'profile.sizopsWelcome': 'SizOps Welcome',
  'profile.seasonReward': 'Season Reward',
  'profile.login': 'Login',
  'transaction.type.sizops_welcome': 'SIZOPS WELCOME BONUS',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => translations[key] || key, i18n: { language: 'en' } }),
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000/api',
  getAvatarUrl: () => '',
}));

vi.mock('../../hooks/useNativeAvatarUrl', () => ({
  default: () => '',
}));

vi.mock('../../components/PropertyImage', () => ({
  default: () => null,
}));

vi.mock('../../components/CompactValue', () => ({
  default: () => null,
}));

function renderProfile(transactions) {
  const profile = {
    user: { _id: 'user1', username: 'me', displayName: '', bio: '', level: 1, xp: 0 },
    transactions,
  };
  global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve(profile) });
  return render(
    <MemoryRouter initialEntries={['/profile/me']}>
      <Routes>
        <Route path="/profile/:username" element={<UserProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('UserProfilePage transaction labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a proper label for sizops_welcome transactions instead of the raw type', async () => {
    renderProfile([
      { _id: 'tx1', type: 'sizops_welcome', price: 100000 },
      { _id: 'tx2', type: 'login', price: 0 },
    ]);

    await waitFor(() => expect(screen.getByText('SizOps Welcome')).toBeInTheDocument());
    expect(screen.queryByText('sizops_welcome')).not.toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('renders a proper label for season_reward transactions', async () => {
    renderProfile([{ _id: 'tx1', type: 'season_reward', price: 50000 }]);

    await waitFor(() => expect(screen.getByText('Season Reward')).toBeInTheDocument());
    expect(screen.queryByText('season_reward')).not.toBeInTheDocument();
  });

  it('renders the amounts of both E2E-style reward transactions', async () => {
    renderProfile([
      { _id: 'tx1', type: 'sizops_welcome', price: 100000 },
      { _id: 'tx2', type: 'sizops_welcome', price: 100000 },
    ]);

    await waitFor(() => expect(screen.getAllByText('SizOps Welcome')).toHaveLength(2));
  });
});
