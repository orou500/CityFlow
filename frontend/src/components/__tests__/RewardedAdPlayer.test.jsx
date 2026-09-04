import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RewardedAdPlayer from '../RewardedAdPlayer';

const languageState = vi.hoisted(() => ({ language: 'en' }));

const DICT = vi.hoisted(() => ({
  en: {
    'rewardedAds.loading': 'Loading…',
    'rewardedAds.loadFailed': 'Could not load the ad. Please try again.',
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

const TWO_AD_VAST = `<?xml version="1.0"?>
<VAST version="3.0">
  <Ad id="one">
    <InLine>
      <AdSystem>x</AdSystem>
      <Impression>https://t.example/imp/1</Impression>
      <Creatives><Creative><Linear>
        <Duration>00:00:10</Duration>
        <TrackingEvents><Tracking event="start">https://t.example/start/1</Tracking><Tracking event="complete">https://t.example/complete/1</Tracking></TrackingEvents>
        <MediaFiles><MediaFile type="video/mp4">https://cdn.example/one.mp4</MediaFile></MediaFiles>
      </Linear></Creative></Creatives>
    </InLine>
  </Ad>
  <Ad id="two">
    <InLine>
      <AdSystem>x</AdSystem>
      <Impression>https://t.example/imp/2</Impression>
      <Creatives><Creative><Linear>
        <Duration>00:00:10</Duration>
        <TrackingEvents><Tracking event="start">https://t.example/start/2</Tracking></TrackingEvents>
        <MediaFiles><MediaFile type="video/webm">https://cdn.example/two.webm</MediaFile></MediaFiles>
      </Linear></Creative></Creatives>
    </InLine>
  </Ad>
</VAST>`;

function stubFetch(text, ok = true) {
  return vi.fn().mockResolvedValue({ ok, status: 200, text: async () => text });
}

describe('RewardedAdPlayer', () => {
  let onComplete;
  let onError;
  let originalFetch;

  beforeEach(() => {
    onComplete = vi.fn();
    onError = vi.fn();
    originalFetch = globalThis.fetch;
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('loads the VAST from the server proxy with the auth token', async () => {
    const fetchMock = stubFetch(TWO_AD_VAST);
    globalThis.fetch = fetchMock;
    render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('/rewarded-ads/session/s1/vast');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer test-token');
  });

  it('plays ads sequentially and reports completion after the last ad ends', async () => {
    globalThis.fetch = stubFetch(TWO_AD_VAST);
    const { container } = render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);

    const firstVideo = await waitFor(() => {
      const video = container.querySelector('video');
      if (!video || video.getAttribute('src') === '') throw new Error('waiting for ad src');
      return video;
    });
    expect(firstVideo.src).toContain('https://cdn.example/one.mp4');

    fireEvent.ended(firstVideo);
    await waitFor(() => {
      const secondVideo = container.querySelector('video');
      expect(secondVideo.src).toContain('https://cdn.example/two.webm');
    });

    fireEvent.ended(container.querySelector('video'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports an error when the VAST document cannot be loaded', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports an error when no playable ads exist', async () => {
    globalThis.fetch = stubFetch('<VAST version="3.0"></VAST>');
    render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });

  it('does not mount an empty-src <video> while the VAST is still loading', async () => {
    // Regression: the ad used to render a <video src=""> immediately and fire a
    // spurious MEDIA_ERR_SRC_NOT_SUPPORTED before the async VAST resolved,
    // which failed the flow with NO_AD and showed the user nothing. The video
    // must only appear once a real media src is assigned.
    let resolveFetch;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => (resolveFetch = resolve)));
    const { container } = render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);

    // While still loading there must be no <video> element to emit an error.
    expect(container.querySelector('video')).toBeNull();
    expect(onError).not.toHaveBeenCalled();

    resolveFetch({ ok: true, status: 200, text: async () => TWO_AD_VAST });
    const video = await waitFor(() => {
      const v = container.querySelector('video');
      if (!v) throw new Error('waiting for ad video');
      return v;
    });
    expect(video.getAttribute('src')).toContain('https://cdn.example/one.mp4');
    expect(onError).not.toHaveBeenCalled();
  });

  it('degrades across a realistic multi-media InLine VAST and completes once', async () => {
    const multiMediaVast = `
      <VAST version="3.0"><Ad id="one"><InLine><AdSystem>x</AdSystem>
        <Creatives><Creative><Linear>
          <Duration>00:00:41</Duration>
          <MediaFiles>
            <MediaFile delivery="progressive" type="video/webm">https://cdn.example/one.webm</MediaFile>
            <MediaFile delivery="progressive" type="video/mp4">https://cdn.example/one.mp4</MediaFile>
            <MediaFile delivery="progressive" type="video/flv">https://cdn.example/one.flv</MediaFile>
          </MediaFiles>
        </Linear></Creative></Creatives>
      </InLine></Ad></VAST>`;
    globalThis.fetch = stubFetch(multiMediaVast);
    const { container } = render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);
    let video = await waitFor(() => {
      const v = container.querySelector('video');
      if (!v || !v.getAttribute('src')) throw new Error('waiting for ad');
      return v;
    });
    expect(video.getAttribute('src')).toContain('https://cdn.example/');
    fireEvent.ended(video);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onError).not.toHaveBeenCalled();
  });

  it('renders exactly ONE loading block and removes it when the video plays', async () => {
    // Regression: the player rendered two independent "Loading…" blocks at
    // mount (one gated on phase==='loading' which never left 'loading', one on
    // an empty src) — one click produced two black loading screens and the
    // first stayed stuck forever while the video played.
    let resolveFetch;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => (resolveFetch = resolve)));
    const { container } = render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);

    const loadingBlocks = container.querySelectorAll('div');
    const loadingText = Array.from(loadingBlocks).filter(
      (el) => el.textContent === 'Loading…' && el.className.includes('flex'),
    );
    expect(loadingText.length).toBe(1);

    resolveFetch({ ok: true, status: 200, text: async () => TWO_AD_VAST });
    await waitFor(() => {
      const video = container.querySelector('video');
      if (!video || !video.getAttribute('src')) throw new Error('waiting for ad');
    });

    const remainingLoading = Array.from(container.querySelectorAll('div')).filter(
      (el) => el.textContent === 'Loading…' && el.className.includes('flex'),
    );
    expect(remainingLoading.length).toBe(0);
    expect(container.querySelector('video')).toBeTruthy();
  });

  it('shows an error block (no stuck loading block) when the VAST fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const { container } = render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    const loadingBlocks = Array.from(container.querySelectorAll('div')).filter(
      (el) => el.textContent === 'Loading…' && el.className.includes('flex'),
    );
    expect(loadingBlocks.length).toBe(0);
    expect(container.querySelector('[data-phase="error"]')).toBeTruthy();
    expect(container.querySelector('video')).toBeNull();
  });

  it('reports completion exactly once for duplicate ended callbacks', async () => {
    globalThis.fetch = stubFetch(TWO_AD_VAST);
    const { container } = render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);
    let video = await waitFor(() => {
      const v = container.querySelector('video');
      if (!v || !v.getAttribute('src')) throw new Error('waiting for ad');
      return v;
    });

    // Ad 1 ends -> moves to ad 2 (video remounts with the new src).
    fireEvent.ended(video);
    video = await waitFor(() => {
      const v = container.querySelector('video');
      if (!v || !v.getAttribute('src')?.includes('two.webm')) throw new Error('waiting for ad 2');
      return v;
    });

    // Ad 2 ends -> completion. Duplicate ended events on the settled flow must
    // be absorbed by the settled guard — exactly one onComplete.
    fireEvent.ended(video);
    fireEvent.ended(video);
    fireEvent.ended(video);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not refetch or restart when the component rerenders with the same session', async () => {
    const fetchMock = stubFetch(TWO_AD_VAST);
    globalThis.fetch = fetchMock;
    const { rerender } = render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);
    rerender(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out and reports a failure instead of loading forever', async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = vi.fn(() => new Promise(() => {}));
      render(<RewardedAdPlayer sessionId="s1" onComplete={onComplete} onError={onError} />);
      vi.advanceTimersByTime(16_000);
      await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
      expect(onComplete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
