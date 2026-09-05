import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import UserProfilePage from '../UserProfilePage';

const authState = vi.hoisted(() => ({
  user: { _id: 'user1', username: 'me', role: 'user' },
  token: 'test-token',
}));

const gameState = vi.hoisted(() => ({
  fetchPlayerSeasonHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: Object.assign((selector) => (selector ? selector(authState) : authState), {
    getState: () => authState,
  }),
  __esModule: true,
}));

vi.mock('../../store/useGameStore', () => ({
  useGameStore: Object.assign((selector) => (selector ? selector(gameState) : gameState), {
    getState: () => gameState,
  }),
  __esModule: true,
}));

const translations = vi.hoisted(() => ({
  'profile.portfolio': 'Portfolio',
  'profile.joined': 'Joined',
  'profile.activity': 'Activity',
  'property.apartment': 'Apartment',
  'property.house': 'House',
  'property.commercial': 'Commercial',
  'property.land': 'Land',
  'general.period': 'month',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => translations[key] || opts?.defaultValue || key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000/api',
  getAvatarUrl: () => '',
}));

vi.mock('../../hooks/useNativeAvatarUrl', () => ({
  default: () => '',
}));

vi.mock('../../components/PropertyImage', () => ({
  default: ({ property, alt, className }) => (
    <img
      data-testid={`property-image-${property._id}`}
      alt={alt || property.name}
      className={className}
      src="img.png"
    />
  ),
}));

vi.mock('../../components/CompactValue', () => ({
  default: () => null,
}));

const LONG_NAME = 'Luxury Commercial Tower Downtown International Business District Office Complex';
const properties = [
  {
    _id: 'p1',
    name: LONG_NAME,
    type: 'commercial',
    currentPrice: 125000000,
    rent: 12500000,
    cityId: { name: 'Tel Aviv' },
  },
  { _id: 'p2', name: 'Apartment', type: 'apartment', currentPrice: 1250, rent: 125, cityId: null },
];

function renderProfile(overrides = {}) {
  const profile = {
    user: { _id: 'user1', username: 'me', displayName: 'Me', bio: '', level: 1, xp: 0 },
    transactions: [],
    properties,
    ...overrides,
  };
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(profile) });
  return render(
    <MemoryRouter initialEntries={['/profile/me']}>
      <Routes>
        <Route path="/profile/:username" element={<UserProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function portfolioSection(container) {
  const heading = Array.from(container.querySelectorAll('h2')).find((h) => h.textContent === 'Portfolio');
  return heading?.closest('div.rounded-xl');
}

describe('UserProfilePage — Portfolio section (no overflow structure)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders every portfolio asset inside the section', async () => {
    const { container } = renderProfile();
    await waitFor(() => expect(screen.getByText('Portfolio')).toBeInTheDocument());

    expect(screen.getByText(LONG_NAME)).toBeInTheDocument();
    expect(screen.getAllByText('Apartment').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('a[href^="/property/"]').length).toBe(2);
    expect(portfolioSection(container)).toBeTruthy();
  });

  it('uses a responsive grid: 1 column mobile, 2 columns md+', async () => {
    const { container } = renderProfile();
    await waitFor(() => expect(screen.getByText('Portfolio')).toBeInTheDocument());
    const grid = portfolioSection(container).querySelector('.grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).toContain('min-w-0');
  });

  it('every asset card is a shrinkable grid child (min-w-0)', async () => {
    const { container } = renderProfile();
    await waitFor(() => expect(screen.getByText('Portfolio')).toBeInTheDocument());
    const cards = portfolioSection(container).querySelectorAll('a[href^="/property/"]');
    expect(cards.length).toBe(2);
    for (const card of cards) {
      expect(card.className).toContain('min-w-0');
    }
  });

  it('long property names wrap (break-words), not expand the card', async () => {
    const { container } = renderProfile();
    await waitFor(() => expect(screen.getByText(LONG_NAME)).toBeInTheDocument());
    const name = screen.getByText(LONG_NAME);
    expect(name.className).toContain('break-words');
    expect(name.className).not.toContain('truncate');
    // The name lives inside a min-w-0 flex column.
    expect(name.parentElement.className).toContain('min-w-0');
  });

  it('images are constrained to the card (fixed size + max-w-full)', async () => {
    const { container } = renderProfile();
    await waitFor(() => expect(screen.getByText('Portfolio')).toBeInTheDocument());
    const img = container.querySelector('[data-testid="property-image-p1"]');
    expect(img.className).toContain('w-16');
    expect(img.className).toContain('h-16');
    expect(img.className).toContain('max-w-full');
    expect(img.className).toContain('object-cover');
  });

  it('large currency values stay inside a shrinkable price column (text-end, min-w-0)', async () => {
    const { container } = renderProfile();
    await waitFor(() => expect(screen.getByText('Portfolio')).toBeInTheDocument());
    const price = screen.getByText('$125M');
    expect(price).toBeInTheDocument();
    const col = price.parentElement;
    expect(col.className).toContain('text-end');
    expect(col.className).toContain('min-w-0');
    // Rent is shown with the period suffix and can wrap.
    expect(screen.getByText('$12.5M/month')).toBeInTheDocument();
  });

  it('translates the property type via the established property.* keys', async () => {
    const { container } = renderProfile();
    await waitFor(() => expect(screen.getByText('Portfolio')).toBeInTheDocument());
    // Known type with a city: one "City - Type" line (no dangling dash).
    expect(screen.getByText(/Tel Aviv - Commercial/)).toBeInTheDocument();
    // Known type without a city: exactly the translated label (type line).
    const typeLine = Array.from(container.querySelectorAll('.text-xs')).find((el) => el.textContent === 'Apartment');
    expect(typeLine).toBeTruthy();
    expect(screen.queryByText(/^- /)).toBeNull();
  });

  it('RTL-safe classes (logical text-end, no directional hard-coding)', async () => {
    const { container } = renderProfile();
    await waitFor(() => expect(screen.getByText('Portfolio')).toBeInTheDocument());
    const price = screen.getByText('$125M');
    expect(price.parentElement.className).toContain('text-end');
    // No left/right-specific classes on the card row.
    const card = portfolioSection(container).querySelector('a[href^="/property/"]');
    expect(card.className).not.toMatch(/(\s|^)(ml-|mr-|pl-|pr-|left-|right-)/);
  });
});
