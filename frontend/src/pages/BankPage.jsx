import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { translateError } from '../i18n/errors';
import { formatMoney, formatCompact } from '../utils/format';
import CompactValue from '../components/CompactValue';
import { getApiBaseUrl } from '../utils/capacitor';

function getScoreColor(score) {
  if (score >= 800) return 'text-emerald-500';
  if (score >= 740) return 'text-green-500';
  if (score >= 670) return 'text-lime-500';
  if (score >= 580) return 'text-yellow-500';
  if (score >= 500) return 'text-orange-500';
  return 'text-red-500';
}

function getScoreBg(score) {
  if (score >= 800) return 'bg-emerald-500';
  if (score >= 740) return 'bg-green-500';
  if (score >= 670) return 'bg-lime-500';
  if (score >= 580) return 'bg-yellow-500';
  if (score >= 500) return 'bg-orange-500';
  return 'bg-red-500';
}

function getScoreLabel(score) {
  if (score >= 800) return 'Excellent';
  if (score >= 740) return 'Very Good';
  if (score >= 670) return 'Good';
  if (score >= 580) return 'Fair';
  if (score >= 500) return 'Poor';
  return 'Very Poor';
}

function getScoreWidth(score) {
  return Math.max(0, Math.min(100, ((score - 300) / 550) * 100));
}

function getReasonLabel(reason, t) {
  const map = {
    on_time_payment: t('bank.reasonOnTime'),
    missed_payment: t('bank.reasonMissed'),
    loan_repaid: t('bank.reasonRepaid'),
    new_loan: t('bank.reasonNewLoan'),
    high_debt_ratio: t('bank.reasonHighDebt'),
    low_debt_ratio: t('bank.reasonLowDebt'),
    net_worth_growth: t('bank.reasonGrowth'),
    default: t('bank.reasonDefault'),
  };
  return map[reason] || reason;
}

function getLoanTypeLabel(type, t) {
  const map = {
    personal: t('bank.typePersonal'),
    mortgage: t('bank.typeMortgage'),
    business: t('bank.typeBusiness'),
    line_of_credit: t('bank.typeCredit'),
  };
  return map[type] || type;
}

function getRiskLabel(risk, t) {
  const map = {
    LOW: t('bank.riskLow'),
    MODERATE: t('bank.riskModerate'),
    HIGH: t('bank.riskHigh'),
    VERY_HIGH: t('bank.riskVeryHigh'),
  };
  return map[risk] || risk;
}

function getRiskStyle(risk) {
  if (risk === 'VERY_HIGH') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
  if (risk === 'HIGH') return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400';
  if (risk === 'MODERATE') return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
  return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
}

function getRejectionLabel(reason, t) {
  const map = {
    'Invalid loan product': t('bank.reasonInvalidProduct'),
    'Invalid loan amount': t('bank.reasonInvalidAmount'),
    'Invalid loan duration': t('bank.reasonInvalidDuration'),
    'Credit score too low for this product': t('bank.reasonCreditLow'),
    'Excessive existing leverage': t('bank.reasonLeverage'),
    'Insufficient borrowing capacity': t('bank.reasonCapacity'),
    'User not found': t('bank.reasonUserNotFound'),
  };
  return map[reason] || reason;
}

export default function BankPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const API = getApiBaseUrl();
  const { user, fetchMe } = useAuthStore();
  const { loans, fetchLoans, fetchLoanOptions, applyFlexibleLoan, fetchLoanOffer, repayLoan, fetchUserData } =
    useGameStore();
  const [summary, setSummary] = useState(null);
  const [options, setOptions] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [amount, setAmount] = useState(0);
  const [durationMonths, setDurationMonths] = useState(12);
  const [offer, setOffer] = useState(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [repayAmounts, setRepayAmounts] = useState({});
  const [loanHistory, setLoanHistory] = useState([]);
  const [creditHistory, setCreditHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const previewTimer = useRef(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    fetchMe();
    fetchUserData();
    fetchLoans();
    fetchLoanOptions()
      .then((opts) => {
        // The backend returns one entry per (product x duration preset) — dedupe
        // so each loan type renders exactly one card.
        const unique = opts.filter((opt, i, arr) => arr.findIndex((o) => o.productId === opt.productId) === i);
        // The backend's effectiveMaxPrincipal is the largest amount it will
        // actually approve right now (product cap minus existing-debt room).
        const usable = unique.filter((o) => (o.effectiveMaxPrincipal ?? o.maxPrincipal) >= o.minPrincipal);
        setOptions(usable);
        if (usable.length > 0 && !selectedProduct) {
          const product = usable[0];
          setSelectedProduct(product);
          const min = product.minPrincipal;
          const max = product.effectiveMaxPrincipal ?? product.maxPrincipal;
          const midpoint = Math.round(((max - min) / 2 + min) / 5000) * 5000;
          setAmount(Math.min(max, Math.max(min, midpoint)));
          const minMonths = product.minMonths || product.durationTicks || 6;
          setDurationMonths(Math.min(Math.max(minMonths, 12), product.maxMonths || 36));
        }
      })
      .catch(() => {});
    fetch(`${API}/bank/summary`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
    fetch(`${API}/bank/history`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => r.json())
      .then(setLoanHistory)
      .catch(() => {});
    fetch(`${API}/bank/credit-history`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => r.json())
      .then(setCreditHistory)
      .catch(() => {});
  };

  const refreshSummary = () => {
    fetch(`${API}/bank/summary`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
  };

  const selectProduct = (product) => {
    setSelectedProduct(product);
    const min = product.minPrincipal;
    const max = product.effectiveMaxPrincipal ?? product.maxPrincipal;
    const midpoint = Math.round(((max - min) / 2 + min) / 5000) * 5000;
    setAmount(Math.min(max, Math.max(min, midpoint)));
    const minMonths = product.minMonths || product.durationTicks || 6;
    setDurationMonths(Math.min(Math.max(minMonths, 12), product.maxMonths || 36));
    setOffer(null);
    setError(null);
  };

  const fetchPreview = useCallback(
    async (product, amt, months) => {
      if (!product) return;
      setOfferLoading(true);
      try {
        const result = await fetchLoanOffer(product.productId, amt, months);
        setOffer(result);
        setError(null);
      } catch (err) {
        setError(translateError(err, t));
        setOffer(null);
      } finally {
        setOfferLoading(false);
      }
    },
    [fetchLoanOffer, t],
  );

  useEffect(() => {
    if (!selectedProduct || activeTab !== 'overview') return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      fetchPreview(selectedProduct, amount, durationMonths);
    }, 300);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [selectedProduct, amount, durationMonths, activeTab, fetchPreview]);

  const handleApply = async () => {
    if (!selectedProduct || !offer?.approved) return;
    setApplying(true);
    setError(null);
    try {
      await applyFlexibleLoan(selectedProduct.productId, offer.amount, offer.durationMonths);
      fetchData();
      setOffer(null);
    } catch (err) {
      setError(translateError(err, t));
      fetchPreview(selectedProduct, amount, durationMonths);
    }
    setApplying(false);
  };

  const handleRepay = async (loanId) => {
    const amountToRepay = repayAmounts[loanId];
    if (!amountToRepay || amountToRepay <= 0) return;
    try {
      await repayLoan(loanId, amountToRepay);
      fetchData();
    } catch {}
  };

  if (!user) return null;

  const creditScore = summary?.creditScore || user.creditScore || 650;
  const scoreWidth = getScoreWidth(creditScore);

  const productMin = selectedProduct?.minPrincipal || 0;
  // Slider bound = server-computed selectable maximum (product cap minus
  // existing-debt room) — never the raw advertised maximum.
  const productMax = selectedProduct?.effectiveMaxPrincipal ?? selectedProduct?.maxPrincipal ?? 1;
  const minMonths = selectedProduct?.minMonths || 6;
  const maxMonths = selectedProduct?.maxMonths || 36;
  // Fixed 5k grid — matches the midpoint snap and the backend's integer
  // rounding, so the slider value always equals the displayed amount.
  const amountStep = 5000;
  const clampedAmount = Number.isFinite(amount) ? Math.min(productMax, Math.max(productMin, amount)) : productMin;
  const clampedDuration = Number.isFinite(durationMonths)
    ? Math.min(maxMonths, Math.max(minMonths, durationMonths))
    : minMonths;

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <h1 className="text-2xl font-bold mb-4">{t('bank.title')}</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.cash')}</p>
          <p className="text-xl font-bold text-orange-500 dark:text-orange-400">
            <CompactValue value={summary?.balance || user.balance} />
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.netWorth')}</p>
          <p className="text-xl font-bold text-orange-500 dark:text-orange-400">
            <CompactValue value={summary?.netWorth} />
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.totalDebt')}</p>
          <p
            className={`text-xl font-bold ${summary?.totalDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}
          >
            <CompactValue value={summary?.totalDebt} />
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.monthlyPayment')}</p>
          <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
            <CompactValue value={summary?.totalMonthlyPayment} />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t('bank.creditScore')}</h2>
            <span className={`text-xs font-medium ${getScoreColor(creditScore)}`}>{getScoreLabel(creditScore)}</span>
          </div>
          <div className="flex items-end gap-3 mb-3">
            <span className={`text-4xl font-bold ${getScoreColor(creditScore)}`}>{creditScore}</span>
            <span className="text-sm text-gray-400 dark:text-gray-500 mb-1">/ 850</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
            <div
              className={`${getScoreBg(creditScore)} h-2.5 rounded-full transition-all`}
              style={{ width: `${scoreWidth}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
            <span>300</span>
            <span>500</span>
            <span>670</span>
            <span>800</span>
            <span>850</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">{t('bank.creditFactors')}</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">{t('bank.factorDebt')}</span>
              <span className={`font-medium ${(summary?.debtToIncome || 0) > 0.5 ? 'text-red-500' : 'text-green-500'}`}>
                {((summary?.debtToIncome || 0) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">{t('bank.factorLoans')}</span>
              <span className="font-medium text-gray-900 dark:text-white">{summary?.loanCount || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">{t('bank.factorMaxLoan')}</span>
              <span className="font-medium text-gray-900 dark:text-white">
                <CompactValue value={summary?.maxLoan} />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
        {['overview', 'history', 'credit'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-orange-500 text-orange-500'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t(`bank.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg p-4">
              <h2 className="text-lg font-bold mb-3">{t('bank.newLoan')}</h2>
              {error && <p className="text-red-600 dark:text-red-400 text-sm mb-2">{error}</p>}

              {options.length > 0 ? (
                <>
                  {/* Loan type selector */}
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('bank.chooseProduct')}</p>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {options.map((opt) => {
                      const active = selectedProduct?.productId === opt.productId;
                      const effectiveMax = opt.effectiveMaxPrincipal ?? opt.maxPrincipal;
                      return (
                        <button
                          key={opt.productId}
                          onClick={() => selectProduct(opt)}
                          className={`text-start p-2.5 rounded border transition-colors ${
                            active
                              ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <div className="font-semibold text-sm">{getLoanTypeLabel(opt.productId, t)}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {formatCompact(opt.minPrincipal)} – {formatCompact(effectiveMax)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {opt.minMonths || 6}–{opt.maxMonths || 36} {t('bank.durationLabel')}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {selectedProduct && (
                    <>
                      {/* Amount selector */}
                      <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                        {t('bank.borrowAmount')}
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        {t('bank.amountBetween', { min: formatMoney(productMin), max: formatMoney(productMax) })}
                      </p>
                      <input
                        type="range"
                        min={productMin}
                        max={productMax}
                        step={amountStep}
                        value={clampedAmount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        className="w-full accent-orange-500 mb-1"
                        aria-label={t('bank.borrowAmount')}
                      />
                      <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
                        <span className="text-lg font-bold text-gray-900 dark:text-white min-w-0 break-words">
                          {formatMoney(clampedAmount)}
                        </span>
                        <input
                          type="number"
                          min={productMin}
                          max={productMax}
                          step={amountStep}
                          value={clampedAmount}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) setAmount(Math.min(productMax, Math.max(productMin, v)));
                          }}
                          onBlur={() => {
                            // Snap typed values back onto the slider grid.
                            setAmount(
                              Math.min(
                                productMax,
                                Math.max(productMin, Math.round(clampedAmount / amountStep) * amountStep),
                              ),
                            );
                          }}
                          className="w-24 sm:w-32 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white text-end"
                          aria-label={t('bank.borrowAmount')}
                        />
                      </div>

                      {/* Duration selector */}
                      <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                        {t('bank.loanDuration')}
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        {t('bank.monthsBetween', { min: minMonths, max: maxMonths })}
                      </p>
                      <input
                        type="range"
                        min={minMonths}
                        max={maxMonths}
                        step={1}
                        value={clampedDuration}
                        onChange={(e) => setDurationMonths(Number(e.target.value))}
                        className="w-full accent-orange-500 mb-1"
                        aria-label={t('bank.loanDuration')}
                      />
                      <div className="flex items-center justify-between mb-4 gap-2">
                        <span className="text-lg font-bold text-gray-900 dark:text-white">
                          {clampedDuration} {t('bank.durationLabel')}
                        </span>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {[12, 24, 36, 48, 60, 72, 84]
                            .filter((m) => m >= minMonths && m <= maxMonths)
                            .map((m) => (
                              <button
                                key={m}
                                onClick={() => setDurationMonths(m)}
                                className={`px-2 py-1 rounded text-xs transition-colors ${
                                  durationMonths === m
                                    ? 'bg-orange-500 text-gray-900 dark:text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                        </div>
                      </div>

                      {/* Live offer preview */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            {t('bank.offerPreview')}
                          </h3>
                          {offerLoading && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">{t('bank.previewLoading')}</span>
                          )}
                        </div>

                        {!offer ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{t('bank.previewLoading')}</p>
                        ) : offer.approved ? (
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.amount')}</p>
                              <p className="font-semibold">{formatMoney(offer.amount)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.loanDuration')}</p>
                              <p className="font-semibold">
                                {offer.durationMonths} {t('bank.durationLabel')}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.creditScore')}</p>
                              <p className={`font-semibold ${getScoreColor(offer.creditScore || creditScore)}`}>
                                {offer.creditScore || creditScore}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.interestRate')}</p>
                              <p className="font-semibold text-orange-500 dark:text-orange-400">
                                {(offer.interestRate * 100).toFixed(2)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.monthlyPayment')}</p>
                              <p className="font-semibold">{formatMoney(offer.monthlyPayment)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.totalInterest')}</p>
                              <p className="font-semibold text-yellow-600 dark:text-yellow-400">
                                {formatMoney(offer.totalInterest)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.totalRepayment')}</p>
                              <p className="font-semibold">{formatMoney(offer.totalRepayment)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('bank.riskLevel')}</p>
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${getRiskStyle(offer.riskLevel)}`}
                              >
                                {getRiskLabel(offer.riskLevel, t)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm">
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 mb-2">
                              {t('bank.rejected')}
                            </span>
                            <p className="text-gray-600 dark:text-gray-300">{getRejectionLabel(offer.reason, t)}</p>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handleApply}
                        disabled={
                          !offer?.approved ||
                          applying ||
                          offerLoading ||
                          offer?.amount !== clampedAmount ||
                          offer?.durationMonths !== clampedDuration
                        }
                        className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-gray-900 dark:text-white py-2 rounded transition-colors mt-3"
                      >
                        {applying ? t('common.loading') : t('bank.takeLoan')}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">{t('bank.noProducts')}</p>
              )}
            </div>
          </div>

          <div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-4">
              <h2 className="text-lg font-bold mb-3">
                {t('bank.activeLoans')} ({loans?.length || 0})
              </h2>
              {!loans || loans.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">{t('bank.noLoans')}</p>
              ) : (
                <div className="space-y-3">
                  {loans.map((loan, idx) => (
                    <div key={loan._id} className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-sm font-medium">
                          {getLoanTypeLabel(loan.type || 'personal', t)} #{idx + 1}
                        </p>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {t('bank.scoreAtApply')}: {loan.creditScoreAtApply}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">{t('bank.amount')}</p>
                          <p className="font-semibold">{formatMoney(loan.principal)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">{t('bank.remaining')}</p>
                          <p className="font-semibold">{formatMoney(loan.remainingBalance)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">{t('bank.interest')}</p>
                          <p className="font-semibold">{(loan.interestRate * 100).toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">{t('bank.ticksLeft')}</p>
                          <p className="font-semibold">{loan.ticksRemaining}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">{t('bank.paymentPerTick')}</p>
                          <p className="font-semibold text-orange-500 dark:text-orange-400">
                            {formatMoney(loan.paymentPerTick)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">{t('bank.missedPayments')}</p>
                          <p
                            className={`font-semibold ${loan.missedPayments > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}
                          >
                            {loan.missedPayments || 0}
                          </p>
                        </div>
                        {loan.riskLevel && (
                          <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs">{t('bank.riskLevel')}</p>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${getRiskStyle(loan.riskLevel)}`}
                            >
                              {getRiskLabel(loan.riskLevel, t)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input
                          type="number"
                          min="1"
                          max={loan.remainingBalance}
                          placeholder={t('bank.repayAmount')}
                          className="flex-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white"
                          value={repayAmounts[loan._id] || ''}
                          onChange={(e) => setRepayAmounts({ ...repayAmounts, [loan._id]: Number(e.target.value) })}
                        />
                        <button
                          onClick={() => handleRepay(loan._id)}
                          className="bg-orange-500 hover:bg-orange-400 text-gray-900 dark:text-white text-sm px-3 py-1 rounded transition-colors"
                        >
                          {t('bank.repay')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-4">
          <h2 className="text-lg font-bold mb-3">{t('bank.loanHistory')}</h2>
          {loanHistory.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">{t('bank.noHistory')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2">{t('bank.type')}</th>
                    <th className="pb-2">{t('bank.amount')}</th>
                    <th className="pb-2">{t('bank.interest')}</th>
                    <th className="pb-2">{t('bank.ticksLeft')}</th>
                    <th className="pb-2">{t('bank.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loanHistory.map((loan) => (
                    <tr key={loan._id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2">{getLoanTypeLabel(loan.type || 'personal', t)}</td>
                      <td className="py-2">{formatMoney(loan.principal)}</td>
                      <td className="py-2">{(loan.interestRate * 100).toFixed(2)}%</td>
                      <td className="py-2">{loan.ticksRemaining}</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            loan.active
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {loan.active ? t('bank.statusActive') : t('bank.statusClosed')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'credit' && (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-4">
          <h2 className="text-lg font-bold mb-3">{t('bank.creditHistory')}</h2>
          {creditHistory.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">{t('bank.noCreditHistory')}</p>
          ) : (
            <div className="space-y-2">
              {creditHistory.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <div>
                    <p className="text-sm font-medium">{getReasonLabel(entry.reason, t)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {t('bank.tick')} #{entry.tick}
                    </p>
                  </div>
                  <div className="text-end">
                    <p
                      className={`text-sm font-bold ${entry.change > 0 ? 'text-green-500' : entry.change < 0 ? 'text-red-500' : 'text-gray-400'}`}
                    >
                      {entry.change > 0 ? '+' : ''}
                      {entry.change}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {t('bank.score')}: {entry.score}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
