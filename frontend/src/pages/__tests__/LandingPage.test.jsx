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
    'landing.activity.companyFundsContributed': '{{buyer}} contributed {{amount}} to {{company}}',
    'landing.activity.companyPropertyPurchase': '{{company}} acquired {{property}} for {{amount}}',
    'landing.branding.bySizOps': 'By SizOps',
    'landing.branding.sizOps': 'CityFlow is a game by <brand>SizOps</brand>',
    'contributors.title': 'Contributors',
    supporters: 'Supporters',
    'worldStatus.justNow': 'Just now',
    'worldStatus.minutesAgo': '{{count}}m ago',
    'worldStatus.hoursAgo': '{{count}}h ago',
    'worldStatus.daysAgo': '{{count}}d ago',
    'worldReset.title': 'World Reset',
    'worldReset.label': '{{countdown}} remaining',
    'worldReset.loading': 'Loading…',
    'worldReset.zero': 'less than a minute',
    'worldReset.months_one': '{{count}} month',
    'worldReset.months_other': '{{count}} months',
    'worldReset.days_one': '{{count}} day',
    'worldReset.days_other': '{{count}} days',
    'worldReset.hours_one': '{{count}} hour',
    'worldReset.hours_other': '{{count}} hours',
    'worldReset.minutes_one': '{{count}} minute',
    'worldReset.minutes_other': '{{count}} minutes',
    'worldReset.join1': '{{p1}}',
    'worldReset.join2': '{{p1}}, {{p2}}',
    'worldReset.join3': '{{p1}}, {{p2}}, {{p3}}',
    'worldReset.join4': '{{p1}}, {{p2}}, {{p3}}, {{p4}}',
  },
  he: {
    'landing.activity.title': 'פעילות עולמית',
    'landing.activity.description': 'פעילות אחרונה ברחבי יקום CityFlow.',
    'landing.activity.buy': '{{buyer}} קנה את {{property}} ב-{{amount}}',
    'landing.activity.rent': '{{buyer}} גבה {{amount}} משכירות',
    'landing.activity.companyFundsContributed': '{{buyer}} העביר {{amount}} ל־{{company}}',
    'landing.activity.companyPropertyPurchase': '{{company}} רכש את {{property}} ב-{{amount}}',
    'landing.branding.bySizOps': 'מאת SizOps',
    'landing.branding.sizOps': 'CityFlow הוא משחק של <brand>SizOps</brand>',
    'contributors.title': 'תורמים',
    supporters: 'תומכים',
    'worldStatus.justNow': 'הרגע',
    'worldStatus.minutesAgo': "לפני {{count}} דק'",
    'worldStatus.hoursAgo': "לפני {{count}} שע'",
    'worldStatus.daysAgo': 'לפני {{count}} ימים',
    'worldReset.title': 'איפוס העולם',
    'worldReset.label': 'נותרו {{countdown}}',
    'worldReset.loading': 'טוען…',
    'worldReset.zero': 'פחות מדקה',
    'worldReset.months_one': 'חודש אחד',
    'worldReset.months_two': 'חודשיים',
    'worldReset.months_other': '{{count}} חודשים',
    'worldReset.days_one': 'יום אחד',
    'worldReset.days_two': 'יומיים',
    'worldReset.days_other': '{{count}} ימים',
    'worldReset.hours_one': 'שעה אחת',
    'worldReset.hours_two': 'שעתיים',
    'worldReset.hours_other': '{{count}} שעות',
    'worldReset.minutes_one': 'דקה אחת',
    'worldReset.minutes_two': 'שתי דקות',
    'worldReset.minutes_other': '{{count}} דקות',
    'worldReset.join1': '{{p1}}',
    'worldReset.join2': '{{p1}} ו-{{p2}}',
    'worldReset.join3': '{{p1}}, {{p2}} ו-{{p3}}',
    'worldReset.join4': '{{p1}}, {{p2}}, {{p3}} ו-{{p4}}',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const lang = languageState.language;
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    const t = (key, options = {}) => {
      const interpolate = (template) => template.replace(/\{\{(\w+)\}\}/g, (_, name) => options[name] ?? `{{${name}}}`);
      if (options.count !== undefined) {
        const suffix =
          lang === 'he'
            ? options.count === 1
              ? 'one'
              : options.count === 2
                ? 'two'
                : 'other'
            : options.count === 1
              ? 'one'
              : 'other';
        const plural = dict[`${key}_${suffix}`];
        if (plural !== undefined) return interpolate(plural);
      }
      const template = dict[key];
      if (template === undefined) return options.defaultValue ?? key;
      return interpolate(template);
    };
    return { t, i18n: languageState };
  },
  Trans: ({ i18nKey, components }) => {
    const lang = languageState.language;
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    const template = dict[i18nKey] || i18nKey;
    const before = template.split('<brand>')[0] || '';
    const after = template.split('</brand>')[1] || '';
    const brand = components?.brand ?? 'SizOps';
    return (
      <span>
        {before}
        {brand}
        {after}
      </span>
    );
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
  global.fetch = vi.fn((url) => {
    const payload = String(url).includes('/world/status')
      ? { nextResetAt: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000 + 30 * 1000).toISOString(), seasonTicks: 720 }
      : {
          recentActivity: activity,
          topPlayers: [],
          playersCount: 0,
          propertiesCount: 0,
          citiesCount: 0,
          transactionsCount: 0,
        };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
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

  it('shows the World Reset countdown on the landing page in English', async () => {
    await renderLanding([makeTx()]);

    expect(screen.getByText('World Reset')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1 month, 5 days remaining')).toBeInTheDocument());
  });

  it('shows the World Reset countdown on the landing page in Hebrew (RTL)', async () => {
    languageState.language = 'he';
    const { container } = await renderLanding([makeTx()]);

    expect(screen.getByText('איפוס העולם')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('נותרו חודש אחד ו-5 ימים')).toBeInTheDocument());

    const section = screen.getByText('איפוס העולם').closest('section');
    expect(section.className).not.toContain('overflow-hidden');
    expect(section.className).not.toContain('overflow-x');
  });

  it('renders a company funds contribution as "contributed to company" (EN), not a property purchase', async () => {
    await renderLanding([
      makeTx({
        type: 'company_funds_contributed',
        price: 200_000,
        company: { name: 'Skyline Holdings' },
        propertyId: null,
      }),
    ]);

    const sentence = screen.getByText((_, el) => clean(el.textContent).includes('orou500 contributed'), {
      selector: 'span',
    });
    expect(clean(sentence.textContent)).toBe('orou500 contributed $200K to Skyline Holdings');
    // Must NOT look like a property purchase.
    expect(screen.queryByText(/bought/i)).toBeNull();
  });

  it('renders a company funds contribution in Hebrew (RTL)', async () => {
    languageState.language = 'he';
    await renderLanding([
      makeTx({
        type: 'company_funds_contributed',
        price: 200_000,
        company: { name: 'Skyline Holdings' },
        propertyId: null,
      }),
    ]);

    const sentence = screen.getByText((_, el) => clean(el.textContent).includes('העביר'), {
      selector: 'span',
    });
    expect(clean(sentence.textContent)).toBe('orou500 העביר $200K ל־Skyline Holdings');
  });

  it('renders a company property purchase separately (EN)', async () => {
    await renderLanding([
      makeTx({
        type: 'company_property_purchase',
        price: 200_000,
        company: { name: 'Skyline Holdings' },
        propertyId: { name: 'Downtown Tower' },
        buyerId: null,
      }),
    ]);

    const sentence = screen.getByText((_, el) => clean(el.textContent).includes('Skyline Holdings acquired'), {
      selector: 'span',
    });
    expect(clean(sentence.textContent)).toBe('Skyline Holdings acquired Downtown Tower for $200K');
  });

  it('shows the By SizOps badge in the hero (EN)', async () => {
    await renderLanding([makeTx()]);

    expect(screen.getByText('By SizOps')).toBeInTheDocument();
  });

  it('shows the By SizOps badge in Hebrew (RTL)', async () => {
    languageState.language = 'he';
    await renderLanding([makeTx()]);

    expect(screen.getByText('מאת SizOps')).toBeInTheDocument();
  });
});
