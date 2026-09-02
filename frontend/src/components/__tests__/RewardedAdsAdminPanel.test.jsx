import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RewardedAdsAdminPanel from '../RewardedAdsAdminPanel';

const DICT = vi.hoisted(() => ({
  'common.loading': 'Loading...',
  'common.previous': 'Previous',
  'common.next': 'Next',
  'admin.noData': 'No data',
  'rewardedAdsAdmin.overviewTitle': 'Rewarded Ads Overview',
  'rewardedAdsAdmin.disabledNotice': 'Ads disabled',
  'rewardedAdsAdmin.sessions': 'Sessions',
  'rewardedAdsAdmin.impressions': 'Impressions',
  'rewardedAdsAdmin.completed': 'Completed',
  'rewardedAdsAdmin.completionRate': 'Completion rate',
  'rewardedAdsAdmin.completionAttempts': 'Attempts',
  'rewardedAdsAdmin.failedCompletions': 'Failed',
  'rewardedAdsAdmin.estimatedRevenue': 'Est. revenue',
  'rewardedAdsAdmin.estimatedSub': 'at ${{cpm}} CPM',
  'rewardedAdsAdmin.realSpend': 'Real spend',
  'rewardedAdsAdmin.range.today': 'Today',
  'rewardedAdsAdmin.range.7d': '7d',
  'rewardedAdsAdmin.range.30d': '30d',
  'rewardedAdsAdmin.range.all': 'All',
  'rewardedAdsAdmin.dailyChartTitle': 'Daily Activity',
  'rewardedAdsAdmin.funnelTitle': 'Completion Funnel',
  'rewardedAdsAdmin.funnelNote': 'note',
  'rewardedAdsAdmin.funnelStarted': 'Started sessions',
  'rewardedAdsAdmin.funnelAttempts': 'Complete attempts',
  'rewardedAdsAdmin.funnelCompleted': 'Completed',
  'rewardedAdsAdmin.funnelRewarded': 'Rewarded',
  'rewardedAdsAdmin.limitsTitle': 'Server Limits',
  'rewardedAdsAdmin.rewardAmount': 'Reward per ad',
  'rewardedAdsAdmin.cooldown': 'Cooldown',
  'rewardedAdsAdmin.dailyLimit': 'Daily limit',
  'rewardedAdsAdmin.sessionTtl': 'Session TTL',
  'rewardedAdsAdmin.cpmTitle': 'Est. CPM',
  'rewardedAdsAdmin.cpmHint': 'hint',
  'rewardedAdsAdmin.cpmInput': 'Estimated CPM',
  'rewardedAdsAdmin.saveCpm': 'Save',
  'rewardedAdsAdmin.cpmSaved': 'Saved.',
  'rewardedAdsAdmin.providerTitle': 'Ad Provider',
  'rewardedAdsAdmin.openDashboard': 'Open publisher dashboard',
  'rewardedAdsAdmin.openHelp': 'Provider help',
  'rewardedAdsAdmin.recentSessions': 'Recent Sessions',
  'rewardedAdsAdmin.statusAll': 'All statuses',
  'rewardedAdsAdmin.statusCompleted': 'Completed',
  'rewardedAdsAdmin.statusPending': 'Pending',
  'rewardedAdsAdmin.statusExpired': 'Expired',
  'rewardedAdsAdmin.statusAborted': 'Aborted',
  'rewardedAdsAdmin.thUser': 'User',
  'rewardedAdsAdmin.thDate': 'Date',
  'rewardedAdsAdmin.thStatus': 'Status',
  'rewardedAdsAdmin.thReward': 'Reward',
  'rewardedAdsAdmin.thImpressions': 'Impr.',
  'rewardedAdsAdmin.thAttempts': 'Attempts',
  'rewardedAdsAdmin.thFailed': 'Failed',
  'rewardedAdsAdmin.pageOf': 'Page {{page}} of {{total}}',
  'rewardedAdsAdmin.status.completed': 'Completed',
  'rewardedAdsAdmin.status.pending': 'Pending',
  'rewardedAdsAdmin.status.expired': 'Expired',
  'rewardedAdsAdmin.status.aborted': 'Aborted',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const t = (key, options = {}) => {
      const template = DICT[key];
      const interpolate = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, name) => options[name] ?? `{{${name}}}`);
      return template === undefined ? key : interpolate(template);
    };
    return { t, i18n: { language: 'en', changeLanguage: vi.fn() } };
  },
}));

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const SUMMARY = {
  ranges: {
    today: {
      totalSessions: 1,
      impressions: 100,
      completionAttempts: 1,
      failedCompletions: 0,
      completed: 1,
      rewarded: 1,
      completionRate: 100,
      estimatedRevenue: 0.2,
      pending: 0,
      expired: 0,
      aborted: 0,
    },
    '7d': {
      totalSessions: 5,
      impressions: 500,
      completionAttempts: 4,
      failedCompletions: 1,
      completed: 3,
      rewarded: 3,
      completionRate: 75,
      estimatedRevenue: 1,
      pending: 1,
      expired: 1,
      aborted: 0,
    },
    '30d': {
      totalSessions: 20,
      impressions: 2000,
      completionAttempts: 15,
      failedCompletions: 3,
      completed: 10,
      rewarded: 10,
      completionRate: 66.7,
      estimatedRevenue: 4,
      pending: 5,
      expired: 5,
      aborted: 0,
    },
    all: {
      totalSessions: 42,
      impressions: 4000,
      completionAttempts: 30,
      failedCompletions: 5,
      completed: 20,
      rewarded: 20,
      completionRate: 66.7,
      estimatedRevenue: 8,
      pending: 10,
      expired: 10,
      aborted: 2,
    },
  },
  spend: { today: 2000, '7d': 6000, '30d': 20000, all: 40000 },
  estimatedCpm: 2,
  limits: { rewardAmount: 2000, cooldownMinutes: 5, dailyLimit: 10, sessionTtlMinutes: 10 },
  provider: {
    provider: 'HilltopAds',
    publisherDashboardUrl: 'https://hilltopads.com/login',
    publisherHelpUrl: 'https://hilltopads.com/faq',
  },
  enabled: true,
};

const DAILY = {
  days: 30,
  points: [
    { date: '2026-09-01', sessions: 1, impressions: 100, completed: 1 },
    { date: '2026-09-02', sessions: 2, impressions: 200, completed: 2 },
  ],
};

const SESSIONS = {
  page: 1,
  totalPages: 1,
  sessions: [
    {
      id: 's1',
      user: 'alice',
      date: '2026-09-02T10:00:00Z',
      status: 'completed',
      rewardAmount: 2000,
      impressions: 1,
      completionAttempts: 1,
      failedCompletions: 0,
    },
    {
      id: 's2',
      user: 'bob',
      date: '2026-09-01T08:00:00Z',
      status: 'expired',
      rewardAmount: 2000,
      impressions: 0,
      completionAttempts: 0,
      failedCompletions: 0,
    },
  ],
};

function routeFetch(overrides = {}) {
  return vi.fn(async (url, options = {}) => {
    const path = String(url);
    const method = (options.method || 'GET').toUpperCase();
    if (path.includes('/admin/rewarded-ads/dashboard')) return jsonResponse(overrides.summary ?? SUMMARY);
    if (path.includes('/admin/rewarded-ads/daily')) return jsonResponse(overrides.daily ?? DAILY);
    if (path.includes('/admin/rewarded-ads/sessions')) return jsonResponse(overrides.sessions ?? SESSIONS);
    if (path.includes('/admin/rewarded-ads/config') && method === 'PUT')
      return jsonResponse({ estimatedCpm: Number(JSON.parse(options.body).estimatedCpm) });
    return jsonResponse({ error: 'not found' }, false, 404);
  });
}

describe('RewardedAdsAdminPanel', () => {
  let originalFetch;
  let originalRO;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.ResizeObserver = originalRO;
    localStorage.removeItem('token');
    vi.restoreAllMocks();
  });

  it('renders the metric grid for the selected range with computed revenue', async () => {
    globalThis.fetch = routeFetch();
    const { getByText, getAllByText, getByDisplayValue } = render(<RewardedAdsAdminPanel />);
    await waitFor(() => expect(getByText('Rewarded Ads Overview')).toBeInTheDocument());
    expect(getAllByText('42').length).toBeGreaterThan(0);
    expect(getByText('4,000')).toBeInTheDocument();
    expect(getAllByText('20').length).toBeGreaterThan(0);
    expect(getAllByText('66.7%').length).toBeGreaterThan(0);
    expect(getByText('$8')).toBeInTheDocument();
    expect(getByText('at $2 CPM')).toBeInTheDocument();
    expect(getByText('$40K')).toBeInTheDocument();
    expect(getByDisplayValue('2')).toBeInTheDocument();
  });

  it('switches ranges and re-renders the metric grid', async () => {
    globalThis.fetch = routeFetch();
    const { getByText, getAllByText } = render(<RewardedAdsAdminPanel />);
    await waitFor(() => expect(getByText('Rewarded Ads Overview')).toBeInTheDocument());
    fireEvent.click(getByText('Today'));
    expect(getAllByText('1').length).toBeGreaterThan(0);
    expect(getAllByText('100').length).toBeGreaterThan(0);
  });

  it('renders the funnel with conversion percentages', async () => {
    globalThis.fetch = routeFetch();
    const { getByText, getAllByText } = render(<RewardedAdsAdminPanel />);
    await waitFor(() => expect(getByText('Completion Funnel')).toBeInTheDocument());
    expect(getByText('Started sessions')).toBeInTheDocument();
    expect(getByText('Complete attempts')).toBeInTheDocument();
    expect(getByText('Rewarded')).toBeInTheDocument();
    expect(getAllByText('66.7%').length).toBeGreaterThan(0);
  });

  it('renders recent sessions table rows and status chips', async () => {
    globalThis.fetch = routeFetch();
    const { getByText } = render(<RewardedAdsAdminPanel />);
    await waitFor(() => expect(getByText('Recent Sessions')).toBeInTheDocument());
    expect(getByText('alice')).toBeInTheDocument();
    expect(getByText('bob')).toBeInTheDocument();
  });

  it('shows the publisher dashboard link pointing at the official URL', async () => {
    globalThis.fetch = routeFetch();
    const { getByText } = render(<RewardedAdsAdminPanel />);
    await waitFor(() => expect(getByText(/Open publisher dashboard/)).toBeInTheDocument());
    const link = getByText(/Open publisher dashboard/);
    expect(link).toHaveAttribute('href', 'https://hilltopads.com/login');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows the disabled notice when ads are disabled', async () => {
    globalThis.fetch = routeFetch({ summary: { ...SUMMARY, enabled: false } });
    const { getByText } = render(<RewardedAdsAdminPanel />);
    await waitFor(() => expect(getByText('Ads disabled')).toBeInTheDocument());
  });

  it('renders an empty state with dashes when there is no data', async () => {
    const empty = {
      ranges: {
        today: {
          totalSessions: 0,
          impressions: 0,
          completionAttempts: 0,
          failedCompletions: 0,
          completed: 0,
          rewarded: 0,
          completionRate: null,
          estimatedRevenue: 0,
          pending: 0,
          expired: 0,
          aborted: 0,
        },
        '7d': {
          totalSessions: 0,
          impressions: 0,
          completionAttempts: 0,
          failedCompletions: 0,
          completed: 0,
          rewarded: 0,
          completionRate: null,
          estimatedRevenue: 0,
          pending: 0,
          expired: 0,
          aborted: 0,
        },
        '30d': {
          totalSessions: 0,
          impressions: 0,
          completionAttempts: 0,
          failedCompletions: 0,
          completed: 0,
          rewarded: 0,
          completionRate: null,
          estimatedRevenue: 0,
          pending: 0,
          expired: 0,
          aborted: 0,
        },
        all: {
          totalSessions: 0,
          impressions: 0,
          completionAttempts: 0,
          failedCompletions: 0,
          completed: 0,
          rewarded: 0,
          completionRate: null,
          estimatedRevenue: 0,
          pending: 0,
          expired: 0,
          aborted: 0,
        },
      },
      spend: { today: 0, '7d': 0, '30d': 0, all: 0 },
      estimatedCpm: 2,
      limits: SUMMARY.limits,
      provider: SUMMARY.provider,
      enabled: true,
    };
    globalThis.fetch = routeFetch({ summary: empty });
    const { getByText, getAllByText } = render(<RewardedAdsAdminPanel />);
    await waitFor(() => expect(getByText('Rewarded Ads Overview')).toBeInTheDocument());
    expect(getAllByText('—').length).toBeGreaterThan(0);
  });

  it('saves the estimated CPM on click', async () => {
    const fetchMock = routeFetch();
    globalThis.fetch = fetchMock;
    const { getByText, getByLabelText, getByDisplayValue } = render(<RewardedAdsAdminPanel />);
    await waitFor(() => expect(getByText('Rewarded Ads Overview')).toBeInTheDocument());
    const input = getByLabelText('Estimated CPM');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(getByText('Save'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/admin/rewarded-ads/config'),
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
    await waitFor(() => expect(getByText('Saved.')).toBeInTheDocument());
    expect(getByDisplayValue('5')).toBeInTheDocument();
  });
});
