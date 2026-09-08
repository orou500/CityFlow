import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const translations = {
  en: {
    'construction.finalMonth': 'Final Month — Preparing for Occupancy',
    'companyDevelopment.months': 'months',
    'development.left': 'left',
  },
  he: {
    'construction.finalMonth': 'החודש האחרון — הכנה לאכלוס',
    'companyDevelopment.months': 'חודשים',
    'development.left': 'נשאר',
  },
};

let lang = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => translations[lang][key] || key,
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

  it('Hebrew: remaining = 0 shows the final-month message (RTL text)', () => {
    lang = 'he';
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={100} />);
    expect(screen.getByText('החודש האחרון — הכנה לאכלוס')).toBeInTheDocument();
  });

  it('remaining = 1 keeps the existing 1-month display unchanged', () => {
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={99} />);
    expect(screen.getByText('1 months left')).toBeInTheDocument();
    expect(screen.queryByText(/Final Month/)).not.toBeInTheDocument();
  });

  it('remaining = 2 keeps the existing 2-month display unchanged', () => {
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={98} />);
    expect(screen.getByText('2 months left')).toBeInTheDocument();
  });

  it('remaining = 5 keeps the existing 5-month display unchanged', () => {
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={95} />);
    expect(screen.getByText('5 months left')).toBeInTheDocument();
  });

  it('Hebrew: remaining > 0 keeps the existing display unchanged', () => {
    lang = 'he';
    render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={99} />);
    expect(screen.getByText('1 חודשים נשאר')).toBeInTheDocument();
  });

  it('renders nothing when completion data is missing', () => {
    const { container } = render(<ConstructionTimeRemaining completionPeriod={null} currentPeriod={100} />);
    expect(container).toBeEmptyDOMElement();
    const { container: container2 } = render(<ConstructionTimeRemaining completionPeriod={100} currentPeriod={null} />);
    expect(container2).toBeEmptyDOMElement();
  });

  it('is pure: rendering never changes the input values', () => {
    const completionPeriod = 100;
    const currentPeriod = 100;
    render(<ConstructionTimeRemaining completionPeriod={completionPeriod} currentPeriod={currentPeriod} />);
    expect(completionPeriod).toBe(100);
    expect(currentPeriod).toBe(100);
  });
});
