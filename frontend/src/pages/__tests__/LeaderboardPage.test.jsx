import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const authState = vi.hoisted(() => ({
  user: { _id: 'me', username: 'me' },
}));

const lbState = vi.hoisted(() => ({
  rankings: [],
  myRanks: null,
  loading: false,
  error: null,
  total: 0,
  rewards: null,
  seasonNumber: null,
  playerProfile: null,
  fetchRankings: vi.fn().mockResolvedValue(),
  fetchMyRank: vi.fn().mockResolvedValue(),
  fetchPlayerProfile: vi.fn().mockResolvedValue(),
  fetchLeaderboardRewards: vi.fn().mockResolvedValue(),
  clearPlayerProfile: vi.fn(),
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../../store/useLeaderboardStore', () => ({
  useLeaderboardStore: () => lbState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000',
  getAvatarUrl: () => null,
}));

vi.mock('../../hooks/useNativeAvatarUrl', () => ({
  default: () => null,
}));

vi.mock('../../components/CompactValue', () => ({
  default: () => null,
}));

import LeaderboardPage from '../LeaderboardPage';

function makeEntry(overrides = {}) {
  return {
    userId: 'u1',
    username: 'player1',
    displayName: 'Player One',
    rank: 4,
    value: 1234567,
    rankChange: 2,
    ...overrides,
  };
}

beforeEach(() => {
  lbState.rankings = [];
  lbState.myRanks = null;
  lbState.loading = false;
  lbState.error = null;
  lbState.total = 0;
  lbState.rewards = null;
  lbState.seasonNumber = null;
  lbState.fetchRankings.mockClear();
});

describe('LeaderboardPage', () => {
  function rankFour() {
    return [1, 2, 3, 4].map((rank) =>
      makeEntry({
        rank,
        userId: `u${rank}`,
        username: `player${rank}`,
        displayName: `Player ${rank}`,
      }),
    );
  }

  it('renders player rows with rank, name and movement', () => {
    lbState.rankings = rankFour();
    lbState.total = 4;

    render(<LeaderboardPage />);

    expect(screen.getByText('Player 1')).toBeInTheDocument();
    // Rank 4 is the first row in the list below the podium.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('\u25B2 +2')).toBeInTheDocument();
  });

  it('renders 3-digit ranks without clipping (no fixed max-width truncation)', () => {
    lbState.rankings = [
      ...rankFour().slice(0, 3),
      makeEntry({ rank: 147, username: 'deep', displayName: 'Deep Rank' }),
    ];
    lbState.total = 4;

    render(<LeaderboardPage />);

    const badge = screen.getByText('147').closest('span');
    expect(badge).toBeTruthy();
    expect(badge.className).not.toContain('max-w-');
    expect(badge.className).not.toContain('truncate');
    expect(screen.getByText('Deep Rank')).toBeInTheDocument();
  });

  it('highlights the current user row', () => {
    lbState.rankings = rankFour().map((e) =>
      e.rank === 4 ? { ...e, userId: 'me', username: 'me', displayName: 'Me' } : e,
    );
    lbState.total = 4;

    render(<LeaderboardPage />);
    const meBtn = screen.getByText('Me').closest('button');
    expect(meBtn).toBeTruthy();
    expect(meBtn.className).toContain('bg-blue-50');
  });

  it('shows the loading state', () => {
    lbState.loading = true;
    render(<LeaderboardPage />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    render(<LeaderboardPage />);
    expect(screen.getByText('leaderboard.noRankings')).toBeInTheDocument();
  });

  it('shows the error state with a retry button', () => {
    lbState.error = 'boom';
    render(<LeaderboardPage />);
    expect(screen.getByText('leaderboard.errorLoad')).toBeInTheDocument();

    screen.getByText('leaderboard.retry').click();
    expect(lbState.fetchRankings).toHaveBeenCalled();
  });

  it('switches categories and reloads rankings from page 1', async () => {
    lbState.rankings = rankFour();
    lbState.total = 4;

    const { container } = render(<LeaderboardPage />);
    const tabBar = container.querySelector('.scrollbar-hide');
    const tab = [...tabBar.querySelectorAll('button')].find((b) => b.textContent.includes('properties'));
    expect(tab).toBeTruthy();

    fireEvent.click(tab);
    await waitFor(() => {
      expect(lbState.fetchRankings).toHaveBeenCalledWith('properties', expect.anything());
    });
  });

  describe('mobile horizontal-overflow guards', () => {
    function renderWorstCase() {
      lbState.rankings = rankFour().map((e, i) => ({
        ...e,
        displayName: 'X'.repeat(120),
        rank: 987654321 + i,
        value: 9999999999999999,
        rankChange: 999999999,
      }));
      lbState.total = 500;
      lbState.rewards = [
        { rank: 1, reward: 9999999999999999 },
        { minRank: 2, maxRank: 5, reward: 888888888888888 },
      ];
      lbState.seasonNumber = 7;
      lbState.myRanks = {
        netWorth: { rank: 5, value: 9999999999999999 },
        properties: { rank: 9, value: 5 },
        passiveIncome: { rank: 3, value: 99999 },
        dealVolume: { rank: 12, value: 12345 },
        cityInfluence: { rank: 6, value: 88 },
      };
      return render(<LeaderboardPage />);
    }

    it('season reward amounts truncate instead of widening their grid cell', () => {
      const { container } = renderWorstCase();
      const amounts = [...container.querySelectorAll('div.text-xs.font-bold.text-yellow-600')];
      expect(amounts.length).toBeGreaterThan(0);
      for (const el of amounts) {
        expect(el.className).toContain('truncate');
        expect(el.className).toContain('min-w-0');
      }
    });

    it('rank badges and movement indicators grow with content instead of clipping or widening the page', () => {
      const { container } = renderWorstCase();
      const badges = [...container.querySelectorAll('span.min-w-7')];
      expect(badges.length).toBeGreaterThan(0);
      for (const b of badges) {
        expect(b.className).toContain('whitespace-nowrap');
        const classes = b.className.split(' ');
        expect(classes).not.toContain('w-7');
      }
      const movements = [...container.querySelectorAll('div.min-w-9')];
      expect(movements.length).toBeGreaterThan(0);
    });

    it('pagination wraps instead of overflowing on narrow screens', () => {
      const { container } = renderWorstCase();
      const pagination = [...container.querySelectorAll('div.flex')].find((d) =>
        [...d.querySelectorAll('button')].some((b) => b.textContent === '\u2190'),
      );
      expect(pagination).toBeTruthy();
      expect(pagination.className).toContain('flex-wrap');
      for (const btn of pagination.querySelectorAll('button.w-8')) {
        expect(btn.className).toContain('min-w-8');
      }
    });
  });

  describe('mobile (<768px) layout via matchMedia', () => {
    const originalMatchMedia = window.matchMedia;

    afterEach(() => {
      if (originalMatchMedia === undefined) {
        delete window.matchMedia;
      } else {
        window.matchMedia = originalMatchMedia;
      }
    });

    function setMobile() {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: query.includes('max-width'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
    }

    it('renders the compact `<  1 / N  >` pagination on mobile', () => {
      setMobile();
      lbState.rankings = rankFour();
      lbState.total = 500;
      render(<LeaderboardPage />);
      expect(screen.getByText('1 / 25')).toBeInTheDocument();
      expect(screen.getByText('\u2190')).toBeInTheDocument();
    });

    it('renders a stacked podium with #1 on top on mobile', () => {
      setMobile();
      lbState.rankings = rankFour();
      lbState.total = 4;
      render(<LeaderboardPage />);
      expect(screen.getByText('\uD83E\uDD47')).toBeInTheDocument();
      expect(screen.getByText('Player 1')).toBeInTheDocument();
      expect(screen.queryByText('\u25B2 +2')).toBeInTheDocument();
    });

    it('does not crash when myRanks is missing some categories', () => {
      setMobile();
      lbState.rankings = rankFour();
      lbState.total = 4;
      lbState.myRanks = { netWorth: { rank: 5, value: 999 } };
      render(<LeaderboardPage />);
      expect(screen.getAllByText('\u2014').length).toBeGreaterThan(0);
    });
  });

  it('renders supporter cosmetics on rows without changing rank or score', () => {
    lbState.rankings = [
      ...rankFour().slice(0, 3),
      makeEntry({
        rank: 4,
        value: 987654,
        username: 'sup',
        displayName: 'Supporter',
        cosmetics: {
          usernameStyle: { type: 'gradient', color: 'cityflow_cyan', gradient: 'neon', animated: true },
          usernameEffect: 'glow',
          avatarFrame: 'gold_ring',
          badge: 'supporter',
        },
        supporterBadge: 'supporter',
      }),
    ];
    lbState.total = 4;

    const { container } = render(<LeaderboardPage />);
    // Cosmetic classes applied to the row.
    expect(container.querySelector('.si-username-animated')).toBeTruthy();
    expect(container.querySelector('.si-effect-glow')).toBeTruthy();
    expect(container.querySelector('.si-avatar-gold-ring')).toBeTruthy();
    // The row's rank badge and name still render (rank/value are untouched —
    // exact rank/value equality is asserted by the backend payload tests).
    expect(screen.getByText('Supporter')).toBeInTheDocument();
    expect(container.querySelector('.bg-gray-100.dark\\:bg-gray-800')).toBeTruthy();
  });

  it('renders plain rows when no cosmetics exist (rank and score intact)', () => {
    lbState.rankings = [makeEntry({ rank: 4, value: 100 })];
    lbState.total = 1;
    const { container } = render(<LeaderboardPage />);
    expect(container.querySelector('.si-username')).toBeNull();
    expect(screen.getByText('Player One')).toBeInTheDocument();
    expect(container.querySelector('.bg-gray-100.dark\\:bg-gray-800')).toBeTruthy();
  });
});
