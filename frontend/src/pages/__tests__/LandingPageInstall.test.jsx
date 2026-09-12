import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import LandingPage from '../LandingPage';

const languageState = vi.hoisted(() => ({ language: 'en' }));
const ORIGINAL_UA = navigator.userAgent;

const TRANSLATIONS = vi.hoisted(() => ({
  en: {
    'landing.hero.title': 'Build a Global Real Estate Empire',
    'landing.hero.subtitle': 'Buy properties across the world.',
    'landing.hero.cta': 'Start Playing Free',
    'landing.hero.learnMore': 'Learn More',
    'landing.how.title': 'How Does It Work?',
    'landing.how.description': 'Three simple steps.',
    'landing.how.step1.title': 'Buy',
    'landing.how.step1.description': 'Invest.',
    'landing.how.step2.title': 'Grow',
    'landing.how.step2.description': 'Earn.',
    'landing.how.step3.title': 'Build',
    'landing.how.step3.description': 'Develop.',
    'landing.features.title': 'Key Features',
    'landing.features.description': 'Everything you need.',
    'landing.features.globalMap.title': 'Global Map',
    'landing.features.globalMap.description': 'Explore.',
    'landing.features.realEconomy.title': 'Economy',
    'landing.features.realEconomy.description': 'Real.',
    'landing.features.banking.title': 'Banking',
    'landing.features.banking.description': 'Loans.',
    'landing.features.development.title': 'Development',
    'landing.features.development.description': 'Build.',
    'landing.features.multiplayer.title': 'Multiplayer',
    'landing.features.multiplayer.description': 'Compete.',
    'landing.features.worldEvents.title': 'Events',
    'landing.features.worldEvents.description': 'Adapt.',
    'landing.stats.title': 'Live Statistics',
    'landing.stats.players': 'Players',
    'landing.stats.properties': 'Properties',
    'landing.stats.cities': 'Cities',
    'landing.stats.transactions': 'Transactions',
    'landing.stats.worldAge': 'Game Months',
    'landing.leaderboard.title': 'Top Investors',
    'landing.leaderboard.description': 'The wealthiest.',
    'landing.activity.title': 'World Activity',
    'landing.activity.description': 'Recent activity.',
    'landing.activity.buy': '{{buyer}} bought {{property}} for {{amount}}',
    'landing.activity.sell': '{{seller}} sold {{property}} for {{amount}}',
    'landing.activity.companyFundsContributed': '{{buyer}} contributed {{amount}} to {{company}}',
    'landing.activity.companyPropertyPurchase': '{{company}} acquired {{property}} for {{amount}}',
    'landing.activity.missionCompleted': '{{buyer}} completed "{{mission}}"',
    'landing.activity.default': '{{property}} transacted for {{amount}}',
    'landing.cta.title': 'Ready To Build Your Empire?',
    'landing.cta.description': 'Join thousands.',
    'landing.cta.button': 'Create Free Account',
    'landing.community.title': 'Join the CityFlow Community',
    'landing.community.description': 'Connect.',
    'landing.community.button': 'Join Discord',
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
    'pwa.ctaLabel': 'Install App',
    'pwa.title': 'Install CityFlow',
    'pwa.description': 'Get a faster CityFlow in its own window.',
    'pwa.installButton': 'Install',
    'pwa.cancelButton': 'Not Now',
    'pwa.iosTitle': 'Add CityFlow to Your Home Screen',
    'pwa.iosIntro': 'You can install CityFlow on your iPhone from Safari:',
    'pwa.iosStep1': 'Tap the Share button.',
    'pwa.iosStep2': 'Choose “Add to Home Screen”.',
    'pwa.iosStep3': 'Tap “Add”.',
    'pwa.gotItButton': 'Got It',
  },
  he: {
    'pwa.ctaLabel': 'התקנת האפליקציה',
    'pwa.title': 'התקנת CityFlow',
    'pwa.iosTitle': 'הוספת CityFlow למסך הבית',
    'pwa.iosIntro': 'אפשר להתקין את CityFlow באייפון דרך Safari:',
    'pwa.iosStep1': 'הקישו על כפתור השיתוף.',
    'pwa.iosStep2': 'בחרו "הוספה למסך הבית".',
    'pwa.iosStep3': 'הקישו על "הוספה".',
    'pwa.gotItButton': 'הבנתי',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const lang = languageState.language;
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    const t = (key) => dict[key] ?? TRANSLATIONS.en[key] ?? key;
    return { t, i18n: languageState };
  },
  Trans: ({ i18nKey, components }) => {
    const dict = TRANSLATIONS[languageState.language] || TRANSLATIONS.en;
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

vi.mock('../../components/Avatar', () => ({
  default: () => null,
}));

function installMatchMedia(standaloneMatches = false) {
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

function setUserAgent(ua) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true, writable: true });
  Object.defineProperty(window.navigator, 'platform', { value: '', configurable: true, writable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 0, configurable: true, writable: true });
}

function makeInstallPrompt(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt');
  event.preventDefault = vi.fn();
  event.prompt = vi.fn();
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

function stubFetch() {
  global.fetch = vi.fn((url) => {
    const data = String(url).includes('/world/status')
      ? { nextResetAt: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(), seasonTicks: 720 }
      : {
          recentActivity: [],
          topPlayers: [],
          playersCount: 0,
          propertiesCount: 0,
          citiesCount: 0,
          transactionsCount: 0,
        };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  });
}

function renderLanding() {
  const utils = render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
  return utils;
}

describe('Landing Page — PWA install CTA', () => {
  beforeEach(() => {
    installMatchMedia(false);
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    );
    stubFetch();
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
    languageState.language = 'en';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the install CTA as a secondary action when a deferred prompt is captured', async () => {
    stubFetch();
    renderLanding();
    await screen.findByText('Build a Global Real Estate Empire');

    expect(screen.queryByRole('button', { name: 'Install App' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Start Playing Free' })).toBeInTheDocument();
    expect(screen.getByText('Learn More')).toBeInTheDocument();

    const event = makeInstallPrompt();
    await waitFor(() => {
      fireEvent(window, event);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Install App' })).toBeInTheDocument());
  });

  it('opens the install dialog on click and offers Install + Not Now', async () => {
    renderLanding();
    await screen.findByText('Build a Global Real Estate Empire');

    fireEvent(window, makeInstallPrompt());
    const installButton = await screen.findByRole('button', { name: 'Install App' });
    fireEvent.click(installButton);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Install CityFlow' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not Now' })).toBeInTheDocument();
  });

  it('does not duplicate beforeinstallprompt listeners across dialog open/close cycles', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    renderLanding();
    await screen.findByText('Build a Global Real Estate Empire');

    // Open the dialog
    fireEvent(window, makeInstallPrompt());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Install App' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Install App' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Close via Not Now
    fireEvent.click(screen.getByRole('button', { name: 'Not Now' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // Exactly one real beforeinstallprompt listener throughout (from usePwaInstall)
    const adds = addSpy.mock.calls.filter(([type]) => type === 'beforeinstallprompt').length;
    const removes = removeSpy.mock.calls.filter(([type]) => type === 'beforeinstallprompt').length;
    expect(adds).toBe(1);
    expect(removes).toBe(0);
  });

  it('hidden when already installed (standalone)', async () => {
    installMatchMedia(true);
    stubFetch();
    const { container } = renderLanding();
    await waitFor(() => expect(container.querySelector('.flex-1')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Install App' })).toBeNull();
  });

  it('hidden when unsupported (no beforeinstallprompt, not iOS)', async () => {
    stubFetch();
    renderLanding();
    await screen.findByText('Build a Global Real Estate Empire');
    expect(screen.queryByRole('button', { name: 'Install App' })).toBeNull();
  });

  it('iOS shows the install CTA and the honest instructions dialog', async () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    stubFetch();
    renderLanding();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Install App' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Install App' }));
    expect(screen.getByRole('heading', { name: 'Add CityFlow to Your Home Screen' })).toBeInTheDocument();
    expect(screen.getByText('Tap the Share button.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('iOS install dialog is RTL and contains Hebrew strings when language is set', async () => {
    languageState.language = 'he';
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    stubFetch();
    renderLanding();
    await waitFor(() => expect(screen.getByRole('button', { name: 'התקנת האפליקציה' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'התקנת האפליקציה' }));
    expect(screen.getByRole('heading', { name: 'הוספת CityFlow למסך הבית' })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('dir', 'rtl');
  });
});
