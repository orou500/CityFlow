import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import SupporterStylePage from '../SupporterStylePage';

function renderPage(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const languageState = vi.hoisted(() => ({ language: 'en' }));

const EN = {
  'common.save': 'Save',
  'common.reset': 'Reset',
  'common.loading': 'Loading�¦',
  'common.error': 'Something went wrong',
  'supporterIdentity.pageTitle': 'Supporter Style',
  'supporterIdentity.subtitle': 'Personalize your identity.',
  'supporterIdentity.learnSupport': 'Learn how to unlock',
  'supporterIdentity.customize': 'Customize',
  'supporterIdentity.lockedTitle': 'Premium identity customization',
  'supporterIdentity.lockedDescription': 'Support CityFlow to unlock cosmetics.',
  'supporterIdentity.donateCta': 'Support CityFlow',
  'supporterIdentity.livePreview': 'Live Preview',
  'supporterIdentity.saved': 'Your style has been saved.',
  'supporterIdentity.resetDone': 'Your style has been reset.',
  'supporterIdentity.saving': 'Saving...',
  'supporterIdentity.locked': 'Locked',
  'supporterIdentity.presets': 'Presets',
  'supporterIdentity.username': 'Username',
  'supporterIdentity.profile': 'Profile',
  'supporterIdentity.identity': 'Identity',
  'supporterIdentity.tierLabel': 'Tier',
  'supporterIdentity.supporterSince': 'Supporter since',
  'supporterIdentity.badgeLabel': 'Badge',
  'supporterIdentity.badgeTitle': 'Supporter',
  'supporterIdentity.colorHeading': 'Color',
  'supporterIdentity.gradientHeading': 'Gradient',
  'supporterIdentity.animation': 'Animation',
  'supporterIdentity.animationStatic': 'Static',
  'supporterIdentity.animationAnimated': 'Animated',
  'supporterIdentity.avatarFrameHeading': 'Avatar Frame',
  'supporterIdentity.usernameEffect': 'Username Effect',
  'supporterIdentity.profileBackground': 'Background',
  'supporterIdentity.backgroundEffectHeading': 'Background Effect',
  'supporterIdentity.profileBorder': 'Border',
  'supporterIdentity.badgeHeading': 'Badge',
  'supporterIdentity.titleHeading': 'Title',
  'supporterIdentity.tier.none': 'None',
  'supporterIdentity.tier.supporter': 'Supporter',
  'supporterIdentity.tier.early_supporter': 'Bronze Supporter',
  'supporterIdentity.tier.founding_supporter': 'Platinum Supporter',
  'supporterIdentity.color.cityflow_blue': 'CityFlow Blue',
  'supporterIdentity.color.cityflow_cyan': 'CityFlow Cyan',
  'supporterIdentity.color.cityflow_orange': 'CityFlow Orange',
  'supporterIdentity.color.purple': 'Purple',
  'supporterIdentity.color.red': 'Red',
  'supporterIdentity.color.green': 'Green',
  'supporterIdentity.color.gold': 'Gold',
  'supporterIdentity.color.white': 'White',
  'supporterIdentity.gradient.none': 'Static',
  'supporterIdentity.gradient.cityflow_ocean': 'CityFlow Ocean',
  'supporterIdentity.gradient.ocean_dream': 'Ocean Dream',
  'supporterIdentity.gradient.sunset': 'Sunset',
  'supporterIdentity.gradient.royal': 'Royal',
  'supporterIdentity.gradient.neon': 'Neon',
  'supporterIdentity.gradient.empyrean': 'Empyrean',
  'supporterIdentity.effect.none': 'None',
  'supporterIdentity.effect.soft_glow': 'Soft Glow',
  'supporterIdentity.effect.glow': 'Glow',
  'supporterIdentity.effect.shimmer': 'Shimmer',
  'supporterIdentity.effect.pulse': 'Pulse',
  'supporterIdentity.effect.gradient_flow': 'Gradient Flow',
  'supporterIdentity.background.none': 'None',
  'supporterIdentity.background.midnight_city': 'Midnight City',
  'supporterIdentity.background.blue_horizon': 'Blue Horizon',
  'supporterIdentity.background.financial_district': 'Financial District',
  'supporterIdentity.background.neon_metro': 'Neon Metro',
  'supporterIdentity.background.sunset_skyline': 'Sunset Skyline',
  'supporterIdentity.background.ocean_city': 'Ocean City',
  'supporterIdentity.background.corporate_black': 'Corporate Black',
  'supporterIdentity.background.global_empire': 'Global Empire',
  'supporterIdentity.background.golden_hour': 'Golden Hour',
  'supporterIdentity.background.deep_space': 'Deep Space',
  'supporterIdentity.backgroundEffect.none': 'None',
  'supporterIdentity.backgroundEffect.gradient': 'Gradient',
  'supporterIdentity.backgroundEffect.animated_gradient': 'Animated Gradient',
  'supporterIdentity.backgroundEffect.city_lights': 'City Lights',
  'supporterIdentity.backgroundEffect.particles': 'Particles',
  'supporterIdentity.backgroundEffect.grid': 'Grid',
  'supporterIdentity.backgroundEffect.light_streaks': 'Light Streaks',
  'supporterIdentity.backgroundEffect.skyline': 'Skyline',
  'supporterIdentity.backgroundEffect.glass': 'Glass',
  'supporterIdentity.border.none': 'None',
  'supporterIdentity.border.cityflow_blue': 'CityFlow Blue',
  'supporterIdentity.border.cyan': 'Cyan',
  'supporterIdentity.border.purple': 'Purple',
  'supporterIdentity.border.gold': 'Gold',
  'supporterIdentity.border.platinum': 'Platinum',
  'supporterIdentity.border.animated_gradient': 'Animated Gradient',
  'supporterIdentity.avatarFrame.none': 'None',
  'supporterIdentity.avatarFrame.blue_glow': 'Blue Glow',
  'supporterIdentity.avatarFrame.cyan_ring': 'Cyan Ring',
  'supporterIdentity.avatarFrame.gold_ring': 'Gold Ring',
  'supporterIdentity.avatarFrame.gradient_ring': 'Gradient Ring',
  'supporterIdentity.avatarFrame.animated_ring': 'Animated Ring',
  'supporterIdentity.avatarFrame.premium_frame': 'Premium Frame',
  'supporterIdentity.badge.none': 'None',
  'supporterIdentity.badge.supporter': 'Supporter',
  'supporterIdentity.badge.early_supporter': 'Bronze Supporter',
  'supporterIdentity.badge.founding_supporter': 'Platinum Supporter',
  'supporterIdentity.title.none': 'None',
  'supporterIdentity.title.supporter': 'Supporter',
  'supporterIdentity.title.city_builder': 'City Builder',
  'supporterIdentity.title.urban_investor': 'Urban Investor',
  'supporterIdentity.title.empire_builder': 'Empire Builder',
  'supporterIdentity.title.global_developer': 'Global Developer',
  'supporterIdentity.title.market_mogul': 'Market Mogul',
  'supporterIdentity.title.cityflow_founder': 'CityFlow Founder',
  'supporterIdentity.preset.cityflow': 'CityFlow',
  'supporterIdentity.preset.executive': 'Executive',
  'supporterIdentity.preset.ocean': 'Ocean',
  'supporterIdentity.preset.sunset': 'Sunset',
  'supporterIdentity.preset.royal': 'Royal',
  'supporterIdentity.preset.neon': 'Neon',
  'supporterIdentity.preset.empire': 'Empire',
  'supporterIdentity.aboutTitle': 'Your identity, your style',
  'supporterIdentity.aboutDescription': 'Personalize how you appear across CityFlow.',
  'supporterIdentity.aboutItems': 'You can customize:',
  'supporterIdentity.itemUsername': 'Username appearance',
  'supporterIdentity.itemProfile': 'Profile background and border',
  'supporterIdentity.itemAvatar': 'Avatar frame and effects',
  'supporterIdentity.itemIdentity': 'Supporter badge and title',
  'supporterIdentity.visualOnlyNote':
    'Supporter cosmetics are visual only and never affect gameplay, economy, rankings, or competitive advantages.',
  'supporterIdentity.tourReplay': 'Supporter guide',
  'supporterIdentity.donateAgain': 'Support CityFlow again',
  'supporterIdentity.onboarding.welcomeTitle': "You're now a CityFlow Supporter!",
  'supporterIdentity.onboarding.welcomeCta': 'Customize My Profile',
  'supporterIdentity.onboarding.notNow': 'Not now',
  'supporterIdentity.onboarding.skip': 'Skip',
  'supporterIdentity.onboarding.next': 'Next',
  'supporterIdentity.onboarding.done': 'Done',
  'supporterIdentity.onboarding.step1Title': 'Customize your username',
  'supporterIdentity.onboarding.step1Description': 'Pick a color, gradient or glow for your username.',
  'supporterIdentity.onboarding.step2Title': 'Customize your profile background',
  'supporterIdentity.onboarding.step2Description': 'Choose a background for your profile page.',
  'supporterIdentity.onboarding.step3Title': 'Customize your avatar',
  'supporterIdentity.onboarding.step3Description': 'Add a frame or ring around your avatar.',
  'supporterIdentity.onboarding.step4Title': 'Choose your supporter badge and title',
  'supporterIdentity.onboarding.step4Description': 'Show off your supporter tier.',
  'supporterIdentity.onboarding.step5Title': 'Save your style',
  'supporterIdentity.onboarding.step5Description': 'Save — your identity updates across CityFlow.',
  'onboarding.tour.progress': '{{current}}/{{total}}',
};

const HE = Object.fromEntries(Object.keys(EN).map((k) => [k, `עברית ${k.split('.').pop()}`]));
Object.assign(HE, {
  'common.save': 'שמור',
  'common.reset': 'איפוס',
  'common.loading': 'טוען...',
  'supporterIdentity.pageTitle': 'סגנון התומך',
  'supporterIdentity.title.global_developer': 'מפתח גלובלי',
  'supporterIdentity.title.city_builder': 'בונה ערים',
  'supporterIdentity.title.urban_investor': 'משקיע עירוני',
  'supporterIdentity.title.empire_builder': 'בונה אימפריות',
  'supporterIdentity.title.market_mogul': 'טייקון שוק',
  'supporterIdentity.title.cityflow_founder': 'מייסד CityFlow',
  'supporterIdentity.title.supporter': 'תומך',
  'supporterIdentity.titleHeading': 'תואר',
  'supporterIdentity.tier.supporter': 'תומך',
  'supporterIdentity.badge.supporter': 'תומך',
  'supporterIdentity.color.cityflow_blue': 'כחול CityFlow',
  'supporterIdentity.preset.cityflow': 'CityFlow',
  'supporterIdentity.onboarding.step1Title': 'התאם אישית את שם המשתמש',
  'supporterIdentity.onboarding.step2Title': 'התאם אישית את רקע הפרופיל',
  'supporterIdentity.onboarding.step3Title': 'התאם אישית את האווטאר',
  'supporterIdentity.onboarding.step4Title': 'בחר תג ותואר',
  'supporterIdentity.onboarding.step5Title': 'שמור את הסגנון',
});

const DICT = { en: EN, he: HE };

const tFn = vi.hoisted(() => {
  return (key, options = {}) => {
    const dict = DICT[languageState.language] || DICT.en;
    const template = dict[key];
    const interpolate = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, name) => options[name] ?? `{{${name}}`);
    return template === undefined ? key : interpolate(template);
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tFn, i18n: languageState }),
}));

const storeState = vi.hoisted(() => ({
  user: { _id: 'u1', username: 'alice', displayName: 'Alice' },
  fetchMe: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector) => selector(storeState),
}));

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function routeFetch(overrides = {}) {
  return vi.fn(async (url, options = {}) => {
    const path = String(url).replace(/^.*\/api/, '/api');
    const method = (options.method || 'GET').toUpperCase();
    if (path.endsWith('/supporter-identity/me') && method === 'GET')
      return jsonResponse(overrides.me ?? { identity: overrides.meIdentity ?? {}, editable: true });
    if (path.endsWith('/supporter-identity/me') && method === 'PUT')
      return jsonResponse({ identity: overrides.savedIdentity ?? {}, editable: true });
    if (path.endsWith('/supporter-identity/me/reset') && method === 'POST')
      return jsonResponse({ identity: { tier: overrides.resetTier ?? 'supporter' }, editable: true });
    if (path.endsWith('/supporter-identity/onboarding') && method === 'GET')
      return jsonResponse(overrides.onboarding ?? { status: 'none', supporter: true });
    if (path.endsWith('/supporter-identity/onboarding/complete') && method === 'POST')
      return jsonResponse({ status: 'completed' });
    if (path.endsWith('/supporter-identity/onboarding/skip') && method === 'POST')
      return jsonResponse({ status: 'skipped' });
    return jsonResponse({ error: 'not found' });
  });
}

describe('SupporterStylePage', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    storeState.fetchMe.mockClear();
  });

  it('renders the live preview and customization panel for an editable supporter', async () => {
    globalThis.fetch = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { usernameStyle: { type: 'static', color: 'cityflowBlue', animated: false } },
      },
    });
    const { getByText, container } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('Supporter Style')).toBeInTheDocument());
    expect(getByText('Live Preview')).toBeInTheDocument();
    expect(getByText('Alice')).toBeInTheDocument();
    expect(container.querySelector('.si-avatar')).toBeNull();
    expect(getByText('Save')).toBeInTheDocument();
    expect(getByText('Reset')).toBeInTheDocument();
  });

  it('shows the locked CTA for a non-supporter and hides the save buttons', async () => {
    globalThis.fetch = routeFetch({ me: { identity: { tier: 'none' }, editable: false } });
    const { getByText, queryByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('Premium identity customization')).toBeInTheDocument());
    expect(getByText('Support CityFlow')).toBeInTheDocument();
    expect(queryByText('Save')).toBeNull();
    expect(queryByText('Reset')).toBeNull();
  });

  it('applies the selected avatar frame to the preview avatar', async () => {
    globalThis.fetch = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: {
          avatarFrame: 'blue_glow',
          usernameStyle: { type: 'static', color: 'cityflowBlue', animated: false },
        },
      },
    });
    const { container } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(container.querySelector('.si-avatar')?.className).toContain('si-avatar-blue-glow'));
  });

  it('does not apply a frame when avatarFrame is none', async () => {
    globalThis.fetch = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { avatarFrame: 'none', usernameStyle: { type: 'static', color: 'cityflowBlue', animated: false } },
      },
    });
    const { container } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(container.querySelector('.si-avatar')).toBeNull());
  });

  it('saves cosmetics via PUT and shows the saved message', async () => {
    const fetchMock = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { usernameStyle: { type: 'static', color: 'cityflowBlue', animated: false } },
      },
    });
    globalThis.fetch = fetchMock;
    const { getByText, findByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('Save')).toBeInTheDocument());
    fireEvent.click(getByText('Save'));
    expect(await findByText('Your style has been saved.')).toBeInTheDocument();
    const putCall = fetchMock.mock.calls.find(
      ([url, opts = {}]) => String(url).endsWith('/supporter-identity/me') && (opts.method || 'GET') === 'PUT',
    );
    expect(putCall).toBeTruthy();
    expect(storeState.fetchMe).toHaveBeenCalled();
  });

  it('resets cosmetics via POST and shows the reset message', async () => {
    const fetchMock = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { usernameStyle: { type: 'static', color: 'cityflowBlue', animated: false } },
      },
    });
    globalThis.fetch = fetchMock;
    const { getByText, findByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('Reset')).toBeInTheDocument());
    fireEvent.click(getByText('Reset'));
    expect(await findByText('Your style has been reset.')).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(
      ([url, opts = {}]) => String(url).endsWith('/supporter-identity/me/reset') && (opts.method || 'GET') === 'POST',
    );
    expect(postCall).toBeTruthy();
  });

  it('link to the donate page when locked for a non-supporter', async () => {
    globalThis.fetch = routeFetch({ me: { identity: { tier: 'none' }, editable: false } });
    const { container } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(container.querySelector('a[href="/donate"]')).toBeInTheDocument());
  });

  it('explains what Supporter Style does and that cosmetics are visual only', async () => {
    globalThis.fetch = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { usernameStyle: { type: 'static', color: 'cityflowBlue', animated: false } },
      },
    });
    const { getByText, getByTestId } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('Your identity, your style')).toBeInTheDocument());
    expect(getByTestId('supporter-about')).toBeInTheDocument();
    expect(getByText('You can customize:')).toBeInTheDocument();
    expect(getByText('Username appearance')).toBeInTheDocument();
    expect(getByText('Profile background and border')).toBeInTheDocument();
    expect(getByText('Avatar frame and effects')).toBeInTheDocument();
    expect(getByText('Supporter badge and title')).toBeInTheDocument();
    expect(
      getByText(
        'Supporter cosmetics are visual only and never affect gameplay, economy, rankings, or competitive advantages.',
      ),
    ).toBeInTheDocument();
  });

  it('preview uses the shared identity card renderer (UserIdentity)', async () => {
    globalThis.fetch = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: {
          usernameStyle: { type: 'gradient', color: 'cityflowCyan', gradient: 'neon', animated: true },
          avatarFrame: 'premium_frame',
          badge: 'supporter',
          title: 'cityBuilder',
        },
      },
    });
    const { container } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(container.querySelector('[data-testid="user-identity-card"]')).toBeInTheDocument());
    const frame = container.querySelector('.si-avatar-premium-frame');
    expect(frame).toBeTruthy();
    const animated = container.querySelector('.si-username-animated');
    expect(animated).toBeTruthy();
  });

  it('replay button opens the supporter guide tour', async () => {
    globalThis.fetch = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { usernameStyle: { type: 'static', color: 'cityflowBlue', animated: false } },
      },
    });
    const { getByText, getByTestId } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('Supporter guide')).toBeInTheDocument());
    fireEvent.click(getByText('Supporter guide'));
    expect(getByTestId('supporter-tour')).toBeInTheDocument();
    expect(getByText('Customize your username')).toBeInTheDocument();
  });

  it('auto-opens the tour when server onboarding state is pending', async () => {
    globalThis.fetch = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { usernameStyle: { type: 'static', color: 'cityflowBlue', animated: false } },
      },
      onboarding: { status: 'pending', supporter: true },
    });
    const { getByTestId, findByText } = renderPage(<SupporterStylePage />);
    expect(await findByText('Customize your username')).toBeInTheDocument();
    expect(getByTestId('supporter-tour')).toBeInTheDocument();
  });

  it('tour Done completes the onboarding server-side', async () => {
    const fetchMock = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { usernameStyle: { type: 'static', color: 'cityflowBlue', animated: false } },
      },
      onboarding: { status: 'pending', supporter: true },
    });
    globalThis.fetch = fetchMock;
    const { getByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('Customize your username')).toBeInTheDocument());
    for (let i = 0; i < 4; i += 1) fireEvent.click(getByText('Next'));
    fireEvent.click(getByText('Done'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, opts = {}]) =>
        String(url).endsWith('/supporter-identity/onboarding/complete'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('tour Skip marks onboarding as skipped server-side', async () => {
    const fetchMock = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { usernameStyle: { type: 'static', color: 'cityflowBlue', animated: false } },
      },
      onboarding: { status: 'pending', supporter: true },
    });
    globalThis.fetch = fetchMock;
    const { getByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('Customize your username')).toBeInTheDocument());
    fireEvent.click(getByText('Skip'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, opts = {}]) =>
        String(url).endsWith('/supporter-identity/onboarding/skip'),
      );
      expect(call).toBeTruthy();
    });
  });

  /* ============================================================
     Localization regression suite — zero raw translation keys.
     ============================================================ */

  const RAW_KEY_RE = /supporterIdentity\.[a-zA-Z0-9_.]+/;

  const supporterIdentity = {
    tier: 'supporter',
    cosmetics: {
      usernameStyle: { type: 'gradient', color: 'cityflow_cyan', gradient: 'neon', animated: true },
      usernameEffect: 'glow',
      profileBackground: 'neon_metro',
      profileBackgroundEffect: 'animated_gradient',
      profileBorder: 'gold',
      avatarFrame: 'premium_frame',
      badge: 'early_supporter',
      title: 'global_developer',
    },
  };

  it('TEST 1: English render — no raw translation keys, title human-readable, buttons localized', async () => {
    languageState.language = 'en';
    globalThis.fetch = routeFetch({ meIdentity: supporterIdentity });
    const { container, getByText, getAllByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('Supporter Style')).toBeInTheDocument());

    // The reported bug: global_developer must render as a human-readable title.
    expect(getAllByText('Global Developer').length).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    if (container.textContent.includes('global_developer')) {
      const idx = container.textContent.indexOf('global_developer');
      console.log('RAW CONTEXT:', JSON.stringify(container.textContent.slice(Math.max(0, idx - 60), idx + 80)));
    }
    expect(container.textContent).not.toContain('global_developer');
    // eslint-disable-next-line no-console
    if (container.textContent.includes('supporterIdentity.')) {
      const idx = container.textContent.indexOf('supporterIdentity.');
      console.log('RAW2:', JSON.stringify(container.textContent.slice(Math.max(0, idx - 60), idx + 90)));
    }
    expect(container.textContent).not.toContain('supporterIdentity.');
    // Buttons have localized visible text.
    expect(getByText('Save')).toBeInTheDocument();
    expect(getByText('Reset')).toBeInTheDocument();
    expect(getByText('Supporter guide')).toBeInTheDocument();
  });

  it('TEST 2: Hebrew render — no raw keys, title translated, buttons localized', async () => {
    languageState.language = 'he';
    globalThis.fetch = routeFetch({ meIdentity: supporterIdentity });
    const { container, getByText, getAllByText, queryByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('סגנון התומך')).toBeInTheDocument());

    expect(getAllByText('מפתח גלובלי').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('global_developer');
    expect(container.textContent).not.toContain('supporterIdentity.');
    // Buttons render Hebrew text.
    expect(getByText('שמור')).toBeInTheDocument();
    expect(getByText('איפוס')).toBeInTheDocument();
    expect(queryByText('Save')).toBeNull();
    languageState.language = 'en';
  });

  it('TEST 3: switching English → Hebrew updates the rendered labels', async () => {
    languageState.language = 'en';
    globalThis.fetch = routeFetch({ meIdentity: supporterIdentity });
    const { rerender, getByText, getAllByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getByText('Supporter Style')).toBeInTheDocument());
    expect(getAllByText('Global Developer').length).toBeGreaterThan(0);

    languageState.language = 'he';
    rerender(
      <MemoryRouter>
        <SupporterStylePage />
      </MemoryRouter>,
    );
    expect(getAllByText('מפתח גלובלי').length).toBeGreaterThan(0);
    expect(getByText('שמור')).toBeInTheDocument();
    languageState.language = 'en';
  });

  it('TEST 4: supporter title global_developer resolves in BOTH languages', async () => {
    languageState.language = 'en';
    globalThis.fetch = routeFetch({ meIdentity: supporterIdentity });
    const { container, getAllByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(getAllByText('Global Developer').length).toBeGreaterThan(0));
    expect(container.textContent).not.toContain('global_developer');

    languageState.language = 'he';
    const { container: heContainer, getAllByText: heGetAllByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(heGetAllByText('מפתח גלובלי').length).toBeGreaterThan(0));
    expect(heContainer.textContent).not.toContain('global_developer');
    languageState.language = 'en';
  });

  it('TEST 5: unknown supporter title — safe fallback, no crash, no raw id', async () => {
    languageState.language = 'en';
    globalThis.fetch = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { ...supporterIdentity.cosmetics, title: 'founder_unknown_99' },
      },
    });
    const { container, queryByText } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(container.textContent).not.toContain('supporterIdentity.'));
    expect(queryByText('supporterIdentity.title.founder_unknown_99')).toBeNull();
    expect(container.textContent).not.toContain('founder_unknown_99');
    // Safe localized fallback is displayed ('Supporter' — the title fallback).
    expect(container.textContent).toContain('Supporter');
    languageState.language = 'en';
  });

  it('TEST 6: entire rendered DOM contains no raw translation keys', async () => {
    languageState.language = 'en';
    globalThis.fetch = routeFetch({ meIdentity: supporterIdentity });
    const { container } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(container.textContent).not.toMatch(RAW_KEY_RE));
    // i18n namespaces that must never leak as raw text (a sentence-ending
    // dot + word is NOT a leak — only dotted namespace prefixes are).
    for (const prefix of ['supporterIdentity.', 'common.', 'onboarding.', 'button.', 'label.', 'error.']) {
      expect(container.textContent).not.toContain(prefix);
    }
    languageState.language = 'en';
  });

  it('badge icons render canonical emoji, never mojibake (TEST 5/8)', async () => {
    languageState.language = 'en';
    globalThis.fetch = routeFetch({
      meIdentity: {
        tier: 'founding_supporter',
        cosmetics: {
          ...supporterIdentity.cosmetics,
          badge: 'founding_supporter',
          title: 'global_developer',
        },
      },
    });
    const { container } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(container.textContent).toContain('Global Developer'));

    // The three badge tier icons (from the canonical BADGES map).
    expect(container.textContent).toContain('❤️');
    expect(container.textContent).toContain('💎');
    expect(container.textContent).toContain('⭐');
    // About card art.
    expect(container.textContent).toContain('🎨');
    // Lock icon renders on tier-locked options (lower tier).
    globalThis.fetch = routeFetch({
      meIdentity: {
        tier: 'supporter',
        cosmetics: { usernameStyle: { type: 'static', color: 'cityflow_blue', animated: false } },
      },
    });
    const { container: lockedContainer } = renderPage(<SupporterStylePage />);
    await waitFor(() => expect(lockedContainer.textContent).toContain('🔒'));
    // Preview badge symbol for the selected founding badge.
    expect(container.querySelector('[data-badge="founding_supporter"]')?.textContent).toContain('✨');
    // The preview title resolves (no raw id, no mojibake).
    expect(container.textContent).not.toContain('â');
    expect(container.textContent).not.toContain('ð');
    expect(container.textContent).not.toContain('\uFFFD');
    expect(container.textContent).not.toContain('global_developer');
    languageState.language = 'en';
  });
});
