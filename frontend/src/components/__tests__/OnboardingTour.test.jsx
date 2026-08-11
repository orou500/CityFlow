import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OnboardingTour from '../OnboardingTour';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

const MOCK_USER = { _id: 'u1', username: 'newbie', level: 1 };

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: () => ({ user: MOCK_USER }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        'onboarding.tour.steps.welcome.title': 'Welcome to CityFlow!',
        'onboarding.tour.steps.welcome.description': 'Build your real estate empire.',
        'onboarding.tour.steps.buy_property.title': 'Buy Your First Property',
        'onboarding.tour.buttons.getStarted': 'Get Started',
        'onboarding.tour.buttons.explore': 'Explore',
        'onboarding.tour.buttons.next': 'Next',
        'onboarding.tour.progress': '{{current}}/{{total}}',
      };
      return map[key] || key;
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000/api',
}));

const ACTIVE_STATE = {
  success: true,
  status: 'active',
  currentStep: 'welcome',
  eventGated: false,
  completedSteps: [],
  totalSteps: 11,
  currentIndex: 0,
  lastPropertyId: null,
  steps: [{ id: 'welcome', route: '/dashboard', eventGated: false }],
};

describe('OnboardingTour', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    localStorage.clear();
  });

  it('renders nothing when the tour is not active', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...ACTIVE_STATE, status: 'completed' }),
    });
    const { container } = render(<OnboardingTour />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows the welcome step and advances when Get Started is clicked', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ACTIVE_STATE,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...ACTIVE_STATE, currentStep: 'dashboard', currentIndex: 1 }),
      });

    render(<OnboardingTour />);

    expect(await screen.findByText('Welcome to CityFlow!')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Get Started'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/onboarding/tour/advance'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('an event-gated step shows the waiting indicator (cannot be clicked through)', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...ACTIVE_STATE,
        currentStep: 'buy_property',
        eventGated: true,
        currentIndex: 3,
        steps: [{ id: 'buy_property', route: '/marketplace', eventGated: true }],
      }),
    });

    render(<OnboardingTour />);

    expect(await screen.findByText('Buy Your First Property')).toBeInTheDocument();
    expect(screen.queryByText('Get Started')).not.toBeInTheDocument();
  });

  it('on small screens an event step starts minimized as a pill so the action stays reachable', async () => {
    const width = 375;
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...ACTIVE_STATE,
        currentStep: 'buy_property',
        eventGated: true,
        currentIndex: 3,
        steps: [{ id: 'buy_property', route: '/marketplace', eventGated: true }],
      }),
    });

    render(<OnboardingTour />);

    // The card is collapsed into the pulsing pill (no waiting indicator);
    // wait for the minimization to settle, then the pill is stable.
    await waitFor(() => {
      expect(screen.queryByText('onboarding.tour.waitingAction')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Buy Your First Property')).toBeInTheDocument();

    // Tapping the pill expands the full card with the waiting indicator.
    fireEvent.click(screen.getByText('Buy Your First Property'));
    expect(screen.getByText('onboarding.tour.waitingAction')).toBeInTheDocument();
  });

  it('Explore on an informational step advances the step so the modal does not linger', async () => {
    navigateMock.mockClear();

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...ACTIVE_STATE,
          currentStep: 'property_page',
          currentIndex: 4,
          lastPropertyId: 'prop123',
          steps: [
            { id: 'welcome', route: '/dashboard', eventGated: false },
            { id: 'property_page', route: '/property/:id', eventGated: false },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...ACTIVE_STATE,
          currentStep: 'collect_rent',
          eventGated: true,
          currentIndex: 5,
        }),
      });

    render(<OnboardingTour />);

    await waitFor(() => {
      expect(screen.getByText('Explore')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Explore'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/onboarding/tour/advance'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(navigateMock).toHaveBeenCalledWith('/property/prop123');
  });
});
