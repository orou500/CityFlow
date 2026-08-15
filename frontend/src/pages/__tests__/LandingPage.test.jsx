import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import LandingPage from '../LandingPage';

const languageState = vi.hoisted(() => ({ language: 'en' }));

// Mirrors the real translation files (en.json / he.json) for the keys the
// Global Activity feed uses — interpolation handled the same way i18next does.
const TRANSLATIONS = vi.hoisted(() => ({
  en: {
    'landing.activity.title': 'World Activity',
    'landing.activity.description': 'Recent activity across the CityFlow universe.',
    'landing.activity.buy': '{{buyer}} bought {{property}} for {{amount}}',
    'landing.activity.rent': '{{buyer}} collected {{amount}} in rent',
    'worldStatus.justNow': 'Just now',
    'worldStatus.minutesAgo': '{{count}}m ago',
    'worldStatus.hoursAgo': '{{count}}h ago',
    'worldStatus.daysAgo': '{{count}}d ago',
  },
  he: {
    'landing.activity.title': 'פעילות עולמית',
    'landing.activity.description': 'פעילות אחרונה ברחבי יקום CityFlow.',
    'landing.activity.buy': '{{buyer}} קנה את {{property}} ב-{{amount}}',
    'landing.activity.rent': '{{buyer}} גבה {{amount}} משכירות',
    'worldStatus.justNow': 'הרגע',
    'worldStatus.minutesAgo': "לפני {{count}} דק'",
    'worldStatus.hoursAgo': "לפני {{count}} שע'",
    'worldStatus.daysAgo': 'לפני {{count}} ימים',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const dict = TRANSLATIONS[languageState.language] || TRANSLATIONS.en;
    const t = (key, options = {}) => {
      const template = dict[key];
      if (template === undefined) return options.defaultValue ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (_, name) => options[name] ?? `{{${name}}}`);
    };
    return { t, i18n: languageState };
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector) => selector({ user: null, loading: false }),
}));

vi.mock('../../components/ThemeProvider', () => ({
  useTheme: () => ({ resolved: 'light' }),
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000/api',
}));

vi.mock('../../components/CompactValue', () => ({
  default: () => null,
}));

vi.mock('../../components/Footer', () => ({
  default: () => null,
}));

const STRIP_BIDI = /[\u2066\u2067\u2068\u2069]/g;
const clean = (s) => s.replace(STRIP_BIDI, '');

function makeTx(overrides = {}) {
  return {
    _id: 'tx1',
    type: 'buy',
    price: 1_200_000,
    buyerId: { username: 'orou500' },
    sellerId: { username: 'someone' },
    propertyId: { name: 'Sky Tower' },
    createdAt: '2026-08-15T09:00:00.000Z',
    ...overrides,
  };
}

async function renderLanding(activity) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () =>
      Promise.resolve({
        recentActivity: activity,
        topPlayers: [],
        playersCount: 0,
        propertiesCount: 0,
        citiesCount: 0,
        transactionsCount: 0,
      }),
  });
  const utils = render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByText(TRANSLATIONS[languageState.language]['landing.activity.title'])).toBeInTheDocument(),
  );
  return utils;
}

describe('LandingPage Global Activity feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    languageState.language = 'en';
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  });

  it('renders English activity exactly as before (LTR, proper sentence, relative time)', async () => {
    const { container } = await renderLanding([
      makeTx({ createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }),
    ]);

    const root = container.querySelector('.flex-1');
    expect(root).toHaveAttribute('dir', 'ltr');
    const sentence = screen.getByText((_, el) => clean(el.textContent).includes('orou500 bought Sky Tower for $1.2M'), {
      selector: 'span',
    });
    expect(clean(sentence.textContent)).toBe('orou500 bought Sky Tower for $1.2M');
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  it('renders Hebrew activity in RTL with the translated sentence', async () => {
    languageState.language = 'he';
    const { container } = await renderLanding([makeTx()]);

    const root = container.querySelector('.flex-1');
    expect(root).toHaveAttribute('dir', 'rtl');
    const sentence = screen.getByText((_, el) => clean(el.textContent).includes('orou500 קנה את Sky Tower ב-$1.2M'), {
      selector: 'span',
    });
    expect(clean(sentence.textContent)).toBe('orou500 קנה את Sky Tower ב-$1.2M');
  });

  it('shows relative time translated to Hebrew', async () => {
    languageState.language = 'he';
    await renderLanding([
      makeTx({ createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString() }), // 2 minutes ago
      makeTx({ _id: 'tx2', createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }), // 2 hours ago
      makeTx({ _id: 'tx3', createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString() }), // 4 hours ago
    ]);

    expect(screen.getByText("לפני 2 דק'")).toBeInTheDocument();
    expect(screen.getByText("לפני 2 שע'")).toBeInTheDocument();
    expect(screen.getByText("לפני 4 שע'")).toBeInTheDocument();
  });

  it('falls back to a Hebrew-localized date for old activity', async () => {
    languageState.language = 'he';
    const oldDate = new Date(Date.now() - 31 * 24 * 3600 * 1000); // 31 days ago
    await renderLanding([makeTx({ createdAt: oldDate.toISOString() })]);

    const expected = oldDate.toLocaleDateString('he', { day: 'numeric', month: 'short', year: 'numeric' });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('isolates usernames and currency amounts inside Hebrew sentences (no bidi scrambling)', async () => {
    languageState.language = 'he';
    await renderLanding([makeTx({ price: 1_234_567 })]);

    const sentence = screen.getByText((_, el) => clean(el.textContent).includes('קנה את'), {
      selector: 'span',
    });
    const text = sentence.textContent;

    // username wrapped in first-strong isolation, amount in LTR isolation
    expect(text).toContain('\u2068orou500\u2069');
    expect(text).toContain('\u2066$1.2M\u2069');

    // internal order of the mixed content is preserved left-to-right within each segment
    const segments = text.split(STRIP_BIDI).filter(Boolean);
    expect(segments).toEqual(['orou500', ' קנה את ', 'Sky Tower', ' ב-', '$1.2M']);
  });

  it('keeps the mobile RTL layout wrap-safe without hiding or clipping content', async () => {
    languageState.language = 'he';
    const { container } = await renderLanding([
      makeTx({
        buyerId: { username: 'averyverylongusername123456789' },
        price: 999_999_999,
        propertyId: { name: 'P' },
        createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      }),
    ]);

    const item = container.querySelector('.space-y-3 > div');
    expect(item).toHaveClass('flex-wrap');
    // the sentence can wrap anywhere (no overflow), the time label stays intact
    expect(item.querySelector('span:first-child')).toHaveClass('min-w-0', 'break-words');
    expect(item.querySelector('span:first-child').className).toContain('[overflow-wrap:anywhere]');
    expect(item.querySelector('span:last-child')).toHaveClass('shrink-0', 'whitespace-nowrap');
    // the activity section itself must not hide or clip content
    const section = item.closest('section');
    expect(section.className).not.toContain('overflow-hidden');
    expect(section.className).not.toContain('overflow-x-hidden');
  });
});
