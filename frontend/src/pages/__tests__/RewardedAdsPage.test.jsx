import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RewardedAdsPage from '../RewardedAdsPage';

const languageState = vi.hoisted(() => ({ language: 'en' }));

const DICT = vi.hoisted(() => ({
  en: {
    'rewardedAds.title': 'Watch Ad & Earn',
    'rewardedAds.subtitle': 'sub',
    'rewardedAds.watchAd': 'Watch Ad & Earn',
    'rewardedAds.loading': 'Loading…',
    'rewardedAds.unavailable': 'Not available',
    'rewardedAds.dailyRemaining': 'Daily ads left',
    'rewardedAds.reward': 'Reward per ad',
    'rewardedAds.history': 'Recent rewards',
    'rewardedAds.noHistory': 'No rewarded ads watched yet.',
    'rewardedAds.cooldown': 'Wait {{seconds}} s',
    'rewardedAds.cooldownCountdown': 'retry in {{seconds}} s',
    'rewardedAds.dailyLimitReached': 'Daily limit reached',
    'rewardedAds.completeHint': 'Watch the full ad to earn.',
    'rewardedAds.alreadyClaimed': 'Already claimed.',
    'rewardedAds.earnedBanner': 'You earned {{amount}}!',
    'rewardedAds.earned': 'You earned {{amount}} — credited.',
    'rewardedAds.dismiss': 'Dismiss',
    'rewardedAds.loadFailed': 'Could not load the ad.',
    'rewardedAds.unmute': 'Unmute',
    'rewardedAds.mute': 'Mute',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const dict = DICT[languageState.language] || DICT.en;
    const t = (key, options = {}) => {
      const template = dict[key];
      const interpolate = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, name) => options[name] ?? `{{${name}}}`);
      return template === undefined ? key : interpolate(template);
    };
    return { t, i18n: languageState };
  },
}));

const storeState = vi.hoisted(() => ({ fetchMe: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector) => selector(storeState),
}));

const VAST_XML = `<?xml version="1.0"?>
<VAST version="3.0">
  <Ad id="one"><InLine><AdSystem>x</AdSystem>
    <Creatives><Creative><Linear>
      <Duration>00:00:10</Duration>
      <MediaFiles><MediaFile type="video/mp4">https://cdn.example/one.mp4</MediaFile></MediaFiles>
    </Linear></Creative></Creatives>
  </InLine></Ad>
</VAST>`;

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function routeFetch(overrides = {}) {
  return vi.fn(async (url, options = {}) => {
    const path = String(url).replace(/^.*\/api/, '/api');
    const method = (options.method || 'GET').toUpperCase();
    if (path.endsWith('/rewarded-ads/config')) return jsonResponse(overrides.config ?? { enabled: true });
    if (path.endsWith('/rewarded-ads/status'))
      return jsonResponse(
        overrides.status ?? {
          enabled: true,
          rewardAmount: 2000,
          cooldownRemainingMs: 0,
          dailyUsed: 1,
          dailyLimit: 10,
        },
      );
    if (path.endsWith('/rewarded-ads/history')) return jsonResponse(overrides.history ?? { sessions: [] });
    if (path.endsWith('/rewarded-ads/start') && method === 'POST')
      return jsonResponse(
        overrides.start ?? {
          sessionId: 's1',
          status: 'pending',
          rewardAmount: 2000,
          expiresAt: '2026-09-02T12:00:00Z',
        },
      );
    if (path.includes('/rewarded-ads/session/s1/vast')) {
      const mock = overrides.vast ?? VAST_XML;
      return typeof mock === 'string' ? { ok: true, status: 200, text: async () => mock } : mock;
    }
    if (path.endsWith('/rewarded-ads/s1/complete') && method === 'POST')
      return jsonResponse(overrides.complete ?? { success: true, rewardAmount: 2000, balance: 102000 });
    return jsonResponse({ error: 'not found' }, false, 404);
  });
}

describe('RewardedAdsPage', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows the unavailable state when ads are disabled', async () => {
    globalThis.fetch = routeFetch({ config: { enabled: false } });
    const { getByText } = render(<RewardedAdsPage />);
    await waitFor(() => expect(getByText('Not available')).toBeInTheDocument());
  });

  it('runs the full watch → complete → reward flow', async () => {
    const fetchMock = routeFetch();
    globalThis.fetch = fetchMock;
    const { getByTestId, container, getByText } = render(<RewardedAdsPage />);

    const startButton = await waitFor(() => getByTestId('start-ad-button'));
    fireEvent.click(startButton);

    const video = await waitFor(() => {
      const v = container.querySelector('video');
      if (!v || !v.getAttribute('src')) throw new Error('waiting for ad');
      return v;
    });
    expect(video.getAttribute('src')).toContain('https://cdn.example/one.mp4');

    fireEvent.ended(video);

    await waitFor(() => expect(getByText('You earned $2K!')).toBeInTheDocument());
    const completeCall = fetchMock.mock.calls.find(
      ([url, opts = {}]) => String(url).endsWith('/rewarded-ads/s1/complete') && (opts.method || 'GET') === 'POST',
    );
    expect(completeCall).toBeTruthy();
  });

  it('disables the button during cooldown and shows the countdown', async () => {
    globalThis.fetch = routeFetch({
      status: { enabled: true, rewardAmount: 2000, cooldownRemainingMs: 90000, dailyUsed: 1, dailyLimit: 10 },
    });
    const { getByTestId, getByText } = render(<RewardedAdsPage />);
    await waitFor(() => {
      const button = getByTestId('start-ad-button');
      expect(button).toBeDisabled();
      expect(button.textContent).toContain('90');
    });
    expect(getByText('Wait 90 s', { exact: false })).toBeInTheDocument();
  });
});
