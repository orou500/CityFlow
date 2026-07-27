import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../utils/capacitor';
import { useAuthStore } from '../store/useAuthStore';
import { formatMoney } from '../utils/format';
import { useSocket, useSocketEvent } from '../hooks/useSocket';

const API = getApiBaseUrl();

function getProperty(auction) {
  const p = auction.property || auction.propertyId || {};
  return typeof p === 'object' ? p : {};
}

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'Request failed');
  return data;
}

const STATUS_STYLES = {
  upcoming: { bg: 'bg-yellow-900/70', text: 'text-yellow-300', border: 'border-yellow-600', icon: '⏳' },
  active: { bg: 'bg-emerald-900/70', text: 'text-emerald-300', border: 'border-emerald-600', icon: '🔴' },
  ending: { bg: 'bg-purple-900/70', text: 'text-purple-300', border: 'border-purple-600', icon: '⏰' },
  ended: { bg: 'bg-gray-800/70', text: 'text-gray-300', border: 'border-gray-600', icon: '🏁' },
  cancelled: { bg: 'bg-red-900/70', text: 'text-red-300', border: 'border-red-600', icon: '❌' },
};

const RARITY_STYLES = {
  uncommon: { text: 'text-emerald-400', badge: 'bg-emerald-900/60 border-emerald-600' },
  rare: { text: 'text-blue-400', badge: 'bg-blue-900/60 border-blue-600' },
  legendary: { text: 'text-amber-400', badge: 'bg-amber-900/60 border-amber-600' },
};

const SELLER_ICONS = { bank: '🏦', player: '👤', event: '🎯' };

function TickCountdown({ endTick, currentTick, status, className }) {
  const { t } = useTranslation();
  const ticksLeft = Math.max(0, (endTick || 0) - (currentTick || 0));
  const isUrgent = status === 'active' && ticksLeft <= 2;

  if (status === 'ended' || status === 'cancelled') {
    return <span className={className}>{t(`auctions.status.${status}`)}</span>;
  }
  if (status === 'ending') {
    return <span className={`${className} text-purple-400 font-medium`}>⏰ {t('auctions.finalizing')}</span>;
  }
  if (status === 'upcoming') {
    return (
      <span className={className}>
        {t('auctions.startsIn', { count: Math.max(0, (endTick || 0) - (currentTick || 0)) })}
      </span>
    );
  }
  return (
    <span className={`${className} ${isUrgent ? 'text-red-400 font-bold animate-pulse' : ''}`}>
      {t('auctions.ticksLeft', { count: ticksLeft })}
    </span>
  );
}

function FeaturedSection({ auctions, onSelect }) {
  const { t } = useTranslation();
  if (!auctions || auctions.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <span>🔥</span> {t('auctions.featured')}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {auctions.slice(0, 3).map((a) => (
          <FeaturedCard key={a._id} auction={a} onClick={onSelect} />
        ))}
      </div>
    </div>
  );
}

function FeaturedCard({ auction, onClick }) {
  const { t } = useTranslation();
  const property = getProperty(auction);
  const isEndingSoon = auction.isEndingSoon;
  const isHot = auction.totalBids >= 3;

  return (
    <button
      onClick={() => onClick(auction)}
      className="relative w-full text-left bg-gradient-to-br from-gray-800 via-gray-850 to-gray-900 border-2 border-amber-700/50 hover:border-amber-500 rounded-xl p-4 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-900/30"
    >
      <div className="absolute top-2 right-2 flex gap-1">
        {isEndingSoon && (
          <span className="text-xs bg-red-900/70 text-red-300 px-1.5 py-0.5 rounded border border-red-700">⚡</span>
        )}
        {isHot && (
          <span className="text-xs bg-orange-900/70 text-orange-300 px-1.5 py-0.5 rounded border border-orange-700">
            🔥
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-white truncate pr-16">
        {property?.name || t('auctions.unknownProperty')}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        {SELLER_ICONS[auction.sellerType]}{' '}
        {auction.sellerId?.username || t(`auctions.sellerTypes.${auction.sellerType}`)}
        {property?.propertyRating && (
          <span className={`ml-2 ${RARITY_STYLES[property.propertyRating]?.text || ''}`}>
            💎 {t(`auctions.ratings.${property.propertyRating}`)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-3">
        <div>
          <div className="text-xs text-gray-500">{t('auctions.currentBid')}</div>
          <div className="text-base font-bold text-white">{formatMoney(auction.currentBid || auction.startingBid)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">{t('auctions.timeLeft')}</div>
          <TickCountdown
            endTick={auction.endTick}
            currentTick={auction.currentTick}
            status={auction.status}
            className="text-sm text-white"
          />
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-2">
        {t('auctions.bids')}: {auction.totalBids || 0}
        {auction.uniqueBidders ? ` · ${t('auctions.uniqueBidders')}: ${auction.uniqueBidders}` : ''}
      </div>
    </button>
  );
}

function AnalyticsPanel({ stats }) {
  const { t } = useTranslation();
  if (!stats) return null;

  return (
    <div className="mb-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <span>📊</span> {t('auctions.analytics')}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('auctions.totalAuctions')} value={stats.totalAuctions || 0} />
        <StatCard label={t('auctions.totalVolume')} value={formatMoney(stats.totalVolume || 0)} />
        <StatCard label={t('auctions.averageSalePrice')} value={formatMoney(stats.averageSalePrice || 0)} />
        <StatCard label={t('auctions.averageBidsPerAuction')} value={(stats.averageBidsPerAuction || 0).toFixed(1)} />
      </div>
      {stats.highestAuctionEver?.propertyName && (
        <div className="mt-3 text-sm text-gray-400">
          🏆 {t('auctions.highestAuctionEver')}:{' '}
          <span className="text-yellow-400">{stats.highestAuctionEver.propertyName}</span> —{' '}
          {formatMoney(stats.highestAuctionEver.winningBid)}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
        {stats.mostActiveCity && (
          <span>
            📍 {t('auctions.mostActiveCity')}: {stats.mostActiveCity}
          </span>
        )}
        {stats.mostActiveDistrict && (
          <span>
            🏘️ {t('auctions.mostActiveDistrict')}: {stats.mostActiveDistrict}
          </span>
        )}
        {stats.mostSuccessfulSeller?.username && (
          <span>
            👑 {t('auctions.mostSuccessfulSeller')}: {stats.mostSuccessfulSeller.username} (
            {formatMoney(stats.mostSuccessfulSeller.volume)})
          </span>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-3 text-center border border-gray-700/50">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-base font-bold text-white">{value}</div>
    </div>
  );
}

function AuctionCard({ auction, onClick, onWatch, isWatched, user }) {
  const { t } = useTranslation();
  const statusStyle = STATUS_STYLES[auction.status] || STATUS_STYLES.active;
  const property = getProperty(auction);
  const isHot = (auction.totalBids || 0) >= 3;
  const isEndingSoon =
    auction.isEndingSoon ||
    (auction.status === 'active' &&
      (auction.ticksRemaining ?? Math.max(0, (auction.endTick || 0) - (auction.currentTick || 0))) <= 2);
  const isOwner = user && (auction.sellerId?._id || auction.sellerId)?.toString() === user._id?.toString();
  const canCancel = isOwner && auction.totalBids === 0 && auction.status === 'upcoming';
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel(e) {
    e.stopPropagation();
    if (!window.confirm(t('auctions.cancelConfirm'))) return;
    setCancelling(true);
    try {
      await api(`/auctions/${auction._id}/cancel`, { method: 'POST' });
      window.location.reload();
    } catch {
      setCancelling(false);
    }
  }

  return (
    <button
      onClick={() => onClick(auction)}
      className={`w-full text-left bg-gray-800/80 border-l-4 ${statusStyle.border} border-gray-700 hover:border-gray-500 hover:border-l-4 rounded-lg p-4 transition-all hover:bg-gray-800`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {property?.name || t('auctions.unknownProperty')}
            </span>
            {auction.sellerType === 'bank' && <span title={t('auctions.bankAuction')}>🏦</span>}
            {isHot && <span title={t('auctions.hot')}>🔥</span>}
            {auction.auctionType === 'reserve' && <span title={t('auctions.reserve')}>💎</span>}
            {auction.reserveMet && <span title={t('auctions.reserveMet')}>✅</span>}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {property?.type && t(`auctions.propertyTypes.${property.type}`)}
            {property?.propertyRating && (
              <span className={`ml-2 ${RARITY_STYLES[property.propertyRating]?.text || ''}`}>
                {t(`auctions.ratings.${property.propertyRating}`)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-2">
          {user && auction.status === 'active' && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onWatch(auction._id);
              }}
              className="cursor-pointer text-sm hover:scale-110 transition-transform"
              title={isWatched ? t('auctions.unwatch') : t('auctions.watch')}
            >
              {isWatched ? '👁️' : '👁️‍🗨️'}
            </span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}
          >
            {statusStyle.icon} {t(`auctions.status.${auction.status}`)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3">
        <div>
          <div className="text-xs text-gray-500">{t('auctions.currentBid')}</div>
          <div className="text-sm font-semibold text-white">
            {formatMoney(auction.currentBid || auction.startingBid)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">{t('auctions.bids')}</div>
          <div className="text-sm text-white">{auction.totalBids || 0}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">{t('auctions.timeLeft')}</div>
          <TickCountdown
            endTick={auction.endTick}
            currentTick={auction.currentTick}
            status={auction.status}
            className="text-sm text-white"
          />
        </div>
      </div>

      {property?.roi != null && (
        <div className="mt-2 text-xs text-green-400">
          {t('auctions.roi')}: {(property.roi * 100).toFixed(1)}%
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500">
          {t('auctions.minNextBid')}:{' '}
          {formatMoney(
            (auction.currentBid || 0) > 0
              ? (auction.currentBid || 0) + (auction.bidIncrement || 0)
              : auction.startingBid,
          )}
        </span>
        <div className="flex items-center gap-2">
          {isEndingSoon && auction.status === 'active' && (
            <span className="text-xs text-red-400 animate-pulse">⚡ {t('auctions.endingSoon')}</span>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="text-xs bg-red-900/50 border border-red-700 text-red-300 px-2 py-0.5 rounded hover:bg-red-800/50 transition-colors disabled:opacity-50"
            >
              ❌ {cancelling ? t('auctions.cancelling') : t('auctions.cancelAuction')}
            </button>
          )}
        </div>
      </div>
    </button>
  );
}

function ActivityFeed({ activities }) {
  const { t } = useTranslation();
  if (!activities || activities.length === 0) return null;

  const icons = {
    bid: '💰',
    outbid: '⚠️',
    reserve_met: '✅',
    extended: '⏰',
    watched: '👁️',
    unwatched: '🙈',
    created: '🆕',
    ended: '🏁',
    won: '🏆',
  };

  return (
    <div className="bg-gradient-to-br from-gray-800/90 to-gray-900 rounded-xl p-4 border border-gray-700/40">
      <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">📋 {t('auctions.activityFeed')}</h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {activities.map((act, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span>{icons[act.type] || '📌'}</span>
            <div className="flex-1 min-w-0">
              <span className="text-gray-300">{act.username || t('auctions.system')}</span>
              {act.amount ? <span className="text-white ml-1">{formatMoney(act.amount)}</span> : null}
              {act.message && <span className="text-gray-500 ml-1 text-xs">— {act.message}</span>}
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">T{act.tick}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReputationBadge({ reputation }) {
  const { t } = useTranslation();
  if (!reputation) return null;

  return (
    <div className="bg-gradient-to-br from-gray-800/90 to-gray-900 rounded-xl p-4 border border-gray-700/40">
      <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">👑 {t('auctions.reputation')}</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-400">{t('auctions.auctionsWon')}: </span>
          <span className="text-green-400 font-medium">{reputation.auctionsWon || 0}</span>
        </div>
        <div>
          <span className="text-gray-400">{t('auctions.auctionsSold')}: </span>
          <span className="text-blue-400 font-medium">{reputation.auctionsSold || 0}</span>
        </div>
        <div>
          <span className="text-gray-400">{t('auctions.totalVolume')}: </span>
          <span className="text-white">{formatMoney(reputation.totalVolume || 0)}</span>
        </div>
        <div>
          <span className="text-gray-400">{t('auctions.winRate')}: </span>
          <span className="text-yellow-400">{(reputation.winRate || 0).toFixed(1)}%</span>
        </div>
        {reputation.highestWinningBid > 0 && (
          <div>
            <span className="text-gray-400">{t('auctions.highestBid')}: </span>
            <span className="text-purple-400">{formatMoney(reputation.highestWinningBid)}</span>
          </div>
        )}
        {reputation.totalProfit > 0 && (
          <div>
            <span className="text-gray-400">{t('auctions.totalProfit')}: </span>
            <span className="text-green-400">+{formatMoney(reputation.totalProfit)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AuctionDetail({ auction, onClose, onBid, onWatch, isWatched }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(auction);
  const [refreshing, setRefreshing] = useState(false);
  const [reputation, setReputation] = useState(null);
  const [showCompanyBid, setShowCompanyBid] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const activityRef = useRef([]);

  const property = getProperty(detail);
  const ticksLeft = detail.ticksRemaining ?? Math.max(0, (detail.endTick || 0) - (detail.currentTick || 0));
  const isOwner = user && detail.sellerId?._id === user._id;
  const isWinning = user && detail.currentBidderId?._id === user._id;
  const minNextBid =
    (detail.currentBid || 0) > 0 ? (detail.currentBid || 0) + (detail.bidIncrement || 0) : detail.startingBid;
  const canCancel = isOwner && detail.totalBids === 0 && (detail.status === 'upcoming' || detail.status === 'active');

  const refreshDetail = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await api(`/auctions/${detail._id}`);
      setDetail(res.auction);
      activityRef.current = res.auction.activity || [];
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }, [detail._id]);

  useEffect(() => {
    refreshDetail();
    const interval = setInterval(refreshDetail, 15000);
    return () => clearInterval(interval);
  }, [refreshDetail]);

  useEffect(() => {
    if (detail.sellerId?._id) {
      api(`/auctions/reputation/${detail.sellerId._id}`)
        .then((res) => setReputation(res.reputation))
        .catch(() => {});
    }
  }, [detail.sellerId?._id]);

  useSocketEvent(
    'auction:bid',
    useCallback(
      (data) => {
        if (data.auctionId === detail._id) {
          setDetail((prev) => ({
            ...prev,
            currentBid: data.currentBid,
            currentBidderId: { _id: data.currentBidderId, username: data.currentBidderUsername },
            totalBids: data.totalBids,
            uniqueBidders: data.uniqueBidders,
            endTick: data.endTick,
          }));
          activityRef.current = [
            {
              type: 'bid',
              username: data.currentBidderUsername,
              amount: data.currentBid,
              tick: data.endTick,
              createdAt: new Date(),
            },
            ...activityRef.current,
          ].slice(0, 50);
        }
      },
      [detail._id],
    ),
  );

  useSocketEvent(
    'auction:extended',
    useCallback(
      (data) => {
        if (data.auctionId === detail._id) {
          setDetail((prev) => ({ ...prev, endTick: data.newEndTick }));
        }
      },
      [detail._id],
    ),
  );

  useSocketEvent(
    'auction:ended',
    useCallback(
      (data) => {
        if (data.auctionId === detail._id) {
          setDetail((prev) => ({ ...prev, status: 'ended', winnerId: data.winnerId, winningBid: data.winningBid }));
        }
      },
      [detail._id],
    ),
  );

  useSocketEvent(
    'auction:activity',
    useCallback(
      (data) => {
        if (data.auctionId === detail._id && data.activity) {
          activityRef.current = [data.activity, ...activityRef.current].slice(0, 50);
        }
      },
      [detail._id],
    ),
  );

  async function handleBid() {
    const amount = parseFloat(bidAmount);
    if (!amount || amount < minNextBid) {
      setError(t('auctions.bidTooLow', { min: formatMoney(minNextBid) }));
      return;
    }
    setBidding(true);
    setError(null);
    try {
      await api(`/auctions/${detail._id}/bid`, { method: 'POST', body: JSON.stringify({ amount }) });
      setBidAmount('');
      onBid();
      await refreshDetail();
      useAuthStore.getState().fetchMe();
    } catch (err) {
      setError(err.message);
    } finally {
      setBidding(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm(t('auctions.cancelConfirm'))) return;
    setCancelling(true);
    try {
      await api(`/auctions/${detail._id}/cancel`, { method: 'POST' });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to={`/property/${property?._id}`}
            className="text-lg font-bold text-white hover:text-blue-400 transition-colors"
          >
            {property?.name || t('auctions.unknownProperty')}
          </Link>
          {auction.sellerType === 'bank' && <span>🏦</span>}
          {auction.auctionType === 'reserve' && <span>💎</span>}
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <span className="text-xs text-gray-500 animate-pulse">↻</span>}
          {user && detail.status === 'active' && (
            <button
              onClick={() => onWatch(detail._id)}
              className={`text-sm px-2 py-1 rounded border transition-colors ${isWatched ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}
            >
              {isWatched ? `👁️ ${t('auctions.watching')}` : `👁️‍🗨️ ${t('auctions.watch')}`}
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">
            {t('auctions.close')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-blue-900/40 to-gray-900 rounded-lg p-3 text-center border border-blue-900/30">
          <div className="text-xs text-gray-400">{t('auctions.currentBid')}</div>
          <div className="text-lg font-bold text-white">{formatMoney(detail.currentBid || detail.startingBid)}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/40 to-gray-900 rounded-lg p-3 text-center border border-blue-900/30">
          <div className="text-xs text-gray-400">{t('auctions.totalBids')}</div>
          <div className="text-lg font-bold text-white">{detail.totalBids || 0}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/40 to-gray-900 rounded-lg p-3 text-center border border-blue-900/30">
          <div className="text-xs text-gray-400">{t('auctions.timeLeft')}</div>
          <TickCountdown
            endTick={detail.endTick}
            currentTick={detail.currentTick}
            status={detail.status}
            className="text-lg font-bold"
          />
        </div>
        <div className="bg-gradient-to-br from-blue-900/40 to-gray-900 rounded-lg p-3 text-center border border-blue-900/30">
          <div className="text-xs text-gray-400">{t('auctions.startingBid')}</div>
          <div className="text-lg font-bold text-gray-300">{formatMoney(detail.startingBid)}</div>
        </div>
      </div>

      {property && (
        <div className="bg-gradient-to-br from-gray-800/90 to-gray-900 rounded-xl p-4 border border-gray-700/40">
          <h3 className="text-sm font-medium text-white mb-2">{t('auctions.propertyDetails')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-gray-400">{t('auctions.type')}: </span>
              <span className="text-white">{t(`auctions.propertyTypes.${property.type}`)}</span>
            </div>
            <div>
              <span className="text-gray-400">{t('auctions.condition')}: </span>
              <span className="text-white">{property.condition}%</span>
            </div>
            <div>
              <span className="text-gray-400">{t('auctions.marketValue')}: </span>
              <span className="text-white">{formatMoney(property.currentPrice)}</span>
            </div>
            <div>
              <span className="text-gray-400">{t('auctions.rating')}: </span>
              <span className={RARITY_STYLES[property.propertyRating]?.text || 'text-white'}>
                {t(`auctions.ratings.${property.propertyRating}`)}
              </span>
            </div>
            {property.intrinsicValue > 0 && (
              <div>
                <span className="text-gray-400">{t('auctions.intrinsicValue')}: </span>
                <span className="text-white">{formatMoney(property.intrinsicValue)}</span>
              </div>
            )}
            {property.rent > 0 && (
              <div>
                <span className="text-gray-400">{t('auctions.rent')}: </span>
                <span className="text-green-400">{formatMoney(property.rent)}/tick</span>
              </div>
            )}
            {property.qualityScore != null && (
              <div>
                <span className="text-gray-400">{t('auctions.quality')}: </span>
                <span className="text-white">{property.qualityScore}/100</span>
              </div>
            )}
            {property.occupancy != null && (
              <div>
                <span className="text-gray-400">{t('auctions.occupancy')}: </span>
                <span className="text-white">{property.occupancy}%</span>
              </div>
            )}
            {property.roi != null && (
              <div>
                <span className="text-gray-400">{t('auctions.roi')}: </span>
                <span className="text-green-400">{(property.roi * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
          {property.valueToBid != null && (
            <div className="mt-2 text-xs text-green-400">
              💡 {t('auctions.valueToBid')}: {formatMoney(property.valueToBid)}
            </div>
          )}
        </div>
      )}

      <div className="bg-gradient-to-br from-gray-800/90 to-gray-900 rounded-xl p-4 border border-gray-700/40">
        <h3 className="text-sm font-medium text-white mb-2">{t('auctions.auctionInfo')}</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-400">{t('auctions.type')}: </span>
            <span className="text-white">{t(`auctions.auctionTypes.${detail.auctionType}`)}</span>
          </div>
          <div>
            <span className="text-gray-400">{t('auctions.source')}: </span>
            <span className="text-white">
              {SELLER_ICONS[detail.sellerType]}{' '}
              {detail.sellerId?.username || t(`auctions.sellerTypes.${detail.sellerType}`)}
            </span>
          </div>
          {detail.auctionType === 'reserve' && (
            <div>
              <span className="text-gray-400">{t('auctions.reservePrice')}: </span>
              <span className={detail.reserveMet ? 'text-green-400' : 'text-orange-400'}>
                {formatMoney(detail.reservePrice)} {detail.reserveMet ? '✅' : ''}
              </span>
            </div>
          )}
          {detail.winnerId && (
            <div>
              <span className="text-gray-400">{t('auctions.winner')}: </span>
              <span className="text-green-400">
                {detail.winnerId.username} ({formatMoney(detail.winningBid)})
              </span>
            </div>
          )}
          {detail.uniqueBidders > 0 && (
            <div>
              <span className="text-gray-400">{t('auctions.uniqueBidders')}: </span>
              <span className="text-white">{detail.uniqueBidders}</span>
            </div>
          )}
          {detail.watcherCount > 0 && (
            <div>
              <span className="text-gray-400">{t('auctions.watchers')}: </span>
              <span className="text-white">👁️ {detail.watcherCount}</span>
            </div>
          )}
        </div>
      </div>

      {detail.status === 'active' && !isOwner && user && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3">{t('auctions.placeBid')}</h3>
          {error && (
            <div className="bg-red-900/50 border border-red-800 text-red-300 px-3 py-2 rounded mb-3 text-sm">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder={minNextBid.toLocaleString()}
                min={minNextBid}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded pl-7 pr-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleBid}
              disabled={bidding}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
            >
              {bidding ? t('auctions.bidding') : t('auctions.placeBid')}
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {t('auctions.minNextBid')}: {formatMoney(minNextBid)}
          </div>
          {isWinning && <div className="text-xs text-green-400 mt-1">✅ {t('auctions.youAreWinning')}</div>}
          <div className="mt-3">
            <button
              onClick={() => setShowCompanyBid(true)}
              className="text-xs bg-purple-900/50 border border-purple-700 text-purple-300 px-3 py-1.5 rounded hover:bg-purple-800/50 transition-colors"
            >
              🏢 {t('auctions.companyBid')}
            </button>
          </div>
        </div>
      )}

      {(detail.status === 'active' || detail.status === 'upcoming') && isOwner && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between">
          <div className="text-sm text-gray-400">👤 {t('auctions.yourAuction')}</div>
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="text-xs bg-red-900/50 border border-red-700 text-red-300 px-3 py-1.5 rounded hover:bg-red-800/50 transition-colors disabled:opacity-50"
            >
              ❌ {cancelling ? t('auctions.cancelling') : t('auctions.cancelAuction')}
            </button>
          )}
        </div>
      )}

      {detail.bids?.length > 0 && (
        <div className="bg-gradient-to-br from-gray-800/90 to-gray-900 rounded-xl p-4 border border-gray-700/40">
          <h3 className="text-sm font-medium text-white mb-3">
            {t('auctions.bidHistory')} ({detail.bids.length})
          </h3>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {[...detail.bids].reverse().map((bid, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1">
                <span className="text-gray-400">
                  {bid.username || bid.bidderId?.username || t('auctions.unknownBidder')}
                  {user && bid.bidderId?._id === user._id && (
                    <span className="text-blue-400 ml-1">({t('auctions.you')})</span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-xs">T{bid.tick}</span>
                  <span className="text-white font-medium">{formatMoney(bid.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ActivityFeed activities={detail.activity} />

      {reputation && <ReputationBadge reputation={reputation} />}

      {showCompanyBid && (
        <CompanyBidModal
          auctionId={detail._id}
          minBid={minNextBid}
          onClose={() => setShowCompanyBid(false)}
          onSubmit={() => {
            setShowCompanyBid(false);
            refreshDetail();
          }}
        />
      )}
    </div>
  );
}

function CompanyBidModal({ auctionId, minBid, onClose, onSubmit }) {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/real-estate-companies/my')
      .then((res) => {
        setCompanies(res.companies || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit() {
    if (!selectedCompany || !amount) return;
    setSubmitting(true);
    setError(null);
    try {
      await api(`/auctions/${auctionId}/company-bid`, {
        method: 'POST',
        body: JSON.stringify({ companyId: selectedCompany, amount: parseFloat(amount) }),
      });
      onSubmit();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-4">🏢 {t('auctions.companyBid')}</h3>
        {error && (
          <div className="bg-red-900/50 border border-red-800 text-red-300 px-3 py-2 rounded mb-3 text-sm">{error}</div>
        )}
        {loading ? (
          <div className="text-gray-400 text-sm py-4">{t('auctions.loading')}</div>
        ) : companies.length === 0 ? (
          <div className="text-gray-400 text-sm py-4">{t('auctions.noCompanies')}</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">{t('auctions.selectCompany')}</label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded p-2 text-sm"
              >
                <option value="">{t('auctions.selectCompany')}</option>
                {companies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({t('auctions.treasury')}: {formatMoney(c.treasury?.balance || 0)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">{t('auctions.bidAmount')}</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={minBid}
                placeholder={minBid.toLocaleString()}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded p-2 text-sm"
              />
              <div className="text-xs text-gray-500 mt-1">
                {t('auctions.minNextBid')}: {formatMoney(minBid)}
              </div>
            </div>
            <div className="text-xs text-yellow-400">⚠️ {t('auctions.companyBidWarning')}</div>
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={submitting || !selectedCompany || !amount}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50"
              >
                {submitting ? t('auctions.submitting') : t('auctions.proposeBid')}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                {t('auctions.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SellPropertyModal({ onClose, onSubmit }) {
  const { t } = useTranslation();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [auctionType, setAuctionType] = useState('standard');
  const [reservePrice, setReservePrice] = useState('');
  const [duration, setDuration] = useState('medium');
  const [startingBid, setStartingBid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/properties?owned=true')
      .then((res) => setProperties(res.properties || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit() {
    if (!selectedProperty) {
      setError(t('auctions.selectProperty'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = { propertyId: selectedProperty, auctionType, duration };
      if (auctionType === 'reserve' && reservePrice) body.reservePrice = parseFloat(reservePrice);
      if (startingBid) body.startingBid = parseFloat(startingBid);
      await api('/auctions', { method: 'POST', body: JSON.stringify(body) });
      onSubmit();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-4">🏷️ {t('auctions.sellProperty')}</h3>
        {error && (
          <div className="bg-red-900/50 border border-red-800 text-red-300 px-3 py-2 rounded mb-3 text-sm">{error}</div>
        )}
        {loading ? (
          <div className="text-gray-400 text-sm py-4">{t('auctions.loading')}</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">{t('auctions.selectProperty')}</label>
              <select
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded p-2 text-sm"
              >
                <option value="">{t('auctions.selectProperty')}</option>
                {properties.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({formatMoney(p.currentPrice)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">{t('auctions.auctionType')}</label>
              <div className="flex gap-2">
                {['standard', 'reserve'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setAuctionType(type)}
                    className={`flex-1 py-2 rounded text-sm border transition-colors ${auctionType === type ? 'bg-blue-900 border-blue-700 text-blue-300' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                  >
                    {t(`auctions.auctionTypes.${type}`)}
                  </button>
                ))}
              </div>
            </div>
            {auctionType === 'reserve' && (
              <div>
                <label className="block text-sm text-gray-300 mb-1">{t('auctions.reservePrice')}</label>
                <input
                  type="number"
                  value={reservePrice}
                  onChange={(e) => setReservePrice(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 text-white rounded p-2 text-sm"
                  placeholder="0"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-300 mb-1">{t('auctions.duration')}</label>
              <div className="grid grid-cols-2 gap-2">
                {['short', 'medium', 'long', 'extended'].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`py-2 rounded text-sm border transition-colors ${duration === d ? 'bg-blue-900 border-blue-700 text-blue-300' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                  >
                    {t(`auctions.durations.${d}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                {t('auctions.startingBid')} ({t('auctions.optional')})
              </label>
              <input
                type="number"
                value={startingBid}
                onChange={(e) => setStartingBid(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded p-2 text-sm"
                placeholder={t('auctions.defaultAuto')}
              />
            </div>
            <div className="text-xs text-gray-500">💡 {t('auctions.listingFee', { percent: 5 })}</div>
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50"
              >
                {submitting ? t('auctions.creating') : t('auctions.createAuction')}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                {t('auctions.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuctionDashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  useSocket();
  const [activeTab, setActiveTab] = useState('active');
  const [auctions, setAuctions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [showSellModal, setShowSellModal] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [featured, setFeatured] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [watchedIds, setWatchedIds] = useState(new Set());

  const PAGE_SIZE = 5;

  const loadAuctions = useCallback(
    async (status, pageNum) => {
      setLoading(true);
      const offset = pageNum != null ? pageNum * PAGE_SIZE : 0;
      try {
        if (status === 'my-bids') {
          const res = await api(`/auctions/my/bids?limit=${PAGE_SIZE}&offset=${offset}`);
          setAuctions(res.auctions || []);
          setTotal(res.auctions?.length || 0);
        } else if (status === 'watchlist') {
          const res = await api(`/auctions/my/watchlist?limit=${PAGE_SIZE}&offset=${offset}`);
          setAuctions(res.auctions || []);
          setTotal(res.total || 0);
        } else if (status === 'history') {
          const res = await api(`/auctions/history/list?limit=${PAGE_SIZE}&offset=${offset}`);
          setAuctions(res.auctions || []);
          setTotal(res.total || 0);
        } else {
          const s = status === 'my-auctions' ? 'all' : status;
          let url = `/auctions?status=${s}&limit=${PAGE_SIZE}&offset=${offset}`;
          if (filterType !== 'all') url += `&propertyType=${filterType}`;
          if (status === 'my-auctions' && user) url += `&sellerId=${user._id}`;
          const res = await api(url);
          let filtered = res.auctions || [];
          if (status === 'my-auctions') {
            filtered = filtered.filter((a) => a.status !== 'cancelled');
          }
          setAuctions(filtered);
          setTotal(res.total || 0);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [filterType, user],
  );

  useEffect(() => {
    setPage(0);
    loadAuctions(activeTab, 0);
  }, [activeTab, loadAuctions, filterType]);

  useEffect(() => {
    loadAuctions(activeTab, page);
  }, [page]);

  useEffect(() => {
    api('/auctions/featured')
      .then((res) => setFeatured(res.auctions || []))
      .catch(() => {});
    api('/auctions/analytics')
      .then((res) => setAnalytics(res))
      .catch(() => {});
  }, []);

  useSocketEvent(
    'auction:ended',
    useCallback(() => {
      if (activeTab !== 'watchlist') loadAuctions(activeTab, page);
    }, [activeTab, loadAuctions, page]),
  );

  useSocketEvent(
    'auction:bid',
    useCallback((data) => {
      setAuctions((prev) =>
        prev.map((a) =>
          a._id === data.auctionId
            ? {
                ...a,
                currentBid: data.currentBid,
                totalBids: data.totalBids,
                uniqueBidders: data.uniqueBidders,
                endTick: data.endTick,
              }
            : a,
        ),
      );
    }, []),
  );

  useSocketEvent(
    'tick:completed',
    useCallback(() => {
      loadAuctions(activeTab, page);
      api('/auctions/featured')
        .then((res) => setFeatured(res.auctions || []))
        .catch(() => {});
      api('/auctions/analytics')
        .then((res) => setAnalytics(res))
        .catch(() => {});
    }, [activeTab, loadAuctions, page]),
  );

  useEffect(() => {
    if (selectedAuction) return;
    const interval = setInterval(() => loadAuctions(activeTab, page), 15000);
    const onFocus = () => loadAuctions(activeTab, page);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [activeTab, loadAuctions, selectedAuction, page]);

  function handleTabChange(tab) {
    setActiveTab(tab);
    setPage(0);
    setSelectedAuction(null);
    setError(null);
  }

  async function handleWatch(auctionId) {
    try {
      const res = await api(`/auctions/${auctionId}/watch`, { method: 'POST' });
      setWatchedIds((prev) => {
        const next = new Set(prev);
        if (res.watching) next.add(auctionId);
        else next.delete(auctionId);
        return next;
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function handleBidPlaced() {
    loadAuctions(activeTab, page);
  }
  function handleSellCreated() {
    setShowSellModal(false);
    loadAuctions(activeTab, page);
  }

  const tabs = useMemo(() => {
    const list = ['active', 'upcoming', 'my-auctions', 'my-bids', 'watchlist', 'history'];
    return list;
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (selectedAuction) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <AuctionDetail
          auction={selectedAuction}
          onClose={() => setSelectedAuction(null)}
          onBid={handleBidPlaced}
          onWatch={handleWatch}
          isWatched={watchedIds.has(selectedAuction._id)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">🔨 {t('auctions.title')}</h1>
          <p className="text-gray-400 mt-1">{t('auctions.subtitle')}</p>
        </div>
        {user && (
          <button
            onClick={() => setShowSellModal(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white font-medium px-4 py-2 rounded transition-colors text-sm"
          >
            🏷️ {t('auctions.sellProperty')}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-800 text-red-300 px-4 py-3 rounded mb-4 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ml-2">
            {t('auctions.dismiss')}
          </button>
        </div>
      )}

      <FeaturedSection auctions={featured} onSelect={setSelectedAuction} />
      <AnalyticsPanel stats={analytics} />

      <div className="flex flex-wrap gap-1 mb-4 bg-gray-800 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`flex-shrink-0 py-2 px-3 rounded text-sm font-medium transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {t(`auctions.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === 'active' && (
        <div className="flex flex-wrap gap-2 mb-4">
          {['all', 'apartment', 'house', 'commercial', 'land'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 rounded text-xs transition-colors whitespace-nowrap ${filterType === type ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              {t(`auctions.propertyTypes.${type}`)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">{t('auctions.loading')}</div>
      ) : auctions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">{t('auctions.noAuctions')}</div>
      ) : (
        <div className="space-y-2">
          {auctions.map((a) => (
            <AuctionCard
              key={a._id}
              auction={a}
              onClick={setSelectedAuction}
              onWatch={handleWatch}
              isWatched={watchedIds.has(a._id)}
              user={user}
            />
          ))}
        </div>
      )}

      {totalPages > 0 && auctions.length > 0 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded text-sm hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← {t('auctions.prev')}
          </button>
          <span className="text-sm text-gray-400">
            {t('auctions.page')} {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded text-sm hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('auctions.next')} →
          </button>
        </div>
      )}

      {showSellModal && <SellPropertyModal onClose={() => setShowSellModal(false)} onSubmit={handleSellCreated} />}
    </div>
  );
}
