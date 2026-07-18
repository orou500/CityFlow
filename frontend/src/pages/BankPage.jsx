import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { translateError } from '../i18n/errors';
import { formatMoney } from '../utils/format';
import CompactValue from '../components/CompactValue';

export default function BankPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const { loans, fetchLoans, fetchLoanOptions, applyLoan, repayLoan, fetchUserData } = useGameStore();
  const [options, setOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [repayAmounts, setRepayAmounts] = useState({});

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchMe();
    fetchUserData();
    fetchLoans();
    fetchLoanOptions()
      .then(setOptions)
      .catch(() => {});
    fetch('/api/bank/summary', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
  }, []);

  const handleApply = async () => {
    if (!selectedOption) return;
    setApplying(true);
    setError(null);
    try {
      await applyLoan(selectedOption.principal, selectedOption.durationTicks);
      fetchMe();
      fetchLoans();
      fetchUserData();
      setSelectedOption(null);
      fetch('/api/bank/summary', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
        .then((r) => r.json())
        .then(setSummary)
        .catch(() => {});
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
      fetchMe();
      fetchLoans();
      fetchUserData();
      fetch('/api/bank/summary', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
        .then((r) => r.json())
        .then(setSummary)
        .catch(() => {});
    } catch {}
  };

  if (!user) return null;

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <h1 className="text-2xl font-bold mb-6">{t('bank.title')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('bank.cash')}</p>
          <p className="text-2xl font-bold text-orange-500 dark:text-orange-400">
            <CompactValue value={summary?.balance || user.balance} />
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('bank.netWorth')}</p>
          <p className="text-2xl font-bold text-orange-500 dark:text-orange-400">
            <CompactValue value={summary?.netWorth} />
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('bank.totalDebt')}</p>
          <p
            className={`text-2xl font-bold ${summary?.totalDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}
          >
            <CompactValue value={summary?.totalDebt} />
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('bank.loanCount')}</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{summary?.loanCount || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">{t('bank.newLoan')}</h2>
            {summary && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {t('bank.maxLoan')}: <CompactValue value={summary.maxLoan} />
              </p>
            )}
            {error && <p className="text-red-600 dark:text-red-400 text-sm mb-2">{error}</p>}
            {options.length > 0 && (
              <div className="space-y-2 mb-4">
                {options.map((opt) => (
                  <label
                    key={`${opt.principal}-${opt.durationTicks}`}
                    className={`block p-3 rounded border cursor-pointer transition-colors ${
                      selectedOption?.principal === opt.principal && selectedOption?.durationTicks === opt.durationTicks
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <input type="radio" name="loanOption" className="sr-only" onChange={() => setSelectedOption(opt)} />
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{formatMoney(opt.principal)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {opt.durationTicks} {t('bank.duration')}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-orange-500 dark:text-orange-400">
                          {formatMoney(opt.paymentPerTick)}/{t('general.period')}
                        </p>
                        <p className="text-gray-500 dark:text-gray-400">
                          {(opt.interestRate * 100).toFixed(1)}% {t('bank.interest')}
                        </p>
                      </div>
                    </div>
                    {selectedOption?.principal === opt.principal &&
                      selectedOption?.durationTicks === opt.durationTicks && (
                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 grid grid-cols-2 gap-2">
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
                          <span>
                            {t('bank.paymentPerTick')}:{' '}
                            <span className="text-orange-500 dark:text-orange-400">
                              {formatMoney(opt.paymentPerTick)}
                            </span>
                          </span>
                        </div>
                      )}
                  </label>
                ))}
              </div>
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
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">
              {t('bank.activeLoans')} ({loans?.length || 0})
            </h2>
            {!loans || loans.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">{t('bank.noLoans')}</p>
            ) : (
              <div className="space-y-3">
                {loans.map((loan, idx) => (
                  <div key={loan._id} className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Loan #{idx + 1}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">{t('bank.amount')}</p>
                        <p className="font-semibold">{formatMoney(loan.principal)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">{t('bank.remaining')}</p>
                        <p className="font-semibold">{formatMoney(loan.remainingBalance)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">{t('bank.interest')}</p>
                        <p className="font-semibold">{(loan.interestRate * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">{t('bank.ticksLeft')}</p>
                        <p className="font-semibold">{loan.ticksRemaining}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">{t('bank.paymentPerTick')}</p>
                        <p className="font-semibold text-orange-500 dark:text-orange-400">
                          {formatMoney(loan.paymentPerTick)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">{t('bank.missedPayments')}</p>
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
    </div>
  );
}
