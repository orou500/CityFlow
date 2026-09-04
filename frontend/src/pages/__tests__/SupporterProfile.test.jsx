import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import UserProfilePage from '../UserProfilePage';

const authState = vi.hoisted(() => ({
  user: { _id: 'user1', username: 'me', role: 'user', supporter: { badge: 'supporter' } },
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
  'supporterIdentity.title.city_builder': 'City Builder',
  'supporterIdentity.badgeLabel': 'Supporter badge',
  'supporterIdentity.badgeTitle': 'Supporter',
  'supporterIdentity.supporterSince': 'Supporter since',
  'supporterIdentity.customizeProfile': 'Customize Profile',
  'supporterIdentity.supportCityFlow': 'Support CityFlow',
  'profile.changeAvatar': 'Change avatar',
  'profile.joined': 'Joined',
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

const COSMETICS = {
  usernameStyle: { type: 'gradient', color: 'cityflow_cyan', gradient: 'neon', animated: true },
  usernameEffect: 'glow',
  profileBackground: 'neon_metro',
  profileBackgroundEffect: 'animated_gradient',
  profileBorder: 'gold',
  avatarFrame: 'premium_frame',
  badge: 'supporter',
  title: 'city_builder',
};

function renderProfile(userOverrides = {}) {
  const profile = {
    user: {
      _id: 'user1',
      username: 'me',
      displayName: 'Me',
      bio: '',
      level: 1,
      xp: 0,
      cosmetics: COSMETICS,
      supporter: { badge: 'supporter', title: 'Community Supporter' },
      donationStats: { donorSince: '2026-01-01T00:00:00.000Z' },
      ...userOverrides,
    },
    transactions: [],
    properties: [],
  };
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(profile) });
  return render(
    <MemoryRouter initialEntries={['/profile/me']}>
      <Routes>
        <Route path="/profile/:username" element={<UserProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('UserProfilePage supporter cosmetics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the full customized identity card (background, frame, styled name, badge, title)', async () => {
    const { container } = renderProfile();
    await waitFor(() => expect(screen.getAllByText('Me')[0]).toBeInTheDocument());

    // Profile background + border layers render (premium identity card).
    expect(container.querySelector('.si-bg-neon-metro')).toBeTruthy();
    expect(container.querySelector('.si-border-gold')).toBeTruthy();
    // Avatar frame + animated username style render.
    expect(container.querySelector('.si-avatar-premium-frame')).toBeTruthy();
    expect(container.querySelector('.si-username-animated')).toBeTruthy();
    // Cosmetic title + badge render from the identity renderer.
    expect(screen.getByText('City Builder')).toBeInTheDocument();
    const badge = container.querySelector('[data-badge="supporter"]');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('★');
    // No mojibake or replacement characters anywhere on the profile.
    expect(container.textContent).not.toMatch(/[\uFFFD]|â|ð/);
    // "Supporter since" line from donationStats.
    expect(screen.getByText(/Supporter since/)).toBeInTheDocument();
  });

  it('shows Customize Profile CTA to a supporter owner', async () => {
    renderProfile();
    await waitFor(() => expect(screen.getAllByText('Me')[0]).toBeInTheDocument());
    const cta = screen.getByText('Customize Profile');
    expect(cta).toBeInTheDocument();
    expect(cta.closest('a')).toHaveAttribute('href', '/supporter-style');
  });

  it('shows Support CityFlow CTA to a non-supporter owner instead', async () => {
    authState.user = { _id: 'user1', username: 'me', role: 'user', supporter: { badge: 'none' } };
    renderProfile({
      cosmetics: { usernameStyle: { type: 'static', color: 'cityflow_blue' }, avatarFrame: 'none' },
      supporter: { badge: 'none' },
      donationStats: { donorSince: null },
    });
    await waitFor(() => expect(screen.getAllByText('Me')[0]).toBeInTheDocument());
    const cta = screen.getByText('Support CityFlow');
    expect(cta).toBeInTheDocument();
    expect(cta.closest('a')).toHaveAttribute('href', '/donate');
  });

  it('refresh preserves customization (data comes from the server profile doc)', async () => {
    // Two renders = two fetches of the same server doc; both show cosmetics.
    const first = renderProfile();
    await waitFor(() => expect(first.container.querySelector('.si-avatar-premium-frame')).toBeTruthy());
    const second = renderProfile();
    await waitFor(() => expect(second.container.querySelector('.si-avatar-premium-frame')).toBeTruthy());
  });
});
