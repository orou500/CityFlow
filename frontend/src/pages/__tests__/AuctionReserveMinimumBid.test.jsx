import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AuctionDashboardPage from '../AuctionDashboardPage';

const languageState = vi.hoisted(() => ({ language: 'en' }));
const EN = vi.hoisted(() => ({
  'auctions.reserve': 'Reserve',
  'auctions.reserveMet': 'Reserve met',
  'auctions.reserveNotMet': 'Reserve not met',
  'auctions.minimumWinningBid': 'Min. to win',
  'auctions.needMoreToReserve': 'You need {{amount}} more to reach the reserve',
  'auctions.gapToReserve': '▲ {{amount}} more to reach the reserve',
  'auctions.endedReserveNotMet': 'Auction ended — the reserve price was not met, so no sale occurred.',
  'auctions.endedNoWinner': 'Auction ended without a winner. Reserved funds have been released.',
  'auctions.reservePrice': 'Reserve Price',
  'auctions.type': 'Type',
  'auctions.source': 'Source',
  'auctions.minNextBid': 'Min. next bid',
  'auctions.bidTooLow': 'Minimum bid is {{min}}',
  'auctions.placeBid': 'Place Bid',
  'auctions.bidding': 'Bidding…',
  'auctions.availableBalance': 'Available balance',
  'errors.reserveMinimumBid': 'Minimum bid to win this reserve auction is ${{amount}}',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options = {}) => {
      const template = EN[key];
      const interpolate = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, name) => options[name] ?? `{{${name}}}`);
      return template === undefined ? key : interpolate(template);
    },
    i18n: languageState,
  }),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'auction1' }),
  Link: ({ children }) => children,
}));

const authState = vi.hoisted(() => ({
  user: { _id: 'user1', username: 'tester', balance: 5000000, reservedAuctionFunds: 0 },
}));
vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector) => selector(authState),
}));

vi.mock('../../hooks/useSocket', () => ({
  useSocket: () => {},
  useSocketEvent: () => {},
}));

vi.mock('../../i18n/errors', () => ({
  translateError: (msg) => msg,
}));

vi.mock('../../components/PropertyImage', () => ({ default: () => <div data-testid="prop-image" /> }));
vi.mock('../../components/AuctionTimeLeft', () => ({ default: () => <span>TIMELEFT</span> }));

const RESERVE_AUCTION = {
  _id: 'auction1',
  status: 'active',
  auctionType: 'reserve',
  reservePrice: 4488890,
  reserveMet: false,
  minimumWinningBid: 4488890,
  startingBid: 3927779,
  bidIncrement: 196388,
  currentBid: 4124167,
  currentBidderId: { _id: 'bidder9', username: 'rival' },
  totalBids: 3,
  uniqueBidders: 2,
  sellerType: 'bank',
  sellerId: { _id: 'bank1', username: null },
  activity: [],
  endTick: 110,
  currentTick: 100,
  remainingMonths: 2,
  winnerId: null,
  property: { _id: 'prop1', name: 'Eco-Luxury Tower' },
};

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function routeFetch(overrides = {}) {
  return vi.fn(async (url, options = {}) => {
    let path = String(url);
    if (path.includes('/api')) path = path.slice(path.lastIndexOf('/api') + '/api'.length);
    if (!path.startsWith('/')) path = `/${path}`;
    if (path === '/auctions/auction1') return jsonResponse({ success: true, auction: overrides.detail ?? RESERVE_AUCTION });
    if (path.includes('/auctions/reputation/')) return jsonResponse({ reputation: overrides.reputation ?? { score: 3 } });
    if (path.includes('/auctions/featured')) return jsonResponse({ auctions: [] });
    return jsonResponse({ error: 'not found' }, false, 404);
  });
}

describe('AuctionDashboardPage — reserve minimum bid', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows reserved not-met + minimum winning bid on the detail view', async () => {
    globalThis.fetch = routeFetch();
    const { getAllByText } = render(<AuctionDashboardPage />);
    await waitFor(() => {
      expect(getAllByText(/Reserve not met/).length).toBeGreaterThan(0);
    });
    expect(getAllByText(/Min\. to win/).length).toBeGreaterThan(0);
    expect(getAllByText(/\$4\.5M/).length).toBeGreaterThan(0);
  });

  it('shows the gap needed to reach the reserve in the bid form', async () => {
    globalThis.fetch = routeFetch();
    const { getAllByText } = render(<AuctionDashboardPage />);
    // gap = minToWin(4,488,890) - minNextBid(4,124,167 + 196,388 = 4,320,555) = 168,335 -> "$168.3K".
    await waitFor(() => {
      expect(getAllByText(/need \$168\.3K/).length).toBeGreaterThan(0);
      expect(getAllByText(/\$168\.3K/).length).toBeGreaterThan(0);
    });
  });

  it('blocks a bid below the minimum winning bid with the reserve-localized error', async () => {
    const fetchMock = routeFetch();
    globalThis.fetch = fetchMock;
    const { getAllByText, getByPlaceholderText, container } = render(<AuctionDashboardPage />);

    await waitFor(() => {
      expect(getAllByText(/Reserve not met/).length).toBeGreaterThan(0);
    });

    const input = getByPlaceholderText('4,488,890');
    fireEvent.change(input, { target: { value: '4000000' } });

    const bidButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Place Bid');
    expect(bidButton).toBeTruthy();
    fireEvent.click(bidButton);

    await waitFor(() =>
      expect(getAllByText('Minimum bid to win this reserve auction is $4,488,890').length).toBeGreaterThan(0),
    );
    // The below-reserve bid must never be sent to the server.
    expect(
      fetchMock.mock.calls.some(
        ([url, opts = {}]) => String(url).includes('/auctions/auction1/bid') && (opts.method || 'GET') === 'POST',
      ),
    ).toBe(false);
  });

  it('renders the reserve-met state once the reserve is met (next-bid rule)', async () => {
    const metAuction = {
      ...RESERVE_AUCTION,
      reserveMet: true,
      minimumWinningBid: 4320555,
      currentBid: 4124167,
    };
    globalThis.fetch = routeFetch({ detail: metAuction });
    const { getAllByText, queryAllByText, getByText } = render(<AuctionDashboardPage />);
    await waitFor(() => {
      expect(getAllByText(/Reserve met/).length).toBeGreaterThan(0);
    });
    expect(queryAllByText(/Reserve not met/).length).toBe(0);
    expect(getByText(/Min\. next bid/)).toBeInTheDocument();
  });

  it('shows the reserve-not-met ended notice for an ended reserve auction with no winner', async () => {
    const endedReserve = { ...RESERVE_AUCTION, status: 'ended', winnerId: null, reserveMet: false };
    globalThis.fetch = routeFetch({ detail: endedReserve });
    const { getAllByText } = render(<AuctionDashboardPage />);
    await waitFor(() => {
      expect(
        getAllByText(/Auction ended — the reserve price was not met, so no sale occurred\./).length,
      ).toBeGreaterThan(0);
    });
  });
});