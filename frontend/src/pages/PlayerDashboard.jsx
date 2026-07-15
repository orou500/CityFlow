import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import PeriodBonusWidget from '../components/PeriodBonusWidget';
import RentCollectionWidget from '../components/RentCollectionWidget';

export default function PlayerDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const {
    userData,
    fetchUserData,
    loans,
    sentOffers,
    receivedOffers,
    fetchSentOffers,
    fetchReceivedOffers,
    acceptOffer,
    rejectOffer,
    counterOffer,
    acceptCounterOffer,
    fetchUnreadCount,
  } = useGameStore();
  const [offersTab, setOffersTab] = useState('received');
  const [counterModal, setCounterModal] = useState(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [txPage, setTxPage] = useState(1);
  const TX_PER_PAGE = 5;
  const [propPage, setPropPage] = useState(1);
  const PROP_PER_PAGE = 8;

  useEffect(() => {
    fetchMe();
    fetchUserData();
    fetchSentOffers();
    fetchReceivedOffers();
    fetchUnreadCount();
  }, []);

  async function handleAccept(offerId) {
    try {
      await acceptOffer(offerId);
      fetchSentOffers();
      fetchReceivedOffers();
      fetchMe();
      fetchUserData();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleReject(offerId) {
    try {
      await rejectOffer(offerId);
      fetchReceivedOffers();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleCounter(offerId) {
    const amt = parseFloat(counterAmount);
    if (!amt || amt <= 0) return;
    try {
      await counterOffer(offerId, amt);
      setCounterModal(null);
      setCounterAmount('');
      fetchReceivedOffers();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleAcceptCounter(offerId) {
    try {
      await acceptCounterOffer(offerId);
      fetchSentOffers();
      fetchReceivedOffers();
      fetchMe();
      fetchUserData();
    } catch (e) {
      alert(e.message);
    }
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  const data = userData || { user, properties: [], transactions: [] };
  const totalValue = data.properties?.reduce((sum, p) => sum + (p.currentPrice || 0), 0) || 0;
  const totalIncome = data.transactions?.filter((t) => t.type === 'rent').reduce((sum, t) => sum + t.price, 0) || 0;
  const netWorth = (data.user?.balance || user.balance) + totalValue;
  const totalDebt = loans?.reduce((sum, l) => sum + l.remainingBalance, 0) || 0;

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <h1 className="text-2xl font-bold mb-6">{t('dashboard.title')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.balance')}</p>
          <p className="text-2xl font-bold text-orange-500 dark:text-orange-400">
            ${data.user?.balance?.toLocaleString() || user.balance?.toLocaleString()}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.totalValue')}</p>
          <p className="text-2xl font-bold text-orange-500 dark:text-orange-400">${totalValue.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('bank.netWorth')}</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">${netWorth.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('bank.totalDebt')}</p>
          <p
            className={`text-2xl font-bold ${totalDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}
          >
            ${totalDebt.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap">
        <Link
          to="/development"
          className="bg-orange-500 hover:bg-orange-400 text-gray-900 dark:text-white text-sm px-4 py-2 rounded transition-colors"
        >
          {t('nav.development')}
        </Link>
        <Link
          to="/bank"
          className="bg-yellow-600 hover:bg-yellow-500 text-gray-900 dark:text-white text-sm px-4 py-2 rounded transition-colors"
        >
          {t('bank.title')}
        </Link>
        <Link
          to="/marketplace"
          className="bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white text-sm px-4 py-2 rounded transition-colors"
        >
          {t('nav.marketplace')}
        </Link>
      </div>

      <div className="mb-6">
        <PeriodBonusWidget
          onClaimed={() => {
            fetchMe();
            fetchUserData();
          }}
        />
      </div>

      <div className="mb-6">
        <RentCollectionWidget
          onCollected={() => {
            fetchMe();
            fetchUserData();
          }}
        />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">{t('dashboard.properties')}</h2>
        {data.properties?.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">{t('dashboard.noProperties')}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.properties?.slice(0, propPage * PROP_PER_PAGE).map((p) => (
                <div
                  key={p._id}
                  className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg flex flex-col justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors min-h-[100px]"
                  onClick={() => navigate(`/property/${p._id}`)}
                >
                  <div>
                    <p className="font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      {p.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{p.cityId?.name || 'Unknown'}</p>
                  </div>
                  <div className="mt-2">
                    <p className="text-blue-600 dark:text-blue-400 font-semibold">
                      ${p.currentPrice?.toLocaleString()}
                    </p>
                    {p.rent > 0 && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {t('city.rent')}: ${p.rent?.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {data.properties.length > PROP_PER_PAGE && (
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('dashboard.showing', {
                    shown: Math.min(propPage * PROP_PER_PAGE, data.properties.length),
                    total: data.properties.length,
                  })}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPropPage((p) => Math.max(1, p - 1))}
                    disabled={propPage === 1}
                    className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    {t('common.previous')}
                  </button>
                  <button
                    onClick={() => setPropPage((p) => p + 1)}
                    disabled={propPage * PROP_PER_PAGE >= data.properties.length}
                    className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    {t('common.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">{t('dashboard.income')}</h2>
        <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">${totalIncome.toLocaleString()}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('dashboard.totalRent')}</p>
        {loans && loans.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {t('bank.activeLoans')} ({loans.length})
            </p>
            {loans.slice(0, 3).map((loan) => (
              <div key={loan._id} className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">${loan.principal?.toLocaleString()}</span>
                <span
                  className={
                    loan.missedPayments > 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
                  }
                >
                  {loan.ticksRemaining} {t('general.periods')} left
                </span>
              </div>
            ))}
            {loans.length > 3 && (
              <Link
                to="/bank"
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-300 mt-1 inline-block"
              >
                +{loans.length - 3} more...
              </Link>
            )}
          </div>
        )}
      </div>

      {(sentOffers.length > 0 || receivedOffers.length > 0) && (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-xl font-bold">{t('offers.title')}</h2>
            <button
              onClick={() => setOffersTab('received')}
              className={`text-sm px-3 py-1 rounded ${offersTab === 'received' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
            >
              {t('offers.received', { count: receivedOffers.length })}
            </button>
            <button
              onClick={() => setOffersTab('sent')}
              className={`text-sm px-3 py-1 rounded ${offersTab === 'sent' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
            >
              {t('offers.sent', { count: sentOffers.length })}
            </button>
          </div>

          {offersTab === 'received' && receivedOffers.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('offers.noOffersReceived')}</p>
          )}
          {offersTab === 'received' &&
            receivedOffers.map((o) => (
              <div
                key={o._id}
                className="bg-gray-50 dark:bg-gray-800 p-3 rounded mb-2 text-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-2"
              >
                <div>
                  <p className="text-gray-900 dark:text-white font-semibold">{o.propertyId?.name || 'Property'}</p>
                  <p className="text-gray-500 dark:text-gray-400">
                    {o.buyerId?.username} {t('offers.offered')}{' '}
                    <span className="text-blue-600 dark:text-blue-400">
                      ${(o.counterOffer || o.offerAmount)?.toLocaleString()}
                    </span>
                    {o.counterOffer ? t('offers.counterSuffix') : ''}
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${o.status === 'pending' ? 'bg-yellow-900 text-yellow-300' : o.status === 'countered' ? 'bg-blue-900 text-blue-300' : o.status === 'accepted' ? 'bg-green-900 text-green-300' : o.status === 'rejected' ? 'bg-red-900 text-red-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
                  >
                    {t('offers.status' + o.status.charAt(0).toUpperCase() + o.status.slice(1))}
                  </span>
                </div>
                {o.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(o._id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white text-xs rounded"
                    >
                      {t('offers.accept')}
                    </button>
                    <button
                      onClick={() => {
                        setCounterModal(o._id);
                        setCounterAmount('');
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white text-xs rounded"
                    >
                      {t('offers.counter')}
                    </button>
                    <button
                      onClick={() => handleReject(o._id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-gray-900 dark:text-white text-xs rounded"
                    >
                      {t('offers.reject')}
                    </button>
                  </div>
                )}
              </div>
            ))}

          {offersTab === 'sent' && sentOffers.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('offers.noOffersSent')}</p>
          )}
          {offersTab === 'sent' &&
            sentOffers.map((o) => (
              <div
                key={o._id}
                className="bg-gray-50 dark:bg-gray-800 p-3 rounded mb-2 text-sm flex justify-between items-center"
              >
                <div>
                  <p className="text-gray-900 dark:text-white font-semibold">{o.propertyId?.name || 'Property'}</p>
                  <p className="text-gray-500 dark:text-gray-400">
                    {t('offers.to')} {o.sellerId?.username}:{' '}
                    <span className="text-blue-600 dark:text-blue-400">
                      ${(o.counterOffer || o.offerAmount)?.toLocaleString()}
                    </span>
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${o.status === 'pending' ? 'bg-yellow-900 text-yellow-300' : o.status === 'countered' ? 'bg-blue-900 text-blue-300' : o.status === 'accepted' ? 'bg-green-900 text-green-300' : o.status === 'rejected' ? 'bg-red-900 text-red-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
                  >
                    {t('offers.status' + o.status.charAt(0).toUpperCase() + o.status.slice(1))}
                  </span>
                </div>
                {o.status === 'countered' && (
                  <button
                    onClick={() => handleAcceptCounter(o._id)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white text-xs rounded"
                  >
                    {t('offers.acceptCounter')}
                  </button>
                )}
              </div>
            ))}

          {counterModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-xs">
                <h3 className="text-gray-900 dark:text-white font-semibold mb-3">{t('offers.counterOffer')}</h3>
                <input
                  type="number"
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  placeholder={t('offers.yourCounterAmount')}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-gray-900 dark:text-white text-sm mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCounter(counterModal)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white text-sm rounded"
                  >
                    {t('offers.send')}
                  </button>
                  <button
                    onClick={() => setCounterModal(null)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-500 text-gray-900 dark:text-white text-sm rounded"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">{t('dashboard.transactions')}</h2>
        {data.transactions?.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">{t('dashboard.noTransactions')}</p>
        ) : (
          <>
            <div className="space-y-2">
              {data.transactions?.slice(0, txPage * TX_PER_PAGE).map((tx) => (
                <div key={tx._id} className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-sm flex justify-between">
                  <div>
                    <span
                      className={`font-semibold ${
                        tx.type === 'buy'
                          ? 'text-red-600 dark:text-red-400'
                          : tx.type === 'sell'
                            ? 'text-green-600 dark:text-green-400'
                            : tx.type === 'rent'
                              ? 'text-purple-600 dark:text-purple-400'
                              : tx.type === 'loan'
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : tx.type === 'loan_payment'
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : tx.type === 'loan_repay'
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : tx.type === 'penalty'
                                      ? 'text-red-600'
                                      : tx.type === 'repossess'
                                        ? 'text-red-800'
                                        : tx.type === 'construction'
                                          ? 'text-yellow-600 dark:text-yellow-400'
                                          : tx.type === 'upgrade'
                                            ? 'text-blue-600 dark:text-blue-400'
                                            : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {t(`transaction.type.${tx.type}`)}
                    </span>
                    {tx.propertyId && (
                      <span
                        className="text-gray-500 dark:text-gray-400 ms-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        onClick={() => navigate(`/property/${tx.propertyId._id || tx.propertyId}`)}
                      >
                        {tx.propertyId.name || 'Property'}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-600 dark:text-gray-300">${tx.price?.toLocaleString()}</span>
                </div>
              ))}
            </div>
            {data.transactions?.length > TX_PER_PAGE && (
              <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700 mt-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('dashboard.showing', {
                    shown: Math.min(txPage * TX_PER_PAGE, data.transactions.length),
                    total: data.transactions.length,
                  })}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                    disabled={txPage === 1}
                    className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('marketplace.previous')}
                  </button>
                  <button
                    onClick={() => setTxPage((p) => p + 1)}
                    disabled={txPage * TX_PER_PAGE >= data.transactions.length}
                    className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('marketplace.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
