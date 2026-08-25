import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import enJson from '../../i18n/en.json';
import heJson from '../../i18n/he.json';

const i18nState = vi.hoisted(() => ({ language: 'en' }));
const tState = vi.hoisted(() => ({ fn: (key) => key }));
const authState = vi.hoisted(() => ({ user: { _id: 'u1', balance: 1000000, creditScore: 700 }, fetchMe: vi.fn() }));
const storeState = vi.hoisted(() => ({
  loans: [],
  fetchLoans: vi.fn(),
  fetchLoanOptions: vi.fn(),
  fetchLoanOffer: vi.fn(),
  applyFlexibleLoan: vi.fn(),
  repayLoan: vi.fn(),
  fetchUserData: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tState.fn, i18n: i18nState }),
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('../../store/useGameStore', () => ({
  useGameStore: () => storeState,
}));

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000',
}));

import BankPage from '../BankPage';

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

// Realistic i18next-style translator: resolves keys from en/he.json and
// interpolates {{var}} tokens with the passed variables.
function makeRealT(lang) {
  const dict = lang === 'he' ? heJson : enJson;
  return (key, vars) => {
    const [ns, sub] = key.split('.');
    let value = dict[ns]?.[sub];
    if (value == null) return key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.split(`{{${k}}}`).join(String(v));
      }
    }
    return value;
  };
}

const OFFER = {
  approved: true,
  interestRate: 0.064,
  monthlyPayment: 22953,
  totalRepayment: 826308,
  totalInterest: 76308,
  riskLevel: 'LOW',
  amount: 750000,
  durationMonths: 36,
  creditScore: 700,
  maxPrincipal: 2500000,
  minPrincipal: 10000,
  minMonths: 6,
  maxMonths: 36,
};

const PRODUCTS = [
  {
    productId: 'personal',
    name: 'Personal Loan',
    principal: 2500000,
    minPrincipal: 10000,
    maxPrincipal: 2500000,
    minMonths: 6,
    maxMonths: 36,
    durationTicks: 12,
    interestRate: 0.054,
  },
  {
    productId: 'mortgage',
    name: 'Mortgage',
    principal: 5000000,
    minPrincipal: 50000,
    maxPrincipal: 5000000,
    minMonths: 12,
    maxMonths: 84,
    durationTicks: 24,
    interestRate: 0.028,
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/bank']}>
      <Routes>
        <Route path="/bank" element={<BankPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  tState.fn = (key) => key;
  storeState.fetchLoanOptions.mockResolvedValue(PRODUCTS);
  // Echo the requested amount/duration so the preview and the Apply guard
  // stay consistent (offer.amount === slider amount).
  storeState.fetchLoanOffer.mockImplementation(async (productId, amount, durationMonths) => ({
    ...OFFER,
    amount,
    durationMonths,
  }));
  storeState.fetchLoans.mockResolvedValue();
  storeState.fetchUserData.mockResolvedValue();
  storeState.applyFlexibleLoan.mockResolvedValue({ loan: {}, balance: 1000000 });
  storeState.repayLoan.mockResolvedValue();
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const u = String(url);
      if (u.includes('/bank/summary'))
        return jsonResponse({
          balance: 1000000,
          netWorth: 2000000,
          totalDebt: 0,
          totalMonthlyPayment: 0,
          maxLoan: 2500000,
          creditScore: 700,
        });
      if (u.includes('/bank/history')) return jsonResponse([]);
      if (u.includes('/bank/credit-history')) return jsonResponse([]);
      return jsonResponse({});
    }),
  );
});

describe('BankPage — flexible loan wizard', () => {
  const rangeInput = (label) => screen.getAllByLabelText(label).find((el) => el.type === 'range');

  it('renders the loan type selector with product ranges', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('bank.typePersonal')).toBeTruthy());
    expect(screen.getByText('bank.typeMortgage')).toBeTruthy();
    expect(screen.getByText('bank.borrowAmount')).toBeTruthy();
    expect(screen.getByText('bank.loanDuration')).toBeTruthy();
  });

  it('renders amount and duration sliders for the selected product', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText('bank.borrowAmount').length).toBeGreaterThan(0));
    const amountSlider = rangeInput('bank.borrowAmount');
    const durationSlider = rangeInput('bank.loanDuration');
    expect(amountSlider).toBeTruthy();
    expect(amountSlider.type).toBe('range');
    expect(Number(amountSlider.min)).toBe(10000);
    expect(Number(amountSlider.max)).toBe(2500000);
    expect(Number(durationSlider.min)).toBe(6);
    expect(Number(durationSlider.max)).toBe(36);
  });

  it('fetches a live offer and displays rate, payment, interest, repayment and risk', async () => {
    renderPage();
    await waitFor(() => expect(storeState.fetchLoanOffer).toHaveBeenCalled());

    await waitFor(() => {
      expect(screen.getByText('6.40%')).toBeTruthy();
      expect(screen.getAllByText('bank.monthlyPayment').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('bank.riskLow')).toBeTruthy();
  });

  it('re-fetches the offer when the amount changes', async () => {
    renderPage();
    await waitFor(() => expect(storeState.fetchLoanOffer).toHaveBeenCalled());

    const slider = rangeInput('bank.borrowAmount');
    fireEvent.change(slider, { target: { value: '500000' } });
    await waitFor(() => expect(storeState.fetchLoanOffer.mock.calls.length).toBeGreaterThanOrEqual(2));
    const lastCall = storeState.fetchLoanOffer.mock.calls[storeState.fetchLoanOffer.mock.calls.length - 1];
    expect(lastCall[1]).toBe(500000);
  });

  it('re-fetches the offer when the duration changes', async () => {
    renderPage();
    await waitFor(() => expect(storeState.fetchLoanOffer).toHaveBeenCalled());

    const slider = rangeInput('bank.loanDuration');
    fireEvent.change(slider, { target: { value: '24' } });
    await waitFor(() => expect(storeState.fetchLoanOffer.mock.calls.length).toBeGreaterThanOrEqual(2));
    const lastCall = storeState.fetchLoanOffer.mock.calls[storeState.fetchLoanOffer.mock.calls.length - 1];
    expect(lastCall[2]).toBe(24);
  });

  it('shows the rejection state when the offer is not approved', async () => {
    storeState.fetchLoanOffer.mockResolvedValue({ approved: false, reason: 'Insufficient borrowing capacity' });
    renderPage();
    await waitFor(() => expect(screen.getByText('bank.rejected')).toBeTruthy());
    expect(screen.getByText('bank.reasonCapacity')).toBeTruthy();
  });

  it('disables the Take Loan button while loading and for unapproved offers', async () => {
    storeState.fetchLoanOffer.mockResolvedValue({ approved: false, reason: 'Invalid loan duration' });
    renderPage();
    await waitFor(() => expect(screen.getByText('bank.takeLoan')).toBeTruthy());
    expect(screen.getByText('bank.takeLoan').closest('button').disabled).toBe(true);
  });

  it('applies the loan with the server-returned terms', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('bank.takeLoan')).toBeTruthy());
    const amountSlider = rangeInput('bank.borrowAmount');
    const durationSlider = rangeInput('bank.loanDuration');
    fireEvent.change(amountSlider, { target: { value: '750000' } });
    fireEvent.change(durationSlider, { target: { value: '36' } });
    const button = screen.getByText('bank.takeLoan').closest('button');
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(storeState.applyFlexibleLoan).toHaveBeenCalled());
    expect(storeState.applyFlexibleLoan).toHaveBeenCalledWith('personal', 750000, 36);
  });

  it('surfaces API errors and refreshes the preview', async () => {
    storeState.applyFlexibleLoan.mockRejectedValue(new Error('Maximum total debt is $1,000,000 for your credit tier'));
    renderPage();
    await waitFor(() => expect(screen.getByText('bank.takeLoan')).toBeTruthy());
    const button = screen.getByText('bank.takeLoan').closest('button');
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByText(/Maximum total debt is \$1,000,000 for your credit tier/)).toBeTruthy(),
    );
  });

  it('renders without horizontal overflow on a mobile viewport', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('bank.borrowAmount')).toBeTruthy());
    const root = container.firstChild;
    expect(root.className).toContain('overflow-y-auto');
    const overflow = root.className.match(/overflow-x-[a-z]+/);
    expect(overflow ? overflow[0] : 'none').not.toBe('overflow-x-auto');
  });

  it('renders in Hebrew RTL without crashing', async () => {
    i18nState.language = 'he';
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('bank.borrowAmount')).toBeTruthy());
    expect(container.querySelector('input[type="range"]')).toBeTruthy();
    i18nState.language = 'en';
  });
});

describe('BankPage — min/max interpolation and slider consistency', () => {
  // With the realistic translator, labels resolve to English/Hebrew text.
  const AMOUNT_LABEL = 'Borrow Amount';
  const DURATION_LABEL = 'Loan Duration';
  const rangeInput = (label) => screen.getAllByLabelText(label).find((el) => el.type === 'range');

  beforeEach(() => {
    tState.fn = makeRealT('en');
  });

  it('renders interpolated min/max values — no {min}/{max} placeholders', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Between $10K and $2.5M')).toBeTruthy());
    expect(screen.getByText('6 to 36 months')).toBeTruthy();
    expect(screen.queryByText(/\{min\}/)).toBeNull();
    expect(screen.queryByText(/\{max\}/)).toBeNull();
  });

  it('renders Hebrew interpolated min/max values with RTL content', async () => {
    tState.fn = makeRealT('he');
    renderPage();
    await waitFor(() => expect(screen.getByText('בין $10K ל-$2.5M')).toBeTruthy());
    expect(screen.getByText('6 עד 36 חודשים')).toBeTruthy();
    expect(screen.queryByText(/\{min\}/)).toBeNull();
    expect(screen.queryByText(/\{max\}/)).toBeNull();
  });

  it('slider minimum: displayed and submitted amounts equal the backend minimum', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText(AMOUNT_LABEL).length).toBeGreaterThan(0));
    // Wait for the initial debounced fetch so the slider change schedules a fresh one.
    await waitFor(() => expect(storeState.fetchLoanOffer).toHaveBeenCalled());
    const slider = rangeInput(AMOUNT_LABEL);
    fireEvent.change(slider, { target: { value: '10000' } });
    await waitFor(() => expect(screen.getAllByText('$10K').length).toBeGreaterThan(0));
    await waitFor(() => expect(storeState.fetchLoanOffer.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(storeState.fetchLoanOffer.mock.calls.at(-1)[1]).toBe(10000);

    const durationSlider = rangeInput(DURATION_LABEL);
    fireEvent.change(durationSlider, { target: { value: '6' } });
    const button = screen.getByText('Take Loan').closest('button');
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(storeState.applyFlexibleLoan).toHaveBeenCalled());
    expect(storeState.applyFlexibleLoan).toHaveBeenCalledWith('personal', 10000, 6);
  });

  it('slider maximum: displayed and submitted amounts equal the backend maximum', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText(AMOUNT_LABEL).length).toBeGreaterThan(0));
    await waitFor(() => expect(storeState.fetchLoanOffer).toHaveBeenCalled());
    const slider = rangeInput(AMOUNT_LABEL);
    fireEvent.change(slider, { target: { value: '2500000' } });
    await waitFor(() => expect(screen.getAllByText('$2.5M').length).toBeGreaterThan(0));
    await waitFor(() => expect(storeState.fetchLoanOffer.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(storeState.fetchLoanOffer.mock.calls.at(-1)[1]).toBe(2500000);

    const durationSlider = rangeInput(DURATION_LABEL);
    fireEvent.change(durationSlider, { target: { value: '36' } });
    const button = screen.getByText('Take Loan').closest('button');
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(storeState.applyFlexibleLoan).toHaveBeenCalled());
    expect(storeState.applyFlexibleLoan).toHaveBeenCalledWith('personal', 2500000, 36);
  });

  it('slider middle value: displayed amount matches the slider and is submitted unchanged', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText(AMOUNT_LABEL).length).toBeGreaterThan(0));
    await waitFor(() => expect(storeState.fetchLoanOffer).toHaveBeenCalled());
    const slider = rangeInput(AMOUNT_LABEL);
    fireEvent.change(slider, { target: { value: '1000000' } });
    await waitFor(() => expect(screen.getAllByText('$1M').length).toBeGreaterThan(0));
    await waitFor(() => expect(storeState.fetchLoanOffer.mock.calls.at(-1)[1]).toBe(1000000));
  });

  it('duration minimum and maximum follow the backend product range', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText(DURATION_LABEL).length).toBeGreaterThan(0));
    const slider = rangeInput(DURATION_LABEL);
    expect(Number(slider.min)).toBe(6);
    expect(Number(slider.max)).toBe(36);

    fireEvent.change(slider, { target: { value: '6' } });
    await waitFor(() => expect(screen.getByText('6 months')).toBeTruthy());
    fireEvent.change(slider, { target: { value: '36' } });
    await waitFor(() => expect(screen.getByText('36 months')).toBeTruthy());
  });

  it('switching loan products updates the amount and duration ranges', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Mortgage').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Mortgage')[0]);

    const amountSlider = rangeInput(AMOUNT_LABEL);
    const durationSlider = rangeInput(DURATION_LABEL);
    await waitFor(() => expect(Number(amountSlider.max)).toBe(5000000));
    expect(Number(amountSlider.min)).toBe(50000);
    expect(Number(durationSlider.min)).toBe(12);
    expect(Number(durationSlider.max)).toBe(84);
    expect(screen.getByText('12 to 84 months')).toBeTruthy();

    // Switch back to Personal — ranges restore.
    fireEvent.click(screen.getAllByText('Personal')[0]);
    await waitFor(() => expect(Number(rangeInput(AMOUNT_LABEL).max)).toBe(2500000));
    expect(Number(rangeInput(DURATION_LABEL).max)).toBe(36);
  });

  it('each loan product renders exactly one card (deduplicated)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Personal').length).toBe(1));
    expect(screen.getAllByText('Mortgage').length).toBe(1);
  });
});
