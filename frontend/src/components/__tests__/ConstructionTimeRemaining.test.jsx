import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const translations = {
  en: {
    'construction.finalMonth': 'Final Month — Preparing for Occupancy',
    'companyDevelopment.monthsLeft_one': '{{count}} month left',
    'companyDevelopment.monthsLeft_two': '{{count}} months left',
    'companyDevelopment.monthsLeft_other': '{{count}} months left',
    'development.left': 'development.left',
  },
  he: {
    'construction.finalMonth': 'החודש האחרון — הכנה לאכלוס',
    'companyDevelopment.monthsLeft_one': 'נותר חודש אחד',
    'companyDevelopment.monthsLeft_two': 'נותרו חודשיים',
    'companyDevelopment.monthsLeft_other': 'נותרו {{count}} חודשים',
    'development.left': 'development.left',
  },
};

let lang = 'en';
const changeLanguage = (next) => {
  lang = next;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts = {}) => {
      if (opts.count != null) {
        const suffix = opts.count === 1 ? 'one' : opts.count === 2 ? 'two' : 'other';
        const plural = translations[lang][`${key}_${suffix}`];
        if (plural != null) return plural.replace(/{{count}}/g, String(opts.count));
      }
      const val = translations[lang][key];
      if (val != null) return val;
      return key;
    },
    i18n: { language: 'en', changeLanguage },
  }),
}));

import ConstructionTimeRemaining from '../ConstructionTimeRemaining';

describe('ConstructionTimeRemaining', () => {
  afterEach(() => {
    cleanup();
    lang = 'en';
  });

  it('English: remaining = 0 shows the final-month message', () => {
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={100} />);
    expect(screen.getByText('Final Month — Preparing for Occupancy')).toBeInTheDocument();
  });

  it('Hebrew: remaining = 0 shows the final-month message', () => {
    changeLanguage('he');
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={100} />);
    expect(screen.getByText('החודש האחרון — הכנה לאכלוס')).toBeInTheDocument();
  });

  it('English: 1 month left uses the singular form', () => {
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={99} />);
    expect(screen.getByText('1 month left')).toBeInTheDocument();
    expect(screen.queryByText(/months/)).not.toBeInTheDocument();
  });

  it('English: 2 months left uses the plural form', () => {
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={98} />);
    expect(screen.getByText('2 months left')).toBeInTheDocument();
  });

  it('English: 5 months left uses the plural form', () => {
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={95} />);
    expect(screen.getByText('5 months left')).toBeInTheDocument();
  });

  it('Hebrew: 1 month left uses singular "נותר חודש אחד"', () => {
    changeLanguage('he');
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={99} />);
    expect(screen.getByText('נותר חודש אחד')).toBeInTheDocument();
  });

  it('Hebrew: 2 months left uses dual "נותרו חודשיים"', () => {
    changeLanguage('he');
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={98} />);
    expect(screen.getByText('נותרו חודשיים')).toBeInTheDocument();
  });

  it('Hebrew: 5 months left renders "נותרו 5 חודשים"', () => {
    changeLanguage('he');
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={95} />);
    expect(screen.getByText('נותרו 5 חודשים')).toBeInTheDocument();
  });

  it('never exposes a raw translation key like development.left', () => {
    changeLanguage('en');
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={90} />);
    expect(screen.queryByText(/development\.left/)).not.toBeInTheDocument();
    expect(screen.getByText('10 months left')).toBeInTheDocument();
  });

  it('switches language on the mounted component without a reload', () => {
    const { rerender } = render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={95} />);
    expect(screen.getByText('5 months left')).toBeInTheDocument();
    changeLanguage('he');
    rerender(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={95} />);
    expect(screen.getByText('נותרו 5 חודשים')).toBeInTheDocument();
    expect(screen.queryByText('5 months left')).not.toBeInTheDocument();
  });

  it('renders nothing when completion data is missing', () => {
    const { container } = render(<ConstructionTimeRemaining completionPeriod={null} currentPeriod={100} />);
    expect(container).toBeEmptyDOMElement();
    const { container: container2 } = render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={null} />);
    expect(container2).toBeEmptyDOMElement();
  });

  it('is pure: rendering never changes the input values', () => {
    const completionPeriod = 100;
    const currentPeriod = 90;
    render(<ConstructionTimeRemaining completionPeriod={completionPeriod} currentPeriod={currentPeriod} />);
    expect(completionPeriod).toBe(100);
    expect(currentPeriod).toBe(90);
  });
});
