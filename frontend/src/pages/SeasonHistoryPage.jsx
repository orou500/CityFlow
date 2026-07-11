import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';

function StatCard({ label, value }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700">
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">{value}</div>
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="text-lg" title="1st Place">🥇</span>;
  if (rank === 2) return <span className="text-lg" title="2nd Place">🥈</span>;
  if (rank === 3) return <span className="text-lg" title="3rd Place">🥉</span>;
  return <span className="text-sm font-medium text-gray-500 dark:text-gray-400">#{rank}</span>;
}

export default function SeasonHistoryPage() {
  const { t } = useTranslation();
  const { fetchSeasonHistory } = useGameStore();
  const [data, setData] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cityPages, setCityPages] = useState({});
  const CITIES_PER_PAGE = 10;

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const result = await fetchSeasonHistory();
      setData(result);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  function formatMoney(n) {
    return `$${(n || 0).toLocaleString()}`;
  }

  function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('seasons.title')}</h1>

      {data?.activeSeason && (
        <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">
            {t('seasons.activeSeason')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label={t('seasons.seasonNumber', { number: data.activeSeason.number })} value={data.activeSeason.name || `#${data.activeSeason.number}`} />
            <StatCard label={t('seasons.started')} value={formatDate(data.activeSeason.startDate)} />
            <StatCard label="Status" value={data.activeSeason.status} />
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('seasons.completedSeasons')}</h2>

      {!data?.completedSeasons?.length ? (
        <p className="text-gray-500 dark:text-gray-400">{t('seasons.noSeasons')}</p>
      ) : (
        <div className="space-y-4">
          {data.completedSeasons.map((season) => (
            <div
              key={season._id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              <div
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                onClick={() => setSelectedSeason(selectedSeason === season._id ? null : season._id)}
              >
                <div className="flex items-center gap-4">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    {t('seasons.seasonNumber', { number: season.number })}
                  </h3>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(season.startDate)} — {formatDate(season.endDate)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {season.archive?.winner && (
                    <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                      🏆 {season.archive.winner.displayName || season.archive.winner.username}
                    </span>
                  )}
                  <span>{season.archive?.totalPlayers || 0} {t('seasons.players')}</span>
                  <span>{season.archive?.economicStatistics?.tickCount || 0} {t('seasons.months')}</span>
                </div>
              </div>

              {selectedSeason === season._id && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-6">
                  {season.archive?.winner && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-center gap-4">
                      <span className="text-3xl">🏆</span>
                      <div>
                        <div className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                          {t('seasons.champion')}
                        </div>
                        <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                          {season.archive.winner.displayName || season.archive.winner.username}
                        </div>
                        {season.archive.winner.netWorth != null && (
                          <div className="text-sm text-yellow-600 dark:text-yellow-400">
                            {t('seasons.netWorth')}: {formatMoney(season.archive.winner.netWorth)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {season.archive?.playerRankings?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t('seasons.rankings')}</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                              <th className="text-left px-3 py-2">{t('seasons.rank')}</th>
                              <th className="text-left px-3 py-2">{t('seasons.username')}</th>
                              <th className="text-left px-3 py-2">{t('seasons.netWorth')}</th>
                              <th className="text-left px-3 py-2">{t('seasons.balance')}</th>
                              <th className="text-left px-3 py-2">{t('seasons.portfolioValue')}</th>
                              <th className="text-left px-3 py-2">{t('seasons.properties')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {season.archive.playerRankings.slice(0, 20).map((player) => (
                              <tr
                                key={player._id || player.rank}
                                className={`border-b border-gray-100 dark:border-gray-800 ${
                                  player.rank <= 3 ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''
                                }`}
                              >
                                <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                                  <RankBadge rank={player.rank} />
                                </td>
                                <td className="px-3 py-2">
                                  <Link
                                    to={`/profile/${player.username}`}
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {player.displayName || player.username}
                                  </Link>
                                </td>
                                <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{formatMoney(player.netWorth)}</td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatMoney(player.balance)}</td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatMoney(player.portfolioValue)}</td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{player.propertiesOwned || 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {season.archive?.cityStatistics?.length > 0 && (() => {
                    const page = cityPages[season._id] || 0;
                    const totalCities = season.archive.cityStatistics.length;
                    const totalPages = Math.ceil(totalCities / CITIES_PER_PAGE);
                    const paged = season.archive.cityStatistics.slice(page * CITIES_PER_PAGE, (page + 1) * CITIES_PER_PAGE);
                    return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('seasons.cityStats')}</h4>
                        {totalPages > 1 && (
                          <div className="flex items-center gap-2 text-sm">
                            <button
                              onClick={() => setCityPages({ ...cityPages, [season._id]: Math.max(0, page - 1) })}
                              disabled={page === 0}
                              className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40"
                            >
                              ←
                            </button>
                            <span className="text-gray-500 dark:text-gray-400 text-xs">{page + 1}/{totalPages}</span>
                            <button
                              onClick={() => setCityPages({ ...cityPages, [season._id]: Math.min(totalPages - 1, page + 1) })}
                              disabled={page >= totalPages - 1}
                              className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40"
                            >
                              →
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                              <th className="text-left px-3 py-2">{t('seasons.cityName')}</th>
                              <th className="text-left px-3 py-2">{t('seasons.avgPrice')}</th>
                              <th className="text-left px-3 py-2">{t('seasons.demand')}</th>
                              <th className="text-left px-3 py-2">{t('seasons.supply')}</th>
                              <th className="text-left px-3 py-2">{t('seasons.population')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paged.map((city) => (
                              <tr key={city._id || city.name} className="border-b border-gray-100 dark:border-gray-800">
                                <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{city.name}</td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatMoney(city.finalAvgPrice)}</td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{city.finalDemandIndex?.toFixed(2)}</td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{city.finalSupplyIndex?.toFixed(2)}</td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{(city.population || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label={t('seasons.totalCash')} value={formatMoney(season.archive?.economicStatistics?.totalCashInCirculation)} />
                    <StatCard label={t('seasons.totalProperties')} value={season.archive?.economicStatistics?.totalProperties || 0} />
                    <StatCard label={t('seasons.activeLoans')} value={season.archive?.economicStatistics?.totalActiveLoans || 0} />
                    <StatCard label={t('seasons.totalVolume')} value={formatMoney(season.archive?.marketStatistics?.totalVolume)} />
                    <StatCard label={t('seasons.avgPropertyPrice')} value={formatMoney(season.archive?.marketStatistics?.avgPropertyPrice)} />
                    <StatCard label={t('seasons.transactions')} value={season.archive?.totalTransactions || 0} />
                  </div>

                  {season.archive?.summary && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">{season.archive.summary}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
