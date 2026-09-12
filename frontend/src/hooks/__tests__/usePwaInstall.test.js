import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePwaInstall from '../usePwaInstall';
import { PWA_STATUS } from '../../utils/pwa';

const ORIGINAL_UA = navigator.userAgent;

function setUserAgent(ua) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true, writable: true });
}

function installMatchMedia(standaloneMatches) {
  const handlers = new Set();
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(display-mode: standalone)' ? standaloneMatches : false,
    media: query,
    addEventListener: (_type, cb) => handlers.add(cb),
    removeEventListener: (_type, cb) => handlers.delete(cb),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
  return handlers;
}

function makeBeforeInstallPrompt(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt');
  event.preventDefault = vi.fn();
  event.prompt = vi.fn();
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

function dispatch(name, event) {
  act(() => {
    window.dispatchEvent(event || new Event(name));
  });
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    setUserAgent(ORIGINAL_UA);
    try {
      delete window.navigator.standalone;
    } catch {
      // ignore
    }
    installMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts unsupported on a desktop browser with no prompt capability', () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.status).toBe(PWA_STATUS.UNSUPPORTED);
  });

  it('starts ios for iPhone Safari', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.status).toBe(PWA_STATUS.IOS);
  });

  it('becomes installable on beforeinstallprompt WITHOUT auto-calling prompt()', () => {
    const { result } = renderHook(() => usePwaInstall());
    const event = makeBeforeInstallPrompt('accepted');
    dispatch('beforeinstallprompt', event);

    expect(result.current.status).toBe(PWA_STATUS.INSTALLABLE);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.prompt).not.toHaveBeenCalled();
  });

  it('accepted install -> INSTALLED and clears the deferred prompt', async () => {
    const { result } = renderHook(() => usePwaInstall());
    dispatch('beforeinstallprompt', makeBeforeInstallPrompt('accepted'));

    let choice;
    await act(async () => {
      choice = await result.current.promptInstall();
    });
    expect(choice.outcome).toBe('accepted');
    expect(result.current.status).toBe(PWA_STATUS.INSTALLED);

    // deferred prompt cleared: a second call cannot reuse the same event
    await act(async () => {
      choice = await result.current.promptInstall();
    });
    expect(choice.outcome).toBe('unsupported');
  });

  it('dismissed install keeps INSTALLABLE but clears the deferred prompt', async () => {
    const { result } = renderHook(() => usePwaInstall());
    dispatch('beforeinstallprompt', makeBeforeInstallPrompt('dismissed'));

    let choice;
    await act(async () => {
      choice = await result.current.promptInstall();
    });
    expect(choice.outcome).toBe('dismissed');
    expect(result.current.status).toBe(PWA_STATUS.INSTALLABLE);

    await act(async () => {
      choice = await result.current.promptInstall();
    });
    expect(choice.outcome).toBe('unsupported');
  });

  it('appinstalled transitions to INSTALLED', () => {
    const { result } = renderHook(() => usePwaInstall());
    dispatch('beforeinstallprompt', makeBeforeInstallPrompt('accepted'));
    expect(result.current.status).toBe(PWA_STATUS.INSTALLABLE);

    dispatch('appinstalled');
    expect(result.current.status).toBe(PWA_STATUS.INSTALLED);
  });

  it('a display-mode standalone change transitions to INSTALLED', () => {
    const handlers = installMatchMedia(false);
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      handlers.forEach((cb) => cb({ matches: true }));
    });
    expect(result.current.status).toBe(PWA_STATUS.INSTALLED);
  });

  it('standalone at mount -> INSTALLED (CTA hidden on Android/desktop)', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.status).toBe(PWA_STATUS.INSTALLED);
  });

  it('iOS standalone at mount -> INSTALLED (CTA hidden on iOS home screen)', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    installMatchMedia(true);
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.status).toBe(PWA_STATUS.INSTALLED);
  });

  it('re-renders do not register duplicate beforeinstallprompt listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { result, rerender } = renderHook(() => usePwaInstall());

    rerender();
    rerender();
    rerender();
    rerender();

    const beforeInstallAdds = addSpy.mock.calls.filter(([type]) => type === 'beforeinstallprompt');
    expect(beforeInstallAdds).toHaveLength(1);
    expect(result.current.status).toBe(PWA_STATUS.UNSUPPORTED);
  });

  it('unmount removes listeners (no leak) and remount can attach a fresh set', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const first = renderHook(() => usePwaInstall());
    first.unmount();

    const second = renderHook(() => usePwaInstall());
    second.unmount();

    const beforeInstallAdds = addSpy.mock.calls.filter(([type]) => type === 'beforeinstallprompt').length;
    const beforeInstallRemoves = removeSpy.mock.calls.filter(([type]) => type === 'beforeinstallprompt').length;

    // two mounts => two independent single listeners, all cleaned up at the end
    expect(beforeInstallAdds).toBe(2);
    expect(beforeInstallRemoves).toBe(2);
    expect(beforeInstallAdds - beforeInstallRemoves).toBe(0);
  });
});
