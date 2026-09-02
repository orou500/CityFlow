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
});
