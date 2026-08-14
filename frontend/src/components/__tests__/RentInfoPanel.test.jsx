import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts ? `${key}:${opts.amount}` : key),
  }),
}));

import RentInfoPanel from '../RentInfoPanel';

describe('RentInfoPanel', () => {
  it('renders current, market, maximum, net income and the grandfather note', () => {
    render(
      <RentInfoPanel
        data={{
          perUnitRent: 13072,
          marketRate: 6528,
          currentMaxPerUnit: 13056,
          maxValidatedRentPerUnit: 13072,
          effectiveMaxPerUnit: 13072,
          nextAvailableIncrease: 0,
          netIncome: 7000,
        }}
      />,
    );

    expect(screen.getByText('propertyManagement.rentSummary')).toBeInTheDocument();
    expect(screen.getByText('propertyManagement.currentRentPerUnit')).toBeInTheDocument();
    expect(screen.getByText('propertyManagement.marketRentPerUnit')).toBeInTheDocument();
    expect(screen.getByText('propertyManagement.maximumRentPerUnit')).toBeInTheDocument();
    expect(screen.getByText('propertyManagement.nextAvailableIncrease')).toBeInTheDocument();
    expect(screen.getByText('propertyManagement.netMonthlyIncome')).toBeInTheDocument();

    expect(screen.getAllByText('$13.1K').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('$6.5K')).toBeInTheDocument();
    expect(screen.getByText('$7K')).toBeInTheDocument();

    expect(screen.getByText('propertyManagement.grandfatheredRentNote:$13.1K')).toBeInTheDocument();
    expect(screen.getByText('propertyManagement.noIncreaseAvailable')).toBeInTheDocument();
  });

  it('shows the next available increase when there is headroom', () => {
    render(
      <RentInfoPanel
        data={{
          perUnitRent: 9000,
          marketRate: 8000,
          currentMaxPerUnit: 16000,
          maxValidatedRentPerUnit: 9000,
          effectiveMaxPerUnit: 16000,
          nextAvailableIncrease: 7000,
          netIncome: 5000,
        }}
      />,
    );

    expect(screen.getByText('+$7K')).toBeInTheDocument();
    expect(screen.queryByText('propertyManagement.noIncreaseAvailable')).not.toBeInTheDocument();
    expect(screen.queryByText(/grandfatheredRentNote/)).not.toBeInTheDocument();
  });
});
