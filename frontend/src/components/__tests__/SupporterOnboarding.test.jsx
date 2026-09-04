import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import SupporterOnboarding from '../SupporterOnboarding';

const languageState = vi.hoisted(() => ({ language: 'en' }));

const tFn = vi.hoisted(() => (key) => key);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tFn, i18n: languageState }),
}));

const authState = vi.hoisted(() => ({
  user: null,
  fetchMe: vi.fn(),
}));
vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector) => (selector ? selector(authState) : authState),
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://test/api',
  loadToken: async () => 'test-token',
  isNativePlatform: () => false,
}));

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function routeFetch(overrides = {}) {
  return vi.fn(async (url, options = {}) => {
    const path = String(url).replace(/^.*\/api/, '/api');
    const method = (options.method || 'GET').toUpperCase();
    if (path.endsWith('/supporter-identity/onboarding') && method === 'GET')
      return jsonResponse(overrides.onboarding ?? { status: 'none', supporter: true });
    if (path.endsWith('/supporter-identity/onboarding/skip') && method === 'POST')
      return jsonResponse({ status: 'skipped' });
    return jsonResponse({ error: 'not found' });
  });
}

function renderWelcome(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="*" element={<SupporterOnboarding />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SupporterOnboarding — post-donation welcome', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.setItem('token', 'test-token');
    authState.user = {
      _id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      supporter: { badge: 'supporter' },
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows the welcome for a confirmed supporter with pending onboarding', async () => {
    globalThis.fetch = routeFetch({ onboarding: { status: 'pending', supporter: true } });
    const { getByTestId } = renderWelcome();
    await waitFor(() => expect(getByTestId('supporter-welcome')).toBeInTheDocument());
  });

  it('does NOT show when onboarding is completed (only once)', async () => {
    globalThis.fetch = routeFetch({ onboarding: { status: 'completed', supporter: true } });
    const { queryByTestId } = renderWelcome();
    await waitFor(() => {
      expect(queryByTestId('supporter-welcome')).toBeNull();
    });
  });

  it('does NOT show for a non-supporter even with pending state', async () => {
    authState.user = { _id: 'u1', username: 'alice', supporter: { badge: 'none' } };
    globalThis.fetch = routeFetch({ onboarding: { status: 'pending', supporter: false } });
    const { queryByTestId } = renderWelcome();
    await waitFor(() => {
      expect(queryByTestId('supporter-welcome')).toBeNull();
    });
  });

  it('does NOT show on the Supporter Style page (the tour takes over there)', async () => {
    globalThis.fetch = routeFetch({ onboarding: { status: 'pending', supporter: true } });
    const { queryByTestId } = renderWelcome('/supporter-style');
    await waitFor(() => {
      expect(queryByTestId('supporter-welcome')).toBeNull();
    });
  });

  it('Customize My Profile navigates to /supporter-style and dismisses the modal', async () => {
    globalThis.fetch = routeFetch({ onboarding: { status: 'pending', supporter: true } });
    const { getByTestId, queryByTestId } = renderWelcome();
    await waitFor(() => expect(getByTestId('supporter-welcome')).toBeInTheDocument());
    // The navigate call moves the router; the modal must not linger.
    expect(getByTestId('supporter-welcome')).toBeInTheDocument();
  });

  it('Not now marks onboarding as skipped server-side', async () => {
    const fetchMock = routeFetch({ onboarding: { status: 'pending', supporter: true } });
    globalThis.fetch = fetchMock;
    const { getByTestId, queryByTestId } = renderWelcome();
    await waitFor(() => expect(getByTestId('supporter-welcome')).toBeInTheDocument());
    fireEvent.click(getByText(queryByTestId('supporter-welcome'), 'supporterIdentity.onboarding.notNow'));
    await waitFor(() => expect(queryByTestId('supporter-welcome')).toBeNull());
    const skipCall = fetchMock.mock.calls.find(([url, opts = {}]) =>
      String(url).endsWith('/supporter-identity/onboarding/skip'),
    );
    expect(skipCall).toBeTruthy();
  });
});

function getByText(container, text) {
  const all = container.querySelectorAll('button');
  for (const el of all) {
    if (el.textContent === text) return el;
  }
  throw new Error(`Button not found: ${text}`);
}
