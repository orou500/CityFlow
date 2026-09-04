import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import Navbar from '../Navbar';

const languageState = vi.hoisted(() => ({ language: 'en' }));

const tFn = vi.hoisted(() => (key, options = {}) => {
  if (key === 'nav.newNotifications' || key === 'nav.newNotifications_one') return `${options.count ?? ''} new`;
  return key;
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tFn, i18n: languageState }),
}));

const authState = vi.hoisted(() => ({
  user: null,
  logout: vi.fn(),
}));
vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector) => (selector ? selector(authState) : authState),
}));

const gameState = vi.hoisted(() => ({
  unreadCount: 0,
  fetchUnreadCount: vi.fn().mockResolvedValue(undefined),
  removeNotification: vi.fn(),
}));
vi.mock('../../store/useGameStore', () => ({
  useGameStore: (selector) => selector(gameState),
}));

vi.mock('../../store/useLeaderboardStore', () => ({
  useLeaderboardStore: { getState: () => ({ fetchSummary: vi.fn(), fetchEvents: vi.fn() }) },
}));

vi.mock('../ThemeProvider', () => ({
  useTheme: () => ({ preference: 'dark', setPreference: vi.fn() }),
}));

vi.mock('../Toast', () => ({
  useToast: () => ({ checkForNewNotifications: vi.fn() }),
}));

vi.mock('../UserSearch', () => ({ default: () => null }));

vi.mock('../hooks/useSocket', () => ({
  useSocketEvent: () => undefined,
}));

vi.mock('../../utils/capacitor', () => ({
  isNativePlatform: () => false,
  isAndroid: () => false,
  isIOS: () => false,
  isWeb: () => true,
  getApiBaseUrl: () => 'http://test/api',
  getUploadsBaseUrl: () => 'http://test/uploads',
  getAvatarUrl: (p) => (p ? `http://test/${p}` : ''),
  loadToken: async () => 'test-token',
  saveToken: async () => undefined,
}));

vi.mock('../../assets/logo-text.png', () => ({ default: 'logo.png' }));

const BASE_COSMETICS = {
  usernameStyle: { type: 'static', color: 'cityflow_blue', gradient: 'cityflow_ocean', animated: false },
  usernameEffect: 'none',
  profileBackground: 'none',
  profileBackgroundEffect: 'none',
  profileBorder: 'none',
  avatarFrame: 'none',
  badge: 'supporter',
  title: 'supporter',
};

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );
}

describe('Navbar notification indicator vs supporter cosmetics', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unread: 0 }) });
    localStorage.setItem('token', 'test-token');
    authState.user = {
      _id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      avatar: '',
      cosmetics: { ...BASE_COSMETICS },
      supporter: { badge: 'supporter' },
    };
    gameState.unreadCount = 3;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const badgeQuery = (container) => container.querySelector('[class*="animate-badge-glow"]');

  it('A: static blue username — notification pulse stays visible', async () => {
    const { container, getAllByLabelText } = renderNavbar();
    await waitFor(() => expect(badgeQuery(container)).toBeTruthy());
    const badge = badgeQuery(container);
    expect(badge).toHaveClass('animate-badge-glow');
    expect(badge.textContent).toBe('3');
    // Both the bell badge and the avatar badge carry the accessible label.
    expect(getAllByLabelText('3 new').length).toBeGreaterThanOrEqual(2);
  });

  it('B: animated gradient username — notification pulse stays visible', async () => {
    authState.user.cosmetics.usernameStyle = {
      type: 'gradient',
      color: 'cityflow_cyan',
      gradient: 'neon',
      animated: true,
    };
    const { container } = renderNavbar();
    await waitFor(() => expect(badgeQuery(container)).toBeTruthy());
    expect(badgeQuery(container)).toHaveClass('animate-badge-glow');
  });

  it('C: strong username glow — notification pulse stays visible', async () => {
    authState.user.cosmetics.usernameEffect = 'glow';
    const { container } = renderNavbar();
    await waitFor(() => expect(badgeQuery(container)).toBeTruthy());
    expect(badgeQuery(container)).toHaveClass('animate-badge-glow');
  });

  it('D: animated avatar frame — notification pulse stays visible', async () => {
    authState.user.cosmetics.avatarFrame = 'animated_ring';
    const { container } = renderNavbar();
    await waitFor(() => expect(badgeQuery(container)).toBeTruthy());
    expect(badgeQuery(container)).toHaveClass('animate-badge-glow');
    // Frame and badge are separate DOM elements (never the same node).
    const frame = container.querySelector('.si-avatar-animated-ring');
    expect(frame).toBeTruthy();
    expect(frame).not.toBe(badgeQuery(container));
  });

  it('E: custom profile background cosmetics — notification pulse stays visible', async () => {
    authState.user.cosmetics.profileBackground = 'neon_metro';
    authState.user.cosmetics.profileBackgroundEffect = 'animated_gradient';
    const { container } = renderNavbar();
    await waitFor(() => expect(badgeQuery(container)).toBeTruthy());
    expect(badgeQuery(container)).toHaveClass('animate-badge-glow');
  });

  it('F: mobile width — notification pulse remains rendered', async () => {
    window.innerWidth = 390;
    const { container } = renderNavbar();
    await waitFor(() => expect(badgeQuery(container)).toBeTruthy());
    expect(badgeQuery(container)).toHaveClass('animate-badge-glow');
    window.innerWidth = 1024;
  });

  it('reduced motion — badge stays visible (static, no animation classes required)', async () => {
    authState.user.cosmetics.usernameStyle = { ...BASE_COSMETICS.usernameStyle, animated: true };
    authState.user.cosmetics.usernameEffect = 'shimmer';
    const { container } = renderNavbar();
    await waitFor(() => expect(badgeQuery(container)).toBeTruthy());
    const badge = badgeQuery(container);
    // The badge element itself remains (it must never depend on animation).
    expect(badge.textContent).toBe('3');
    expect(badge.getAttribute('aria-label')).toBeTruthy();
  });

  it('no badge at all when unread count is zero', async () => {
    gameState.unreadCount = 0;
    const { container } = renderNavbar();
    await waitFor(() => expect(container.querySelector('[class*="animate-badge-glow"]')).toBeNull());
  });
});
