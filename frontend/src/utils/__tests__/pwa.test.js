import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isIOS, isStandalone, registerServiceWorker, PWA_STATUS } from '../pwa';

const ORIGINAL_UA = navigator.userAgent;

function setUserAgent(ua) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true, writable: true });
  Object.defineProperty(window.navigator, 'platform', { value: '', configurable: true, writable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 0, configurable: true, writable: true });
}

function installMatchMedia(standaloneMatches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(display-mode: standalone)' ? standaloneMatches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

describe('pwa utilities', () => {
  beforeEach(() => {
    installMatchMedia(false);
    setUserAgent(ORIGINAL_UA);
    delete window.navigator.standalone;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      delete window.navigator.standalone;
    } catch {
      // jsdom may not allow deletion from navigator; ignore.
    }
  });

  describe('isStandalone', () => {
    it('returns false when not in standalone mode', () => {
      expect(isStandalone()).toBe(false);
    });

    it('returns true when display-mode: standalone matches', () => {
      installMatchMedia(true);
      expect(isStandalone()).toBe(true);
    });

    it('returns true for iOS standalone (navigator.standalone)', () => {
      Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
      expect(isStandalone()).toBe(true);
    });

    it('returns false for iOS in-browser (navigator.standalone === undefined)', () => {
      Object.defineProperty(window.navigator, 'standalone', { value: undefined, configurable: true });
      expect(isStandalone()).toBe(false);
    });
  });

  describe('isIOS', () => {
    it('detects an iPhone from the user agent', () => {
      setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      );
      expect(isIOS()).toBe(true);
    });

    it('detects an iPad from the user agent', () => {
      setUserAgent(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      );
      expect(isIOS()).toBe(true);
    });

    it('detects iPadOS (Macintosh UA + touch points)', () => {
      setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      );
      Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
      Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true });
      expect(isIOS()).toBe(true);
    });

    it('does not flag a desktop Safari', () => {
      setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      );
      expect(isIOS()).toBe(false);
    });

    it('does not flag Android', () => {
      setUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      );
      expect(isIOS()).toBe(false);
    });
  });

  describe('registerServiceWorker', () => {
    beforeEach(() => {
      try {
        delete window.navigator.serviceWorker;
      } catch {
        // ignore
      }
    });

    it('skips registration outside production (dev/Vitest)', () => {
      const result = registerServiceWorker({ isProd: false });
      expect(result.registered).toBe(false);
      expect(result.reason).toBe('not-production');
    });

    it('skips registration in Capacitor/native mode', () => {
      const result = registerServiceWorker({ isProd: true, isNative: true });
      expect(result.registered).toBe(false);
      expect(result.reason).toBe('native');
    });

    it('skips registration when ServiceWorker is unsupported', () => {
      const register = vi.fn();
      const result = registerServiceWorker({ isProd: true, isNative: false, register });
      expect(result.registered).toBe(false);
      expect(result.reason).toBe('unsupported');
      expect(register).not.toHaveBeenCalled();
    });

    it('registers /sw.js in production web', () => {
      const swRegister = vi.fn().mockResolvedValue({});
      Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: { register: swRegister } });
      const result = registerServiceWorker({ isProd: true, isNative: false });
      expect(result.registered).toBe(true);
      expect(swRegister).toHaveBeenCalledTimes(1);
      expect(swRegister).toHaveBeenCalledWith('/sw.js');
    });

    it('invokes an injected register callback', () => {
      const register = vi.fn().mockResolvedValue({});
      Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: { register: vi.fn() } });
      const result = registerServiceWorker({ isProd: true, isNative: false, register });
      expect(result.registered).toBe(true);
      expect(register).toHaveBeenCalledTimes(1);
    });
  });

  it('exposes the PWA_STATUS state machine', () => {
    expect(PWA_STATUS).toEqual({
      UNSUPPORTED: 'unsupported',
      IOS: 'ios',
      INSTALLABLE: 'installable',
      INSTALLED: 'installed',
    });
  });
});
