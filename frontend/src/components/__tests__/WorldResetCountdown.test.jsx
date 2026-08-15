import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import WorldResetCountdown, { splitDuration } from '../WorldResetCountdown';

const languageState = vi.hoisted(() => ({ language: 'en' }));

const DICT = vi.hoisted(() => ({
  en: {
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
    const dict = DICT[lang] || DICT.en;
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
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000/api',
}));

const MONTH = 30 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function mockStatus(nextResetAtMs) {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ nextResetAt: new Date(nextResetAtMs).toISOString(), seasonTicks: 720 }),
  });
  global.fetch = mock;
  return mock;
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

async function renderCountdown() {
  const utils = render(<WorldResetCountdown />);
  await flush();
  return utils;
}

describe('splitDuration (pure countdown math)', () => {
  it('decomposes a duration into months/days/hours/minutes (30-day months)', () => {
    expect(splitDuration(2 * MONTH + 14 * DAY + 6 * HOUR + 30 * MINUTE)).toEqual({
      months: 2,
      days: 14,
      hours: 6,
      minutes: 30,
    });
    expect(splitDuration(45 * MINUTE)).toEqual({ months: 0, days: 0, hours: 0, minutes: 45 });
    expect(splitDuration(0)).toEqual({ months: 0, days: 0, hours: 0, minutes: 0 });
  });

  it('never returns negative values', () => {
    expect(splitDuration(-5000)).toEqual({ months: 0, days: 0, hours: 0, minutes: 0 });
  });

  it('is timezone-independent: the same UTC instants always produce the same duration', () => {
    // Aug 15 2026 12:00:00Z -> Oct 28 2026 18:00:00Z = 2 months + 14 days + 6 hours exactly.
    const resetAtUtc = Date.UTC(2026, 9, 28, 18, 0, 0);
    const nowUtc = Date.UTC(2026, 7, 15, 12, 0, 0);
    expect(splitDuration(resetAtUtc - nowUtc)).toEqual({ months: 2, days: 14, hours: 6, minutes: 0 });
  });
});

describe('WorldResetCountdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    languageState.language = 'en';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the countdown in English (months/days/hours, minutes hidden above a day)', async () => {
    mockStatus(Date.now() + 2 * MONTH + 14 * DAY + 6 * HOUR + 30 * MINUTE + 30 * 1000);
    await renderCountdown();

    expect(screen.getByText('World Reset')).toBeInTheDocument();
    expect(screen.getByText('2 months, 14 days, 6 hours remaining')).toBeInTheDocument();
  });

  it('renders minutes when the reset is under a day away', async () => {
    mockStatus(Date.now() + 45 * MINUTE + 30 * 1000);
    await renderCountdown();
    expect(screen.getByText('45 minutes remaining')).toBeInTheDocument();
  });

  it('renders the countdown in Hebrew (RTL wording, dual forms)', async () => {
    languageState.language = 'he';
    mockStatus(Date.now() + 2 * MONTH + 14 * DAY + 6 * HOUR + 30 * MINUTE + 30 * 1000);
    await renderCountdown();

    expect(screen.getByText('איפוס העולם')).toBeInTheDocument();
    expect(screen.getByText('נותרו חודשיים, 14 ימים ו-6 שעות')).toBeInTheDocument();
  });

  it('renders Hebrew minutes-only countdown', async () => {
    languageState.language = 'he';
    mockStatus(Date.now() + 45 * MINUTE + 30 * 1000);
    await renderCountdown();
    expect(screen.getByText('נותרו 45 דקות')).toBeInTheDocument();
  });

  it('sets the correct text direction per language', async () => {
    mockStatus(Date.now() + 2 * MONTH);
    const en = await renderCountdown();
    expect(en.container.querySelector('[dir]')).toHaveAttribute('dir', 'ltr');

    languageState.language = 'he';
    mockStatus(Date.now() + 2 * MONTH);
    const he = render(<WorldResetCountdown />);
    await flush();
    expect(he.container.querySelector('[dir]')).toHaveAttribute('dir', 'rtl');
  });

  it('never shows negative time and refetches the world state when the countdown reaches zero', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());
    const nowMs = Date.now();
    const firstFetch = mockStatus(nowMs + 2000); // reset in 2 seconds
    render(<WorldResetCountdown />);
    await flush();
    expect(screen.getByText('less than a minute remaining')).toBeInTheDocument();
    expect(firstFetch).toHaveBeenCalledTimes(1);

    // The second fetch returns the NEXT cycle's reset date (2 months + 1 day + 1 hour away).
    const secondFetch = mockStatus(nowMs + 2 * MONTH + DAY + HOUR);
    await vi.advanceTimersByTimeAsync(2500);
    await flush();

    expect(secondFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2 months, 1 day remaining')).toBeInTheDocument();
    expect(screen.queryByText(/negative/i)).not.toBeInTheDocument();
  });

  it('clamps to the zero label when the reset instant is already in the past', async () => {
    mockStatus(Date.now() - 10000);
    await renderCountdown();
    expect(screen.getByText('less than a minute remaining')).toBeInTheDocument();
  });

  it('keeps the mobile layout wrap-safe without hiding or clipping content', async () => {
    languageState.language = 'he';
    mockStatus(Date.now() + 2 * MONTH + 14 * DAY + 6 * HOUR);
    const { container } = await renderCountdown();

    const root = container.querySelector('[dir="rtl"]');
    expect(root).toHaveClass('flex-wrap', 'min-w-0', 'break-words');
    expect(root.className).not.toContain('overflow-hidden');
    expect(root.className).not.toContain('overflow-x');
  });
});
