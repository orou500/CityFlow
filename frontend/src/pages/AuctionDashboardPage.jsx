import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { getApiBaseUrl } from '../utils/capacitor';
import { useAuthStore } from '../store/useAuthStore';
import { formatMoney } from '../utils/format';
import { translateError } from '../i18n/errors';
import { useSocket, useSocketEvent } from '../hooks/useSocket';
import PropertyImage from '../components/PropertyImage';
import AuctionTimeLeft from '../components/AuctionTimeLeft';
import { getAuctionProperty, isAuctionPropertyKnown } from '../utils/auctionProperty';

const API = getApiBaseUrl();

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
  upcoming: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/70',
    text: 'text-yellow-800 dark:text-yellow-300',
    border: 'border-yellow-300 dark:border-yellow-600',
    icon: '⏳',
  },
  active: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/70',
    text: 'text-emerald-800 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-600',
    icon: '🔴',
  },
  ending: {
    bg: 'bg-purple-100 dark:bg-purple-900/70',
    text: 'text-purple-800 dark:text-purple-300',
    border: 'border-purple-300 dark:border-purple-600',
    icon: '⏰',
  },
  ended: {
    bg: 'bg-gray-200 dark:bg-card/70',
    text: 'text-muted dark:text-secondary',
    border: 'border-gray-300 dark:border-gray-600',
    icon: '🏁',
  },
  cancelled: {
    bg: 'bg-red-100 dark:bg-red-900/70',
    text: 'text-red-800 dark:text-red-300',
    border: 'border-red-300 dark:border-red-600',
    icon: '❌',
  },
};

const RARITY_STYLES = {
  uncommon: {
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-100 dark:bg-emerald-900/60 border-emerald-300 dark:border-emerald-600',
  },
  rare: {
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 dark:bg-blue-900/60 border-blue-300 dark:border-blue-600',
  },
  legendary: {
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/60 border-amber-300 dark:border-amber-600',
  },
};

const SELLER_ICONS = { bank: '🏦', player: '👤', event: '🎯' };

function FeaturedSection({ auctions, onSelect }) {
  const { t } = useTranslation();
  if (!auctions || auctions.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
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
  const property = getAuctionProperty(auction);
  const propertyKnown = isAuctionPropertyKnown(auction);
  const isEndingSoon = auction.isEndingSoon;
  const isHot = auction.totalBids >= 3;

  return (
    <button
      onClick={() => onClick(auction)}
      className="relative w-full text-start bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:via-gray-850 dark:to-gray-900 border-2 border-amber-300/50 dark:border-amber-700/50 hover:border-amber-500 rounded-xl p-4 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-200/30 dark:hover:shadow-amber-900/30"
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
      <PropertyImage property={property} alt={property?.name} className="w-full h-32 object-cover rounded-lg mb-3" />
      <div className="text-sm font-medium text-primary truncate pr-16">
        {propertyKnown ? property.name : t('auctions.propertyUnavailable')}
      </div>
      <div className="text-xs text-muted mt-1">
        {SELLER_ICONS[auction.sellerType]}{' '}
        {auction.sellerId?.username || t(`auctions.sellerTypes.${auction.sellerType}`)}
        {property?.propertyRating && (
          <span className={`ms-2 ${RARITY_STYLES[property.propertyRating]?.text || ''}`}>
            💎 {t(`auctions.ratings.${property.propertyRating}`)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-3">
        <div>
          <div className="text-xs text-muted">{t('auctions.currentBid')}</div>
          <div className="text-base font-bold text-primary">
            {formatMoney(auction.currentBid || auction.startingBid)}
          </div>
        </div>
        <div className="text-end">
          <div className="text-xs text-muted">{t('auctions.timeLeft')}</div>
          <AuctionTimeLeft
            startTick={auction.startTick}
            endTick={auction.endTick}
            currentTick={auction.currentTick}
            status={auction.status}
            remainingMonths={auction.remainingMonths}
            settledAt={auction.settledAt}
            className="text-sm text-primary"
          />
        </div>
      </div>
      <div className="text-xs text-muted mt-2">
        {t('auctions.bids')}: {auction.totalBids || 0}
        {auction.uniqueBidders ? ` · ${t('auctions.uniqueBidders')}: ${auction.uniqueBidders}` : ''}
      </div>
    </button>
  );
}

function MyStatsPanel({ stats }) {
  const { t } = useTranslation();
  if (!stats) return null;

  return (
    <div className="mb-6 bg-card border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
        <span>👤</span> {t('auctions.myAnalytics')}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('auctions.myParticipation')} value={stats.participation || 0} />
        <StatCard label={t('auctions.myBidsPlaced')} value={stats.bidsPlaced || 0} />
        <StatCard label={t('auctions.myWon')} value={stats.won || 0} />
        <StatCard label={t('auctions.myLost')} value={stats.lost || 0} />
        <StatCard label={t('auctions.myTotalBid')} value={formatMoney(stats.totalAmountBid || 0)} />
        <StatCard label={t('auctions.myTotalSpent')} value={formatMoney(stats.totalSpent || 0)} />
        <StatCard label={t('auctions.myAverageBid')} value={formatMoney(stats.averageBid || 0)} />
        <StatCard label={t('auctions.myWinRate')} value={`${stats.winRate || 0}%`} />
        <StatCard label={t('auctions.myActiveWinning')} value={stats.activeWinningBids || 0} />
        <StatCard label={t('auctions.myWatchlistCount')} value={stats.watchlistCount || 0} />
        <StatCard label={t('auctions.reservedFunds')} value={formatMoney(stats.reservedAuctionFunds || 0)} />
        <StatCard label={t('auctions.availableBalance')} value={formatMoney(stats.availableBalance || 0)} />
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-lg p-3 text-center border border-border/50">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-base font-bold text-primary">{value}</div>
    </div>
  );
}

function AuctionCard({ auction, onClick, onWatch, isWatched, user }) {
  const { t } = useTranslation();
  const statusStyle = STATUS_STYLES[auction.status] || STATUS_STYLES.active;
  const property = getAuctionProperty(auction);
  const propertyKnown = isAuctionPropertyKnown(auction);
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
      className={`w-full text-start bg-card/80 border-s-4 ${statusStyle.border} border-border hover:border-border hover:border-s-4 rounded-lg p-4 transition-all hover:bg-card`}
    >
      <PropertyImage property={property} alt={property?.name} className="w-full h-28 object-cover rounded-md mb-2" />
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-primary truncate">
              {propertyKnown ? property.name : t('auctions.propertyUnavailable')}
            </span>
            {auction.sellerType === 'bank' && <span title={t('auctions.bankAuction')}>🏦</span>}
            {isHot && <span title={t('auctions.hot')}>🔥</span>}
            {auction.auctionType === 'reserve' && <span title={t('auctions.reserve')}>💎</span>}
            {auction.reserveMet && <span title={t('auctions.reserveMet')}>✅</span>}
          </div>
          <div className="text-xs text-muted mt-0.5">
            {property?.type && t(`auctions.propertyTypes.${property.type}`)}
            {property?.propertyRating && (
              <span className={`ms-2 ${RARITY_STYLES[property.propertyRating]?.text || ''}`}>
                {t(`auctions.ratings.${property.propertyRating}`)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ms-2">
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
          <div className="text-xs text-muted">{t('auctions.currentBid')}</div>
          <div className="text-sm font-semibold text-primary">
            {formatMoney(auction.currentBid || auction.startingBid)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('auctions.bids')}</div>
          <div className="text-sm text-primary">{auction.totalBids || 0}</div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('auctions.timeLeft')}</div>
          <AuctionTimeLeft
            startTick={auction.startTick}
            endTick={auction.endTick}
            currentTick={auction.currentTick}
            status={auction.status}
            remainingMonths={auction.remainingMonths}
            settledAt={auction.settledAt}
            className="text-sm text-primary"
          />
        </div>
      </div>

      {property?.roi != null && (
        <div className="mt-2 text-xs text-green-400">
          {t('auctions.roi')}: {(property.roi * 100).toFixed(1)}%
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        {auction.auctionType === 'reserve' && !auction.reserveMet ? (
          <span className="text-xs text-amber-500 dark:text-amber-400 font-medium">
            💎 {t('auctions.reserveNotMet')} — {t('auctions.minimumWinningBid')}:{' '}
            {formatMoney(auction.minimumWinningBid ?? auction.reservePrice)}
          </span>
        ) : (
          <span className="text-xs text-muted">
            {t('auctions.minNextBid')}:{' '}
            {formatMoney(
              (auction.currentBid || 0) > 0
                ? (auction.currentBid || 0) + (auction.bidIncrement || 0)
                : auction.startingBid,
            )}
          </span>
        )}
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

  /**
   * Renders the actor for an activity entry. We NEVER fabricate an identity:
   * a real player always has a username; a genuine system event (extension,
   * reserve met, bank creation) has no actor and renders its message only;
   * anything else is shown as an explicit "unavailable" state — never "System".
   */
  const renderActor = (act) => {
    if (act.username) return <span className="text-secondary">{act.username}</span>;
    if (act.message) return null;
    return <span className="text-secondary">{t('auctions.actorUnavailable')}</span>;
  };

  return (
    <div className="bg-gradient-to-br from-gray-100/90 to-gray-200 dark:from-gray-800/90 dark:to-gray-900 rounded-xl p-4 border border-border/40">
      <h3 className="text-sm font-medium text-primary mb-3 flex items-center gap-2">📋 {t('auctions.activityFeed')}</h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {activities.map((act, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span>{icons[act.type] || '📌'}</span>
            <div className="flex-1 min-w-0">
              {renderActor(act)}
              {act.amount ? <span className="text-primary ms-1">{formatMoney(act.amount)}</span> : null}
              {act.message && <span className="text-muted ms-1 text-xs">— {act.message}</span>}
            </div>
            <span className="text-xs text-muted whitespace-nowrap">M{act.tick}</span>
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
    <div className="bg-gradient-to-br from-gray-100/90 to-gray-200 dark:from-gray-800/90 dark:to-gray-900 rounded-xl p-4 border border-border/40">
      <h3 className="text-sm font-medium text-primary mb-3 flex items-center gap-2">👑 {t('auctions.reputation')}</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted">{t('auctions.auctionsWon')}: </span>
          <span className="text-green-400 font-medium">{reputation.auctionsWon || 0}</span>
        </div>
        <div>
          <span className="text-muted">{t('auctions.auctionsSold')}: </span>
          <span className="text-blue-400 font-medium">{reputation.auctionsSold || 0}</span>
        </div>
        <div>
          <span className="text-muted">{t('auctions.totalVolume')}: </span>
          <span className="text-primary">{formatMoney(reputation.totalVolume || 0)}</span>
        </div>
        <div>
          <span className="text-muted">{t('auctions.winRate')}: </span>
          <span className="text-yellow-400">{(reputation.winRate || 0).toFixed(1)}%</span>
        </div>
        {reputation.highestWinningBid > 0 && (
          <div>
            <span className="text-muted">{t('auctions.highestBid')}: </span>
            <span className="text-purple-400">{formatMoney(reputation.highestWinningBid)}</span>
          </div>
        )}
        {reputation.totalProfit > 0 && (
          <div>
            <span className="text-muted">{t('auctions.totalProfit')}: </span>
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

  const property = getAuctionProperty(detail);
  const propertyKnown = isAuctionPropertyKnown(detail);
  const isOwner = user && detail.sellerId?._id === user._id;
  const isSettled = detail.settledAt != null;
  // Settlement has already committed the outcome; the backend's 'ending' phase
  // is only its finalization window, so a settled auction displays as ended.
  const displayStatus = detail.status === 'ending' && isSettled ? 'ended' : detail.status;
  const isWinning =
    user &&
    (detail.winnerId?._id === user._id ||
      (!detail.winnerId &&
        detail.currentBidderId?._id === user._id &&
        detail.status !== 'ended' &&
        detail.status !== 'cancelled' &&
        // A reserve auction is only "won" once the reserve is actually met —
        // the highest bid alone is not enough.
        (detail.auctionType !== 'reserve' || detail.reserveMet)));
  const availableBalance = Math.max(0, (user?.balance || 0) - (user?.reservedAuctionFunds || 0));
  const minNextBid =
    (detail.currentBid || 0) > 0 ? (detail.currentBid || 0) + (detail.bidIncrement || 0) : detail.startingBid;
  // Authoritative "smallest bid that wins if the auction ended now". The
  // backend computes this server-side (auctionMath) — the frontend never
  // invents it. Fall back to the local next-bid rule only for pre-deploy rows
  // that lack the field.
  const minToWin =
    detail.minimumWinningBid ??
    (detail.auctionType === 'reserve' && !detail.reserveMet
      ? Math.max(minNextBid, detail.reservePrice || 0)
      : minNextBid);
  const reserveGap = detail.auctionType === 'reserve' && !detail.reserveMet ? Math.max(0, minToWin - minNextBid) : 0;
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
            currentTick: data.currentTick,
            remainingMonths: data.remainingMonths,
            reserveMet: data.reserveMet ?? prev.reserveMet,
            minimumWinningBid: data.minimumWinningBid ?? prev.minimumWinningBid,
          }));
          activityRef.current = [
            {
              type: 'bid',
              username: data.currentBidderUsername,
              amount: data.currentBid,
              tick: data.currentTick,
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
          setDetail((prev) => ({
            ...prev,
            endTick: data.newEndTick,
            currentTick: data.currentTick,
            remainingMonths: data.remainingMonths,
          }));
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
          setDetail((prev) => ({
            ...prev,
            status: 'ended',
            winnerId: data.winnerId ? { _id: data.winnerId, username: data.winnerUsername || null } : null,
            winningBid: data.winningBid,
          }));
        }
      },
      [detail._id],
    ),
  );

  useSocketEvent(
    'tick:completed',
    useCallback(() => {
      refreshDetail();
    }, [refreshDetail]),
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
    if (!amount || amount < minToWin) {
      setError(
        reserveGap > 0
          ? t('errors.reserveMinimumBid', { amount: minToWin.toLocaleString() })
          : t('auctions.bidTooLow', { min: formatMoney(minToWin) }),
      );
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
      setError(translateError(err, t));
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
      setError(translateError(err, t));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      <PropertyImage property={property} alt={property?.name} className="w-full h-48 object-cover rounded-xl mb-3" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {propertyKnown && property?._id ? (
            <Link
              to={`/property/${property._id}`}
              className="text-lg font-bold text-primary hover:text-blue-400 transition-colors"
            >
              {property.name}
            </Link>
          ) : (
            <span className="text-lg font-bold text-muted">{t('auctions.propertyUnavailable')}</span>
          )}
          {auction.sellerType === 'bank' && <span>🏦</span>}
          {auction.auctionType === 'reserve' && <span>💎</span>}
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <span className="text-xs text-muted animate-pulse">↻</span>}
          {user && detail.status === 'active' && (
            <button
              onClick={() => onWatch(detail._id)}
              className={`text-sm px-2 py-1 rounded border transition-colors ${isWatched ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-900 border-border text-muted hover:border-gray-400 dark:hover:border-gray-500'}`}
            >
              {isWatched ? `👁️ ${t('auctions.watching')}` : `👁️‍🗨️ ${t('auctions.watch')}`}
            </button>
          )}
          <button onClick={onClose} className="text-muted hover:text-primary text-sm">
            {t('auctions.close')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-blue-100/40 to-gray-100 dark:from-blue-900/40 dark:to-gray-900 rounded-lg p-3 text-center border border-blue-200/30 dark:border-blue-900/30">
          <div className="text-xs text-muted">{t('auctions.currentBid')}</div>
          <div className="text-lg font-bold text-primary">{formatMoney(detail.currentBid || detail.startingBid)}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-100/40 to-gray-100 dark:from-blue-900/40 dark:to-gray-900 rounded-lg p-3 text-center border border-blue-200/30 dark:border-blue-900/30">
          <div className="text-xs text-muted">{t('auctions.totalBids')}</div>
          <div className="text-lg font-bold text-primary">{detail.totalBids || 0}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-100/40 to-gray-100 dark:from-blue-900/40 dark:to-gray-900 rounded-lg p-3 text-center border border-blue-200/30 dark:border-blue-900/30">
          <div className="text-xs text-muted">{t('auctions.timeLeft')}</div>
          <AuctionTimeLeft
            startTick={detail.startTick}
            endTick={detail.endTick}
            currentTick={detail.currentTick}
            status={detail.status}
            remainingMonths={detail.remainingMonths}
            settledAt={detail.settledAt}
            className="text-lg font-bold"
          />
        </div>
        <div className="bg-gradient-to-br from-blue-100/40 to-gray-100 dark:from-blue-900/40 dark:to-gray-900 rounded-lg p-3 text-center border border-blue-200/30 dark:border-blue-900/30">
          <div className="text-xs text-muted">{t('auctions.startingBid')}</div>
          <div className="text-lg font-bold text-secondary">{formatMoney(detail.startingBid)}</div>
        </div>
      </div>

      {displayStatus === 'ended' && !detail.winnerId && detail.auctionType === 'reserve' && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg p-3 text-sm text-orange-800 dark:text-orange-200">
          ⚠️ {t('auctions.endedReserveNotMet')}
        </div>
      )}
      {displayStatus === 'ended' && !detail.winnerId && detail.auctionType !== 'reserve' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
          ⚠️ {t('auctions.endedNoWinner')}
        </div>
      )}
      {displayStatus === 'cancelled' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-3 text-sm text-red-800 dark:text-red-200">
          ✖️ {t('auctions.cancelledNotice')}
        </div>
      )}

      {property && propertyKnown && (
        <div className="bg-gradient-to-br from-gray-100/90 to-gray-200 dark:from-gray-800/90 dark:to-gray-900 rounded-xl p-4 border border-border/40">
          <h3 className="text-sm font-medium text-primary mb-2">{t('auctions.propertyDetails')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-muted">{t('auctions.type')}: </span>
              <span className="text-primary">{t(`auctions.propertyTypes.${property.type}`)}</span>
            </div>
            <div>
              <span className="text-muted">{t('auctions.condition')}: </span>
              <span className="text-primary">{property.condition}%</span>
            </div>
            <div>
              <span className="text-muted">{t('auctions.marketValue')}: </span>
              <span className="text-primary">{formatMoney(property.currentPrice)}</span>
            </div>
            <div>
              <span className="text-muted">{t('auctions.rating')}: </span>
              <span className={RARITY_STYLES[property.propertyRating]?.text || 'text-primary'}>
                {t(`auctions.ratings.${property.propertyRating}`)}
              </span>
            </div>
            {property.intrinsicValue > 0 && (
              <div>
                <span className="text-muted">{t('auctions.intrinsicValue')}: </span>
                <span className="text-primary">{formatMoney(property.intrinsicValue)}</span>
              </div>
            )}
            {property.rent > 0 && (
              <div>
                <span className="text-muted">{t('auctions.rent')}: </span>
                <span className="text-green-400">{formatMoney(property.rent)}/month</span>
              </div>
            )}
            {property.qualityScore != null && (
              <div>
                <span className="text-muted">{t('auctions.quality')}: </span>
                <span className="text-primary">{property.qualityScore}/100</span>
              </div>
            )}
            {property.occupancy != null && (
              <div>
                <span className="text-muted">{t('auctions.occupancy')}: </span>
                <span className="text-primary">{property.occupancy}%</span>
              </div>
            )}
            {property.roi != null && (
              <div>
                <span className="text-muted">{t('auctions.roi')}: </span>
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

      <div className="bg-gradient-to-br from-gray-100/90 to-gray-200 dark:from-gray-800/90 dark:to-gray-900 rounded-xl p-4 border border-border/40">
        <h3 className="text-sm font-medium text-primary mb-2">{t('auctions.auctionInfo')}</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted">{t('auctions.type')}: </span>
            <span className="text-primary">{t(`auctions.auctionTypes.${detail.auctionType}`)}</span>
          </div>
          <div>
            <span className="text-muted">{t('auctions.source')}: </span>
            <span className="text-primary">
              {SELLER_ICONS[detail.sellerType]}{' '}
              {detail.sellerId?.username || t(`auctions.sellerTypes.${detail.sellerType}`)}
            </span>
          </div>
          {detail.auctionType === 'reserve' && (
            <div>
              <span className="text-muted">{t('auctions.reservePrice')}: </span>
              <span className={detail.reserveMet ? 'text-green-400' : 'text-orange-400'}>
                {formatMoney(detail.reservePrice)}
                {' · '}
                {detail.reserveMet ? `✅ ${t('auctions.reserveMet')}` : `⛔ ${t('auctions.reserveNotMet')}`}
              </span>
              {!detail.reserveMet && (
                <div className="mt-1 text-xs text-orange-400">
                  💎 {t('auctions.minimumWinningBid')}: {formatMoney(minToWin)}
                  {reserveGap > 0 && (
                    <div className="text-muted">
                      ▲ {t('auctions.gapToReserve', { amount: formatMoney(reserveGap) })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {detail.winnerId && (
            <div>
              <span className="text-muted">{t('auctions.winner')}: </span>
              <span className="text-green-400">
                {detail.winnerId.username || t('auctions.actorUnavailable')} ({formatMoney(detail.winningBid)})
              </span>
            </div>
          )}
          {detail.uniqueBidders > 0 && (
            <div>
              <span className="text-muted">{t('auctions.uniqueBidders')}: </span>
              <span className="text-primary">{detail.uniqueBidders}</span>
            </div>
          )}
          {detail.watcherCount > 0 && (
            <div>
              <span className="text-muted">{t('auctions.watchers')}: </span>
              <span className="text-primary">👁️ {detail.watcherCount}</span>
            </div>
          )}
        </div>
      </div>

      {detail.status === 'active' && !isOwner && user && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-primary mb-3">{t('auctions.placeBid')}</h3>
          {error && (
            <div className="bg-red-900/50 border border-red-800 text-red-300 px-3 py-2 rounded mb-3 text-sm">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder={minToWin.toLocaleString()}
                min={minToWin}
                className="w-full bg-gray-100 dark:bg-gray-900 border border-border text-primary rounded ps-7 pe-3 py-2 text-sm"
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
          <div className="text-xs mt-2">
            {detail.auctionType === 'reserve' && reserveGap > 0 ? (
              <>
                <span className="text-orange-400 font-medium">
                  {t('auctions.minimumWinningBid')}: {formatMoney(minToWin)}
                </span>{' '}
                <span className="text-muted">
                  — {t('auctions.needMoreToReserve', { amount: formatMoney(reserveGap) })}
                </span>
              </>
            ) : (
              <span className="text-muted">
                {t('auctions.minNextBid')}: {formatMoney(minToWin)}
              </span>
            )}
          </div>
          {user && (
            <div className="text-xs text-muted mt-1">
              {t('auctions.availableBalance')}: <span className="text-green-500">{formatMoney(availableBalance)}</span>
              {(user.reservedAuctionFunds || 0) > 0 && (
                <>
                  {' · '}
                  {t('auctions.reservedFunds')}:{' '}
                  <span className="text-amber-500">{formatMoney(user.reservedAuctionFunds)}</span>
                </>
              )}
            </div>
          )}
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
        <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
          <div className="text-sm text-muted">👤 {t('auctions.yourAuction')}</div>
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
        <div className="bg-gradient-to-br from-gray-100/90 to-gray-200 dark:from-gray-800/90 dark:to-gray-900 rounded-xl p-4 border border-border/40">
          <h3 className="text-sm font-medium text-primary mb-3">
            {t('auctions.bidHistory')} ({detail.bids.length})
          </h3>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {[...detail.bids].reverse().map((bid, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1">
                <span className="text-muted">
                  {bid.username || bid.bidderId?.username || t('auctions.unknownBidder')}
                  {user && bid.bidderId?._id === user._id && (
                    <span className="text-blue-400 ms-1">({t('auctions.you')})</span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-muted text-xs">M{bid.tick}</span>
                  <span className="text-primary font-medium">{formatMoney(bid.amount)}</span>
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
          minBid={minToWin}
          reserveNotMet={detail.auctionType === 'reserve' && reserveGap > 0}
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

function CompanyBidModal({ auctionId, minBid, reserveNotMet, onClose, onSubmit }) {
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
        setCompanies(Array.isArray(res) ? res : res?.companies || []);
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
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-primary mb-4">🏢 {t('auctions.companyBid')}</h3>
        {error && (
          <div className="bg-red-900/50 border border-red-800 text-red-300 px-3 py-2 rounded mb-3 text-sm">{error}</div>
        )}
        {loading ? (
          <div className="text-muted text-sm py-4">{t('auctions.loading')}</div>
        ) : companies.length === 0 ? (
          <div className="text-muted text-sm py-4">{t('auctions.noCompanies')}</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-secondary mb-1">{t('auctions.selectCompany')}</label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-full bg-gray-100 dark:bg-gray-900 border border-border text-primary rounded p-2 text-sm"
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
              <label className="block text-sm text-secondary mb-1">{t('auctions.bidAmount')}</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={minBid}
                placeholder={minBid.toLocaleString()}
                className="w-full bg-gray-100 dark:bg-gray-900 border border-border text-primary rounded p-2 text-sm"
              />
              <div className="text-xs text-muted mt-1">
                {reserveNotMet ? t('auctions.minimumWinningBid') : t('auctions.minNextBid')}: {formatMoney(minBid)}
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
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-secondary rounded transition-colors"
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
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-primary mb-4">🏷️ {t('auctions.sellProperty')}</h3>
        {error && (
          <div className="bg-red-900/50 border border-red-800 text-red-300 px-3 py-2 rounded mb-3 text-sm">{error}</div>
        )}
        {loading ? (
          <div className="text-muted text-sm py-4">{t('auctions.loading')}</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-secondary mb-1">{t('auctions.selectProperty')}</label>
              <select
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
                className="w-full bg-gray-100 dark:bg-gray-900 border border-border text-primary rounded p-2 text-sm"
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
              <label className="block text-sm text-secondary mb-1">{t('auctions.auctionType')}</label>
              <div className="flex gap-2">
                {['standard', 'reserve'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setAuctionType(type)}
                    className={`flex-1 py-2 rounded text-sm border transition-colors ${auctionType === type ? 'bg-blue-900 border-blue-700 text-blue-300' : 'bg-gray-100 dark:bg-gray-900 border-border text-muted hover:border-border'}`}
                  >
                    {t(`auctions.auctionTypes.${type}`)}
                  </button>
                ))}
              </div>
            </div>
            {auctionType === 'reserve' && (
              <div>
                <label className="block text-sm text-secondary mb-1">{t('auctions.reservePrice')}</label>
                <input
                  type="number"
                  value={reservePrice}
                  onChange={(e) => setReservePrice(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-900 border border-border text-primary rounded p-2 text-sm"
                  placeholder="0"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-secondary mb-1">{t('auctions.duration')}</label>
              <div className="grid grid-cols-2 gap-2">
                {['short', 'medium', 'long', 'extended'].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`py-2 rounded text-sm border transition-colors ${duration === d ? 'bg-blue-900 border-blue-700 text-blue-300' : 'bg-gray-100 dark:bg-gray-900 border-border text-muted hover:border-border'}`}
                  >
                    {t(`auctions.durations.${d}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">
                {t('auctions.startingBid')} ({t('auctions.optional')})
              </label>
              <input
                type="number"
                value={startingBid}
                onChange={(e) => setStartingBid(e.target.value)}
                className="w-full bg-gray-100 dark:bg-gray-900 border border-border text-primary rounded p-2 text-sm"
                placeholder={t('auctions.defaultAuto')}
              />
            </div>
            <div className="text-xs text-muted">💡 {t('auctions.listingFee', { percent: 5 })}</div>
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
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-secondary rounded transition-colors"
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
  const { id } = useParams();
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
  const [myStats, setMyStats] = useState(null);
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
                currentTick: data.currentTick,
                remainingMonths: data.remainingMonths,
                reserveMet: data.reserveMet ?? a.reserveMet,
                minimumWinningBid: data.minimumWinningBid ?? a.minimumWinningBid,
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
      if (user) {
        api('/auctions/my/analytics')
          .then((res) => setMyStats(res.stats))
          .catch(() => {});
      }
    }, [activeTab, loadAuctions, page, user]),
  );

  useEffect(() => {
    if (user) {
      api('/auctions/my/analytics')
        .then((res) => setMyStats(res.stats))
        .catch(() => {});
    } else {
      setMyStats(null);
    }
  }, [user]);

  useEffect(() => {
    if (!id) return;
    api(`/auctions/${id}`)
      .then((res) => {
        if (res.success) setSelectedAuction(res.auction);
      })
      .catch(() => {});
  }, [id]);

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
          <h1 className="text-3xl font-bold text-primary">🔨 {t('auctions.title')}</h1>
          <p className="text-muted mt-1">{t('auctions.subtitle')}</p>
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
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ms-2">
            {t('auctions.dismiss')}
          </button>
        </div>
      )}

      <FeaturedSection auctions={featured} onSelect={setSelectedAuction} />
      {user && <MyStatsPanel stats={myStats} />}

      <div className="flex flex-wrap gap-1 mb-4 bg-card rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`flex-shrink-0 py-2 px-3 rounded text-sm font-medium transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-muted hover:text-primary'}`}
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
              className={`px-3 py-1 rounded text-xs transition-colors whitespace-nowrap ${filterType === type ? 'bg-gray-200 dark:bg-gray-200 dark:bg-gray-700 text-primary' : 'bg-gray-100 dark:bg-card text-muted hover:text-primary'}`}
            >
              {t(`auctions.propertyTypes.${type}`)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted">{t('auctions.loading')}</div>
      ) : auctions.length === 0 ? (
        <div className="text-center py-12 text-muted">{t('auctions.noAuctions')}</div>
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
            className="px-3 py-1.5 bg-card border border-border text-secondary rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← {t('auctions.prev')}
          </button>
          <span className="text-sm text-muted">
            {t('auctions.page')} {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 bg-card border border-border text-secondary rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('auctions.next')} →
          </button>
        </div>
      )}

      {showSellModal && <SellPropertyModal onClose={() => setShowSellModal(false)} onSubmit={handleSellCreated} />}
    </div>
  );
}
