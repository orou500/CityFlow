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
    'rewardedAds.errorNoMedia': 'No playable ad media was found.',
    'rewardedAds.errorNoAd': 'Could not start the ad.',
    'rewardedAds.errorMedia': 'The ad could not play.',
    'rewardedAds.timeRemaining': '{{seconds}}s remaining',
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

  it('shows a localized error instead of silently resetting when the ad fails to load', async () => {
    // Regression: a failed ad used to call the page's onError which cleared
    // everything with no feedback — the user saw "nothing happened". The page
    // must surface a localized error message and let the player retry.
    globalThis.fetch = routeFetch({ vast: { ok: false, status: 500 } });
    const { getByTestId, container, queryByTestId } = render(<RewardedAdsPage />);

    const startButton = await waitFor(() => getByTestId('start-ad-button'));
    fireEvent.click(startButton);

    const msg = await waitFor(() => {
      const el = container.querySelector('[data-testid="page-message"]');
      if (!el) throw new Error('waiting for error message');
      return el;
    });
    expect(msg).toHaveTextContent('Could not load the ad.');

    await waitFor(() => expect(queryByTestId('player-slot')).toBeNull());
    await waitFor(() => expect(getByTestId('start-ad-button')).toBeInTheDocument());
  });

  it('a single click issues exactly one start request and one player', async () => {
    const fetchMock = routeFetch();
    globalThis.fetch = fetchMock;
    const { getByTestId, container } = render(<RewardedAdsPage />);

    const startButton = await waitFor(() => getByTestId('start-ad-button'));
    fireEvent.click(startButton);

    await waitFor(() => {
      const video = container.querySelector('video');
      if (!video || !video.getAttribute('src')) throw new Error('waiting for ad');
    });

    const startCalls = fetchMock.mock.calls.filter(
      ([url, opts = {}]) => String(url).endsWith('/rewarded-ads/start') && (opts.method || 'GET') === 'POST',
    );
    expect(startCalls.length).toBe(1);
    expect(container.querySelectorAll('[data-testid="ad-player"]').length).toBe(1);
  });

  it('rapid double-click issues exactly one start request (single session per action)', async () => {
    let startResolve;
    globalThis.fetch = routeFetch({
      start: new Promise((resolve) => {
        startResolve = resolve;
      }),
    });
    const { getByTestId } = render(<RewardedAdsPage />);

    const startButton = await waitFor(() => getByTestId('start-ad-button'));
    fireEvent.click(startButton);
    // The button disappears immediately once the session starts, but a second
    // click may race the state update — the in-flight guard must absorb it.
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    startResolve({ sessionId: 's1', status: 'pending', rewardAmount: 2000, expiresAt: '2026-09-02T12:00:00Z' });

    const fetchMock = globalThis.fetch;
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        ([url, opts = {}]) => String(url).endsWith('/rewarded-ads/start') && (opts.method || 'GET') === 'POST',
      );
      expect(calls.length).toBe(1);
    });
  });

  it('hides the start button while a session is loading or playing', async () => {
    let startResolve;
    globalThis.fetch = routeFetch({
      start: new Promise((resolve) => {
        startResolve = resolve;
      }),
    });
    const { getByTestId, queryByTestId } = render(<RewardedAdsPage />);

    const startButton = await waitFor(() => getByTestId('start-ad-button'));
    fireEvent.click(startButton);

    // While the start request is in flight the button must not be available,
    // so a second session can never be started from the same page state.
    await waitFor(() => expect(queryByTestId('start-ad-button')).toBeNull());

    startResolve({ sessionId: 's1', status: 'pending', rewardAmount: 2000, expiresAt: '2026-09-02T12:00:00Z' });
    await waitFor(() => expect(queryByTestId('start-ad-button')).toBeNull());
  });

  it('never shows more than one loading UI and none while the video plays', async () => {
    // Regression: the page's spinner placeholder rendered during BOTH 'loading'
    // and 'playing' with "Loading…" text, so the video played with a stuck
    // loading layer on screen (and two loading texts existed while the VAST
    // was fetching). Exactly one loading UI may exist at any moment, and it
    // must disappear completely once the video is on screen.
    let startResolve;
    globalThis.fetch = routeFetch({
      start: new Promise((resolve) => {
        startResolve = resolve;
      }),
    });
    const { getByTestId, container } = render(<RewardedAdsPage />);

    const startButton = await waitFor(() => getByTestId('start-ad-button'));
    fireEvent.click(startButton);

    // While the start request is in flight: the page spinner is the only
    // loading UI (no player exists yet).
    const loadingDuringStart = Array.from(container.querySelectorAll('*')).filter(
      (el) => el.textContent === 'Loading…',
    );
    expect(loadingDuringStart.length).toBe(1);

    startResolve({ sessionId: 's1', status: 'pending', rewardAmount: 2000, expiresAt: '2026-09-02T12:00:00Z' });

    // Once the video is playing, no loading UI may remain anywhere.
    const video = await waitFor(() => {
      const v = container.querySelector('video');
      if (!v || !v.getAttribute('src')) throw new Error('waiting for ad');
      return v;
    });
    expect(video).toBeTruthy();
    const loadingWhilePlaying = Array.from(container.querySelectorAll('*')).filter(
      (el) => el.textContent === 'Loading…',
    );
    expect(loadingWhilePlaying.length).toBe(0);
  });
});
