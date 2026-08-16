import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AuctionTimeLeft from '../AuctionTimeLeft';

const languageState = vi.hoisted(() => ({ language: 'en' }));

const DICT = vi.hoisted(() => ({
  en: {
    'auctions.status.upcoming': 'Upcoming',
    'auctions.status.active': 'Live',
    'auctions.status.ending': 'Ending',
    'auctions.status.ended': 'Ended',
    'auctions.status.cancelled': 'Cancelled',
    'auctions.finalizing': 'Finalizing...',
    'auctions.timeUnknown': 'Time unavailable',
    'auctions.startsInMonths_one': 'Starts in {{count}} month',
    'auctions.startsInMonths_other': 'Starts in {{count}} months',
    'auctions.monthsLeft_one': '{{count}} month left',
    'auctions.monthsLeft_other': '{{count}} months left',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const dict = DICT[languageState.language] || DICT.en;
    const t = (key, options = {}) => {
      const interpolate = (template) => template.replace(/\{\{(\w+)\}\}/g, (_, name) => options[name] ?? `{{${name}}}`);
      if (options.count !== undefined) {
        const suffix = options.count === 1 ? 'one' : 'other';
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

describe('AuctionTimeLeft', () => {
  it('renders the server-provided remainingMonths verbatim (never recomputes independently)', () => {
    render(<AuctionTimeLeft status="active" startTick={90} endTick={113} currentTick={100} remainingMonths={13} />);
    expect(screen.getByText('13 months left')).toBeInTheDocument();
  });

  it('prefers remainingMonths even when the tick fields look stale', () => {
    render(<AuctionTimeLeft status="active" startTick={90} endTick={113} currentTick={0} remainingMonths={4} />);
    expect(screen.getByText('4 months left')).toBeInTheDocument();
  });

  it('renders the upcoming label from remainingMonths', () => {
    render(<AuctionTimeLeft status="upcoming" startTick={105} endTick={113} currentTick={100} remainingMonths={5} />);
    expect(screen.getByText('Starts in 5 months')).toBeInTheDocument();
  });

  it('renders ending/ended/cancelled labels without a countdown', () => {
    render(<AuctionTimeLeft status="ending" remainingMonths={0} />);
    expect(screen.getByText(/Finalizing\.\.\./)).toBeInTheDocument();

    render(<AuctionTimeLeft status="ended" remainingMonths={0} />);
    expect(screen.getByText('Ended')).toBeInTheDocument();

    render(<AuctionTimeLeft status="cancelled" remainingMonths={0} />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows a neutral placeholder instead of a bogus countdown when no authoritative data exists', () => {
    render(<AuctionTimeLeft status="active" />);
    expect(screen.getByText('Time unavailable')).toBeInTheDocument();
    // The bug this guards against: rendering the whole auction length in months.
    expect(screen.queryByText(/months left/)).not.toBeInTheDocument();
  });
});
