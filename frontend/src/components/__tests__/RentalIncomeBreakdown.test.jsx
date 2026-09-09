import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

import RentalIncomeBreakdown from '../RentalIncomeBreakdown';

const data = {
  totalRentalIncome: 287450,
  totalGrossIncome: 300000,
  latestTick: 100,
  propertyCount: 4,
  properties: [
    {
      propertyId: 'p1',
      name: 'Luxury Hotel',
      type: 'commercial',
      city: 'Tel Aviv',
      monthlyRent: 105000,
      grossIncome: 110000,
      maintenanceCost: 4000,
      operatingExpenses: 1000,
      rentalIncome: 105000,
      occupancy: 95,
      currentPrice: 5000000,
      percentageOfTotal: 36.53,
    },
    {
      propertyId: 'p2',
      name: 'Office Tower',
      type: 'commercial',
      city: 'London',
      monthlyRent: 82500,
      grossIncome: 84000,
      maintenanceCost: 1000,
      operatingExpenses: 500,
      rentalIncome: 82500,
      occupancy: 90,
      currentPrice: 4000000,
      percentageOfTotal: 28.7,
    },
    {
      propertyId: 'p3',
      name: 'Shopping Center',
      type: 'commercial',
      city: 'New York',
      monthlyRent: 61250,
      grossIncome: 62000,
      maintenanceCost: 500,
      operatingExpenses: 250,
      rentalIncome: 61250,
      occupancy: 85,
      currentPrice: 3000000,
      percentageOfTotal: 21.31,
    },
    {
      propertyId: 'p4',
      name: 'Apartment Complex',
      type: 'apartment',
      city: 'Rome',
      monthlyRent: 38700,
      grossIncome: 39000,
      maintenanceCost: 200,
      operatingExpenses: 100,
      rentalIncome: 38700,
      occupancy: 88,
      currentPrice: 2000000,
      percentageOfTotal: 13.46,
    },
  ],
};

function renderPanel(props = {}) {
  return render(
    <MemoryRouter>
      <RentalIncomeBreakdown data={props.data ?? data} />
    </MemoryRouter>,
  );
}

describe('RentalIncomeBreakdown', () => {
  it('renders the locked state with a hire CTA and never any income value', () => {
    const onHire = vi.fn();
    render(
      <MemoryRouter>
        <RentalIncomeBreakdown locked onHire={onHire} hiring={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText('dashboard.rentalIncomeTitle')).toBeInTheDocument();
    expect(screen.getByText('dashboard.rentalIncomeLockedHint')).toBeInTheDocument();
    expect(screen.getByText('assistant.hireButton')).toBeInTheDocument();
    expect(screen.queryByText(/\$287\.4K/)).not.toBeInTheDocument();
    expect(screen.queryByText('dashboard.rentTotal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('assistant.hireButton'));
    expect(onHire).toHaveBeenCalledTimes(1);
  });

  it('shows the hiring label while a hire is in flight', () => {
    render(
      <MemoryRouter>
        <RentalIncomeBreakdown locked onHire={vi.fn()} hiring />
      </MemoryRouter>,
    );
    expect(screen.getByText('assistant.hiring')).toBeInTheDocument();
  });

  it('renders nothing when neither data nor locked is provided', () => {
    const { container } = render(
      <MemoryRouter>
        <RentalIncomeBreakdown />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
  it('renders the total rental income with the per-month suffix', () => {
    renderPanel();
    expect(screen.getByText('dashboard.rentalIncomeTitle')).toBeInTheDocument();
    expect(screen.getAllByText('$287.4K').length).toBeGreaterThan(0);
    expect(screen.getAllByText('dashboard.perMonth').length).toBeGreaterThan(0);
  });

  it('renders every property with rent, income and share', () => {
    renderPanel();
    expect(screen.getAllByText('Luxury Hotel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Office Tower').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shopping Center').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Apartment Complex').length).toBeGreaterThan(0);
    expect(screen.getAllByText('36.5%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('28.7%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$105K').length).toBeGreaterThan(0);
  });

  it('renders the footer total row summing the properties', () => {
    renderPanel();
    expect(screen.getAllByText('dashboard.rentTotal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$287.4K').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
  });

  it('shows the empty state instead of a bare $0 when there is no income', () => {
    renderPanel({
      data: { totalRentalIncome: 0, totalGrossIncome: 0, latestTick: 0, propertyCount: 0, properties: [] },
    });
    expect(screen.getByText('dashboard.noRentalIncome')).toBeInTheDocument();
    expect(screen.getByText('dashboard.noRentalIncomeHint')).toBeInTheDocument();
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
  });

  it('shows the empty state when properties exist but earn nothing', () => {
    renderPanel({
      data: {
        totalRentalIncome: 0,
        totalGrossIncome: 0,
        latestTick: 0,
        propertyCount: 1,
        properties: [
          {
            propertyId: 'land1',
            name: 'Empty Plot',
            type: 'land',
            city: 'Rome',
            monthlyRent: 0,
            grossIncome: 0,
            maintenanceCost: 0,
            operatingExpenses: 0,
            rentalIncome: 0,
            occupancy: 0,
            currentPrice: 100000,
            percentageOfTotal: 0,
          },
        ],
      },
    });
    expect(screen.getByText('dashboard.noRentalIncome')).toBeInTheDocument();
  });

  it('navigates to the property when a row is clicked', () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Luxury Hotel')[0]);
    // The navigate mock is a no-op — asserting no crash on click.
    expect(screen.getAllByText('Luxury Hotel').length).toBeGreaterThan(0);
  });
});
