import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { translateError } from '../i18n/errors';
import { formatMoney } from '../utils/format';
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

export default function BankPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const API = getApiBaseUrl();
  const { user, fetchMe } = useAuthStore();
  const { loans, fetchLoans, fetchLoanOptions, applyLoan, repayLoan, fetchUserData } = useGameStore();
  const [summary, setSummary] = useState(null);
  const [options, setOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [repayAmounts, setRepayAmounts] = useState({});
  const [loanHistory, setLoanHistory] = useState([]);
  const [creditHistory, setCreditHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

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
      .then(setOptions)
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

  const handleApply = async () => {
    if (!selectedOption) return;
    setApplying(true);
    setError(null);
    try {
      await applyLoan(selectedOption.productId, selectedOption.principal, selectedOption.durationTicks);
      fetchData();
      setSelectedOption(null);
    } catch (err) {
      setError(translateError(err, t));
    }
    setApplying(false);
  };

  const handleRepay = async (loanId) => {
    const amount = repayAmounts[loanId];
    if (!amount || amount <= 0) return;
    try {
      await repayLoan(loanId, amount);
      fetchData();
    } catch {}
  };

  if (!user) return null;

  const creditScore = summary?.creditScore || user.creditScore || 650;
  const scoreWidth = getScoreWidth(creditScore);

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
                <div className="space-y-2 mb-3">
                  {options.map((opt) => (
                    <div
                      key={`${opt.productId}-${opt.principal}-${opt.durationTicks}`}
                      onClick={() => setSelectedOption(opt)}
                      className={`block p-3 rounded border cursor-pointer transition-colors ${
                        selectedOption?.productId === opt.productId &&
                        selectedOption?.principal === opt.principal &&
                        selectedOption?.durationTicks === opt.durationTicks
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{formatMoney(opt.principal)}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                              {getLoanTypeLabel(opt.productId, t)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {opt.durationTicks} {t('general.months')} &middot; {(opt.interestRate * 100).toFixed(1)}%{' '}
                            {t('bank.interest')}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-orange-500 dark:text-orange-400">
                            {formatMoney(opt.paymentPerTick)}/{t('general.period')}
                          </p>
                        </div>
                      </div>
                      {selectedOption?.productId === opt.productId &&
                        selectedOption?.principal === opt.principal &&
                        selectedOption?.durationTicks === opt.durationTicks && (
                          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 grid grid-cols-2 gap-1">
                            <span>
                              {t('bank.totalRepayment')}:{' '}
                              <span className="text-gray-900 dark:text-white">{formatMoney(opt.totalRepayment)}</span>
                            </span>
                            <span>
                              {t('bank.interestCost')}:{' '}
                              <span className="text-yellow-600 dark:text-yellow-400">
                                {formatMoney(opt.totalInterest)}
                              </span>
                            </span>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">{t('bank.noProducts')}</p>
              )}
              <button
                onClick={handleApply}
                disabled={!selectedOption || applying}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-gray-900 dark:text-white py-2 rounded transition-colors"
              >
                {applying ? t('common.loading') : t('bank.applyLoan')}
              </button>
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
                        {loan.creditScoreAtApply && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {t('bank.scoreAtApply')}: {loan.creditScoreAtApply}
                          </span>
                        )}
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
                          <p className="font-semibold">{(loan.interestRate * 100).toFixed(1)}%</p>
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
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
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
                      <td className="py-2">{(loan.interestRate * 100).toFixed(1)}%</td>
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
                  <div className="text-right">
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
