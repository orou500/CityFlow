import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import { formatMoney } from '../utils/format';

function StatCard({ label, value }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700">
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm rounded-t-lg font-medium transition-colors ${
        active
          ? 'bg-gray-50 dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
          : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function Table({ headers, rows, renderRow, sortKey, sortDir, onSort }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`px-3 py-2 font-medium ${onSort ? 'cursor-pointer select-none hover:text-blue-500 dark:hover:text-blue-400' : ''}`}
                onClick={onSort ? () => onSort(h.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {h.label || h}
                  {sortKey === h.key && (
                    <span className="text-blue-500 dark:text-blue-400">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                {t('admin.noData')}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row._id || i}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
              >
                {renderRow(row)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminPage() {
  const { t } = useTranslation();
  const {
    adminOverview,
    adminUsers,
    adminProperties,
    adminEvents,
    fetchAdminOverview,
    fetchAdminTicks,
    runTicks,
    fetchAdminUsers,
    setUserBalance,
    toggleUserBan,
    fetchAdminProperties,
    createProperty,
    updateProperty,
    deleteProperty,
    fetchAdminEvents,
    createEvent,
    toggleEvent,
    updateCity,
    cities,
    fetchCities,
    fetchAdminSeasons,
    fetchAdminCurrentSeason,
    fetchAdminSeasonPreview,
    endCurrentSeason,
    createSeason,
    fetchAdminMaintenance,
    enableMaintenance,
    disableMaintenance,
    fetchMaintenance,
    fetchAdminBackups,
    fetchBackupLogs,
    createBackup,
    restoreBackup,
    deleteBackup,
    uploadBackupFile,
  } = useGameStore();

  const [tab, setTab] = useState('overview');
  const [tickCount, setTickCount] = useState(1);
  const [tickResult, setTickResult] = useState(null);
  const [tickInfo, setTickInfo] = useState(null);
  const [tickLoading, setTickLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newPropCity, setNewPropCity] = useState('');
  const [newPropType, setNewPropType] = useState('apartment');
  const [newPropName, setNewPropName] = useState('');
  const [newPropPrice, setNewPropPrice] = useState('');
  const [newPropOwner, setNewPropOwner] = useState('');

  const [newEventName, setNewEventName] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventCategory, setNewEventCategory] = useState('boom');
  const [newEventScope, setNewEventScope] = useState('local');
  const [newEventDuration, setNewEventDuration] = useState(3);
  const [newEventCities, setNewEventCities] = useState('');
  const [eventError, setEventError] = useState(null);

  const [editPropId, setEditPropId] = useState(null);
  const [editPropData, setEditPropData] = useState({});
  const [propPage, setPropPage] = useState(1);
  const PROPS_PER_PAGE = 10;

  const [editCityId, setEditCityId] = useState(null);
  const [editCityData, setEditCityData] = useState({});

  const [editUserId, setEditUserId] = useState(null);
  const [editUserBalance, setEditUserBalance] = useState('');
  const [propSearch, setPropSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userSortKey, setUserSortKey] = useState(null);
  const [userSortDir, setUserSortDir] = useState('asc');
  const [userPage, setUserPage] = useState(1);
  const USERS_PER_PAGE = 20;

  const [maintenanceInfo, setMaintenanceInfo] = useState(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [maintenanceConfirming, setMaintenanceConfirming] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  const [backups, setBackups] = useState([]);
  const [backupStats, setBackupStats] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupResult, setBackupResult] = useState(null);
  const [backupConfirmId, setBackupConfirmId] = useState(null);
  const [restoreConfirmId, setRestoreConfirmId] = useState(null);
  const [restoreText, setRestoreText] = useState('');
  const [backupFile, setBackupFile] = useState(null);
  const [backupLogs, setBackupLogs] = useState(null);
  const [backupLogsLoading, setBackupLogsLoading] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [eventPage, setEventPage] = useState(1);
  const EVENTS_PER_PAGE = 20;

  const [seasons, setSeasons] = useState([]);
  const [currentSeason, setCurrentSeason] = useState(null);
  const [seasonPreview, setSeasonPreview] = useState(null);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonConfirming, setSeasonConfirming] = useState(false);
  const [seasonResult, setSeasonResult] = useState(null);

  function formatDate(date) {
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setPropPage(1);
    setUserPage(1);
    setEventPage(1);
    try {
      await Promise.all([
        fetchAdminOverview(),
        fetchAdminUsers(),
        fetchAdminProperties(),
        fetchAdminEvents(),
        fetchCities(),
      ]);
      const info = await fetchAdminTicks();
      setTickInfo(info);
      loadSeasonData();
      loadBackupData();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function loadSeasonData() {
    try {
      const [seasonsData, current, preview, maintInfo] = await Promise.all([
        fetchAdminSeasons(),
        fetchAdminCurrentSeason(),
        fetchAdminSeasonPreview(),
        fetchAdminMaintenance(),
      ]);
      setSeasons(seasonsData);
      setCurrentSeason(current);
      setSeasonPreview(preview);
      setMaintenanceInfo(maintInfo);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadBackupData() {
    try {
      const data = await fetchAdminBackups();
      setBackups(data.backups || []);
      setBackupStats(data.stats || null);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCreateBackup() {
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const res = await createBackup();
      setBackupResult(res);
      await loadBackupData();
    } catch (e) {
      setBackupResult({ error: e.message });
    }
    setBackupLoading(false);
  }

  async function handleDeleteBackup(id) {
    setBackupLoading(true);
    try {
      await deleteBackup(id);
      setBackupConfirmId(null);
      await loadBackupData();
    } catch (e) {
      setBackupResult({ error: e.message });
    }
    setBackupLoading(false);
  }

  async function handleRestoreBackup() {
    if (restoreText !== 'RESTORE') return;
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const res = await restoreBackup(restoreConfirmId);
      setBackupResult(res);
      setRestoreConfirmId(null);
      setRestoreText('');
      localStorage.removeItem('token');
      localStorage.removeItem('cityflow-auth');
      window.location.href = '/login';
    } catch (e) {
      setBackupResult({ error: e.message });
    }
    setBackupLoading(false);
  }

  async function handleUploadBackup() {
    if (!backupFile) return;
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const res = await uploadBackupFile(backupFile);
      setBackupResult(res);
      setBackupFile(null);
      await loadBackupData();
    } catch (e) {
      setBackupResult({ error: e.message });
    }
    setBackupLoading(false);
  }

  function handleDownloadBackup(id) {
    const token = localStorage.getItem('token');
    fetch(`/api/admin/backups/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => setBackupResult({ error: e.message }));
  }

  async function handleViewBackupLogs(id) {
    setBackupLogsLoading(true);
    try {
      const data = await fetchBackupLogs(id);
      setBackupLogs(data);
    } catch (e) {
      setBackupResult({ error: e.message });
    }
    setBackupLogsLoading(false);
  }

  async function handleRunTicks() {
    setTickLoading(true);
    setTickResult(null);
    try {
      const res = await runTicks(tickCount);
      setTickResult(res);
      const info = await fetchAdminTicks();
      setTickInfo(info);
    } catch (e) {
      console.error(e);
      setTickResult({ error: e.message });
    }
    setTickLoading(false);
  }

  async function handleEndSeason() {
    setSeasonLoading(true);
    setSeasonResult(null);
    try {
      const res = await endCurrentSeason();
      setSeasonResult(res);
      setSeasonConfirming(false);
      await loadSeasonData();
      const info = await fetchAdminTicks();
      setTickInfo(info);
    } catch (e) {
      console.error(e);
    }
    setSeasonLoading(false);
  }

  async function handleCreateSeason() {
    setSeasonLoading(true);
    setSeasonResult(null);
    try {
      const res = await createSeason();
      setSeasonResult(res);
      await loadSeasonData();
    } catch (e) {
      console.error(e);
    }
    setSeasonLoading(false);
  }

  async function handleEnableMaintenance() {
    setMaintenanceLoading(true);
    try {
      await enableMaintenance(maintenanceMessage);
      const info = await fetchAdminMaintenance();
      setMaintenanceInfo(info);
      fetchMaintenance();
      setMaintenanceConfirming(false);
      setMaintenanceMessage('');
    } catch (e) {
      console.error(e);
    }
    setMaintenanceLoading(false);
  }

  async function handleDisableMaintenance() {
    setMaintenanceLoading(true);
    try {
      await disableMaintenance();
      const info = await fetchAdminMaintenance();
      setMaintenanceInfo(info);
      fetchMaintenance();
    } catch (e) {
      console.error(e);
    }
    setMaintenanceLoading(false);
  }

  async function handleSetBalance(userId) {
    try {
      await setUserBalance(userId, parseFloat(editUserBalance));
      setEditUserId(null);
      await fetchAdminUsers();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleToggleBan(userId) {
    try {
      await toggleUserBan(userId);
      await fetchAdminUsers();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCreateProperty() {
    try {
      await createProperty({
        cityId: newPropCity,
        type: newPropType,
        name: newPropName,
        basePrice: parseFloat(newPropPrice),
        ownerId: newPropOwner || undefined,
      });
      setNewPropName('');
      setNewPropPrice('');
      setNewPropOwner('');
      await fetchAdminProperties();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleUpdateProperty(id) {
    try {
      await updateProperty(id, editPropData);
      setEditPropId(null);
      setEditPropData({});
      await fetchAdminProperties();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDeleteProperty(id) {
    if (!window.confirm(t('admin.confirmDelete'))) return;
    try {
      await deleteProperty(id);
      await fetchAdminProperties();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleUpdateCity(id) {
    try {
      await updateCity(id, editCityData);
      setEditCityId(null);
      setEditCityData({});
      await fetchCities();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCreateEvent() {
    setEventError(null);
    try {
      const affectedCities = newEventCities
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const impactMap = {
        boom: { demandDelta: 0.15, priceMultiplier: 1.1 },
        recession: { demandDelta: -0.15, priceMultiplier: 0.9 },
        disaster: { demandDelta: -0.2, priceMultiplier: 0.85 },
        policy: { demandDelta: 0.05, priceMultiplier: 1.0 },
      };
      const name = newEventName || newEventCategory.charAt(0).toUpperCase() + newEventCategory.slice(1);
      const desc = newEventDesc || `A ${newEventCategory} event affecting the market.`;
      await createEvent({
        name,
        description: desc,
        type: newEventScope,
        impact: impactMap[newEventCategory] || {},
        duration: parseInt(newEventDuration),
        affectedCities,
      });
      setNewEventName('');
      setNewEventDesc('');
      setNewEventCities('');
      setNewEventCategory('boom');
      setNewEventScope('local');
      await fetchAdminEvents();
    } catch (e) {
      setEventError(e.message);
      console.error(e);
    }
  }

  async function handleToggleEvent(event) {
    try {
      await toggleEvent(event._id, !event.active);
      await fetchAdminEvents();
    } catch (e) {
      console.error(e);
    }
  }

  const cityOptions = cities || [];

  if (loading && !adminOverview) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        {t('common.loading')}
      </div>
    );
  }

  const overview = adminOverview;

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('admin.title')}</h1>

      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          {t('admin.overview')}
        </TabButton>
        <TabButton active={tab === 'ticks'} onClick={() => setTab('ticks')}>
          {t('admin.periodsTab')}
        </TabButton>
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
          {t('admin.users')}
        </TabButton>
        <TabButton active={tab === 'properties'} onClick={() => setTab('properties')}>
          {t('admin.properties')}
        </TabButton>
        <TabButton active={tab === 'cities'} onClick={() => setTab('cities')}>
          {t('admin.cities')}
        </TabButton>
        <TabButton active={tab === 'events'} onClick={() => setTab('events')}>
          {t('admin.events')}
        </TabButton>
        <TabButton active={tab === 'seasons'} onClick={() => setTab('seasons')}>
          {t('admin.seasons')}
        </TabButton>
        <TabButton active={tab === 'maintenance'} onClick={() => setTab('maintenance')}>
          {t('admin.maintenance')}
        </TabButton>
        <TabButton active={tab === 'database'} onClick={() => setTab('database')}>
          {t('admin.database')}
        </TabButton>
      </div>

      {tab === 'overview' && overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label={t('admin.totalUsers')} value={overview.totalUsers?.toLocaleString() || 0} />
          <StatCard label={t('admin.totalCities')} value={overview.totalCities || 0} />
          <StatCard label={t('admin.totalProperties')} value={overview.totalProperties || 0} />
          <StatCard label={t('admin.transactions')} value={overview.totalTransactions?.toLocaleString() || 0} />
          <StatCard label={t('admin.activeEvents')} value={overview.activeEvents || 0} />
          <StatCard label={t('admin.activeLoans')} value={overview.activeLoans || 0} />
          <StatCard label={t('admin.moneyInCirculation')} value={formatMoney(overview.totalMoneyInCirculation || 0)} />
          <StatCard label={t('admin.periodNumber')} value={overview.tickNumber || 0} />
        </div>
      )}

      {tab === 'ticks' && (
        <div className="space-y-6">
          {tickInfo && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label={t('admin.currentPeriod')} value={tickInfo.tickNumber || 0} />
              <StatCard label={t('admin.interval')} value={`${tickInfo.tickIntervalMinutes} min`} />
              <StatCard
                label={t('admin.lastPeriod')}
                value={tickInfo.lastTickAt ? formatDate(tickInfo.lastTickAt) : t('admin.never')}
              />
              <StatCard
                label={t('admin.nextAutoPeriod')}
                value={tickInfo.nextTickAt ? formatDate(tickInfo.nextTickAt) : t('admin.na')}
              />
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              {t('admin.manualPeriodExecution')}
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <label className="text-sm text-gray-500 dark:text-gray-400">{t('admin.periodsToRun')}</label>
              <input
                type="number"
                min={1}
                max={50}
                value={tickCount}
                onChange={(e) => setTickCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                className="w-20 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
              />
              <button
                onClick={handleRunTicks}
                disabled={tickLoading}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 dark:disabled:bg-gray-600 text-gray-900 dark:text-white text-sm rounded transition-colors"
              >
                {tickLoading ? t('admin.running') : t('admin.runPeriods')}
              </button>
            </div>
            {tickResult && (
              <div className="bg-white dark:bg-gray-900 rounded p-3 text-xs text-gray-600 dark:text-gray-300 max-h-48 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-mono">{JSON.stringify(tickResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <>
          <input
            value={userSearch}
            onChange={(e) => {
              setUserSearch(e.target.value);
              setUserPage(1);
            }}
            placeholder={t('searchPlayers')}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
          />

          {(() => {
            const searched = userSearch
              ? adminUsers.filter((u) =>
                  [u.username, u.email, u.role].some((v) => v?.toLowerCase().includes(userSearch.toLowerCase())),
                )
              : adminUsers;

            const sorted = [...searched];
            if (userSortKey) {
              sorted.sort((a, b) => {
                let aVal, bVal;
                switch (userSortKey) {
                  case 'username':
                    aVal = a.username || '';
                    bVal = b.username || '';
                    return userSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                  case 'email':
                    aVal = a.email || '';
                    bVal = b.email || '';
                    return userSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                  case 'role':
                    aVal = a.role || '';
                    bVal = b.role || '';
                    return userSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                  case 'balance':
                    aVal = a.balance || 0;
                    bVal = b.balance || 0;
                    return userSortDir === 'asc' ? aVal - bVal : bVal - aVal;
                  case 'properties':
                    aVal = a.propertyCount || 0;
                    bVal = b.propertyCount || 0;
                    return userSortDir === 'asc' ? aVal - bVal : bVal - aVal;
                  case 'banned':
                    aVal = a.banned ? 1 : 0;
                    bVal = b.banned ? 1 : 0;
                    return userSortDir === 'asc' ? aVal - bVal : bVal - aVal;
                  default:
                    return 0;
                }
              });
            }

            const filtered = sorted;
            return (
              <>
                <Table
                  headers={[
                    { key: 'username', label: t('admin.username') },
                    { key: 'email', label: t('admin.email') },
                    { key: 'role', label: t('admin.role') },
                    { key: 'balance', label: t('admin.balance') },
                    { key: 'properties', label: t('admin.propertiesShort') },
                    { key: 'banned', label: t('admin.banned') },
                    t('admin.actions'),
                  ]}
                  rows={filtered.slice(0, userPage * USERS_PER_PAGE)}
                  sortKey={userSortKey}
                  sortDir={userSortDir}
                  onSort={(key) => {
                    if (!key) return;
                    setUserSortKey((prev) => (prev === key ? null : key));
                    setUserSortDir((prev) => (userSortKey === key && prev === 'asc' ? 'desc' : 'asc'));
                  }}
                  renderRow={(u) => (
                    <>
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{u.username}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{u.email}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-purple-900 text-purple-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-blue-600 dark:text-blue-400">
                        {editUserId === u._id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editUserBalance}
                              onChange={(e) => setEditUserBalance(e.target.value)}
                              className="w-24 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 text-gray-900 dark:text-white text-xs"
                            />
                            <button
                              onClick={() => handleSetBalance(u._id)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                            >
                              {t('common.save')}
                            </button>
                            <button
                              onClick={() => setEditUserId(null)}
                              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <span>{formatMoney(u.balance || 0)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{u.propertyCount || 0}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${u.banned ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}
                        >
                          {u.banned ? t('admin.yes') : t('admin.no')}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditUserId(u._id);
                              setEditUserBalance(String(u.balance));
                            }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                          >
                            {t('admin.editBalance')}
                          </button>
                          <button
                            onClick={() => handleToggleBan(u._id)}
                            className={`text-xs ${u.banned ? 'text-green-400 hover:text-green-300' : 'text-red-600 dark:text-red-400 hover:text-red-300'}`}
                          >
                            {u.banned ? t('admin.unban') : t('admin.ban')}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                />
                {filtered.length > USERS_PER_PAGE && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('dashboard.showing', {
                        shown: Math.min(userPage * USERS_PER_PAGE, filtered.length),
                        total: filtered.length,
                      })}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                        disabled={userPage === 1}
                        className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('marketplace.previous')}
                      </button>
                      <button
                        onClick={() => setUserPage((p) => p + 1)}
                        disabled={userPage * USERS_PER_PAGE >= filtered.length}
                        className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('marketplace.next')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {tab === 'properties' && (
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('admin.createProperty')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <select
                value={newPropCity}
                onChange={(e) => setNewPropCity(e.target.value)}
                className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
              >
                <option value="">{t('admin.selectCity')}</option>
                {cityOptions.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={newPropType}
                onChange={(e) => setNewPropType(e.target.value)}
                className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
              >
                <option value="apartment">{t('property.apartment')}</option>
                <option value="house">{t('property.house')}</option>
                <option value="commercial">{t('property.commercial')}</option>
                <option value="land">{t('property.land')}</option>
              </select>
              <input
                value={newPropName}
                onChange={(e) => setNewPropName(e.target.value)}
                placeholder={t('admin.namePlaceholder')}
                className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
              />
              <input
                value={newPropPrice}
                onChange={(e) => setNewPropPrice(e.target.value)}
                placeholder={t('admin.basePricePlaceholder')}
                type="number"
                className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
              />
              <input
                value={newPropOwner}
                onChange={(e) => setNewPropOwner(e.target.value)}
                placeholder={t('admin.ownerIdPlaceholder')}
                className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <button
              onClick={handleCreateProperty}
              className="mt-3 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white text-sm rounded transition-colors"
            >
              {t('admin.create')}
            </button>
          </div>

          <input
            value={propSearch}
            onChange={(e) => {
              setPropSearch(e.target.value);
              setPropPage(1);
            }}
            placeholder={t('marketplace.searchPlaceholder')}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
          />

          {(() => {
            const filtered = propSearch
              ? adminProperties.filter((p) =>
                  [p.name, p.cityId?.name, p.type, p.ownerId?.username].some((v) =>
                    v?.toLowerCase().includes(propSearch.toLowerCase()),
                  ),
                )
              : adminProperties;
            return (
              <>
                <Table
                  headers={[
                    t('admin.name'),
                    t('admin.type'),
                    t('admin.city'),
                    t('admin.price'),
                    t('admin.rent'),
                    t('admin.owner'),
                    t('admin.actions'),
                  ]}
                  rows={filtered.slice(0, propPage * PROPS_PER_PAGE)}
                  renderRow={(p) => (
                    <>
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{p.name}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.type}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.cityId?.name || t('admin.na')}</td>
                      <td className="px-3 py-2 text-blue-600 dark:text-blue-400">{formatMoney(p.currentPrice || 0)}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{formatMoney(p.rent || 0)}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                        {p.ownerId?.username || t('admin.unowned')}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditPropId(p._id);
                              setEditPropData({ currentPrice: p.currentPrice, rent: p.rent, forSale: p.forSale });
                            }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                          >
                            {t('admin.edit')}
                          </button>
                          <button
                            onClick={() => handleDeleteProperty(p._id)}
                            className="text-xs text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300"
                          >
                            {t('admin.delete')}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                />
                {filtered.length > PROPS_PER_PAGE && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('dashboard.showing', {
                        shown: Math.min(propPage * PROPS_PER_PAGE, filtered.length),
                        total: filtered.length,
                      })}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPropPage((p) => Math.max(1, p - 1))}
                        disabled={propPage === 1}
                        className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('marketplace.previous')}
                      </button>
                      <button
                        onClick={() => setPropPage((p) => p + 1)}
                        disabled={propPage * PROPS_PER_PAGE >= filtered.length}
                        className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('marketplace.next')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {editPropId && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-md">
                <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{t('admin.editProperty')}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block">{t('admin.price')}</label>
                    <input
                      type="number"
                      value={editPropData.currentPrice || ''}
                      onChange={(e) => setEditPropData((p) => ({ ...p, currentPrice: parseFloat(e.target.value) }))}
                      className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block">{t('admin.rent')}</label>
                    <input
                      type="number"
                      value={editPropData.rent || ''}
                      onChange={(e) => setEditPropData((p) => ({ ...p, rent: parseFloat(e.target.value) }))}
                      className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block">{t('city.forSale')}</label>
                    <select
                      value={editPropData.forSale ? 'true' : 'false'}
                      onChange={(e) => setEditPropData((p) => ({ ...p, forSale: e.target.value === 'true' }))}
                      className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="true">{t('admin.yes')}</option>
                      <option value="false">{t('admin.no')}</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleUpdateProperty(editPropId)}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white text-sm rounded"
                  >
                    {t('common.save')}
                  </button>
                  <button
                    onClick={() => setEditPropId(null)}
                    className="px-4 py-1.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white text-sm rounded"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'cities' && (
        <Table
          headers={[
            t('admin.name'),
            t('map.population'),
            t('map.demand'),
            t('map.supply'),
            t('map.avgPrice'),
            t('map.growthRate'),
            t('admin.actions'),
          ]}
          rows={cityOptions}
          renderRow={(c) => (
            <>
              <td className="px-3 py-2 text-gray-900 dark:text-white">{c.name}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{c.population?.toLocaleString()}</td>
              <td className="px-3 py-2">
                {c.demandIndex != null ? (
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${c.demandIndex > 60 ? 'bg-green-900 text-green-300' : c.demandIndex > 30 ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'}`}
                  >
                    {c.demandIndex}
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">-</span>
                )}
              </td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{c.supplyIndex ?? '-'}</td>
              <td className="px-3 py-2 text-blue-600 dark:text-blue-400">
                {c.avgPrice ? formatMoney(c.avgPrice) : '-'}
              </td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                {c.growthRate != null ? `${c.growthRate}%` : '-'}
              </td>
              <td className="px-3 py-2">
                <button
                  onClick={() => {
                    setEditCityId(c._id);
                    setEditCityData({
                      demandIndex: c.demandIndex,
                      supplyIndex: c.supplyIndex,
                      population: c.population,
                      growthRate: c.growthRate,
                      avgPrice: c.avgPrice,
                    });
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                >
                  {t('admin.edit')}
                </button>
              </td>
            </>
          )}
        />
      )}

      {editCityId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-md">
            <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{t('admin.editCity')}</h3>
            <div className="space-y-3">
              {['demandIndex', 'supplyIndex', 'population', 'growthRate', 'avgPrice'].map((field) => (
                <div key={field}>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block capitalize">
                    {field.replace(/([A-Z])/g, ' $1')}
                  </label>
                  <input
                    type="number"
                    value={editCityData[field] ?? ''}
                    onChange={(e) => setEditCityData((d) => ({ ...d, [field]: parseFloat(e.target.value) }))}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => handleUpdateCity(editCityId)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white text-sm rounded"
              >
                Save
              </button>
              <button
                onClick={() => setEditCityId(null)}
                className="px-4 py-1.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white text-sm rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'events' && (
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('admin.createEvent')}</h3>
            {eventError && <p className="text-xs text-red-500 mb-2">{eventError}</p>}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('admin.eventName')}</label>
                <input
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  placeholder={t('admin.eventNamePlaceholder')}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('admin.description')}</label>
                <input
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  placeholder={t('admin.descPlaceholder')}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('admin.category')}</label>
                <select
                  value={newEventCategory}
                  onChange={(e) => setNewEventCategory(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
                >
                  <option value="boom">{t('admin.boom')}</option>
                  <option value="recession">{t('admin.recession')}</option>
                  <option value="disaster">{t('admin.disaster')}</option>
                  <option value="policy">{t('admin.policyChange')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('admin.scope')}</label>
                <select
                  value={newEventScope}
                  onChange={(e) => setNewEventScope(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
                >
                  <option value="local">{t('admin.local')}</option>
                  <option value="global">{t('admin.global')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {t('admin.duration')} ({t('general.periods')})
                </label>
                <input
                  value={newEventDuration}
                  onChange={(e) => setNewEventDuration(parseInt(e.target.value) || 3)}
                  type="number"
                  min={1}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {t('admin.affectedCityIds')}
                </label>
                <input
                  value={newEventCities}
                  onChange={(e) => setNewEventCities(e.target.value)}
                  placeholder={t('admin.cityIdsPlaceholder')}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
            <button
              onClick={handleCreateEvent}
              className="mt-3 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-gray-900 dark:text-white text-sm rounded transition-colors"
            >
              {t('admin.create')}
            </button>
          </div>

          <input
            value={eventSearch}
            onChange={(e) => {
              setEventSearch(e.target.value);
              setEventPage(1);
            }}
            placeholder={t('marketplace.searchPlaceholder')}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
          />

          {(() => {
            const filtered = eventSearch
              ? adminEvents.filter((e) =>
                  [e.name, e.type].some((v) => v?.toLowerCase().includes(eventSearch.toLowerCase())),
                )
              : adminEvents;
            return (
              <>
                <Table
                  headers={[
                    t('admin.name'),
                    t('admin.type'),
                    t('admin.duration'),
                    t('admin.remaining'),
                    t('admin.active'),
                    t('admin.actions'),
                  ]}
                  rows={filtered.slice(0, eventPage * EVENTS_PER_PAGE)}
                  renderRow={(e) => (
                    <>
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{e.name}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{e.type}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{e.duration ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{e.remainingTicks ?? '-'}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${e.active ? 'bg-green-900 text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
                        >
                          {e.active ? t('admin.active') : t('admin.inactive')}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleToggleEvent(e)}
                          className={`text-xs ${e.active ? 'text-red-600 dark:text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`}
                        >
                          {e.active ? t('admin.deactivate') : t('admin.activate')}
                        </button>
                      </td>
                    </>
                  )}
                />
                {filtered.length > EVENTS_PER_PAGE && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('dashboard.showing', {
                        shown: Math.min(eventPage * EVENTS_PER_PAGE, filtered.length),
                        total: filtered.length,
                      })}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEventPage((p) => Math.max(1, p - 1))}
                        disabled={eventPage === 1}
                        className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('marketplace.previous')}
                      </button>
                      <button
                        onClick={() => setEventPage((p) => p + 1)}
                        disabled={eventPage * EVENTS_PER_PAGE >= filtered.length}
                        className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('marketplace.next')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {tab === 'seasons' && (
        <div className="space-y-6">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('admin.currentSeason')}</h3>
            {currentSeason ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label={t('admin.seasonNumber', { number: currentSeason.number })}
                  value={currentSeason.name || `#${currentSeason.number}`}
                />
                <StatCard label={t('admin.seasonStarted')} value={formatDate(currentSeason.startDate)} />
                <StatCard label="Status" value={currentSeason.status} />
                <div className="flex items-end">
                  {!seasonConfirming ? (
                    <button
                      onClick={() => setSeasonConfirming(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
                    >
                      {t('admin.endSeason')}
                    </button>
                  ) : (
                    <div className="space-y-2 w-full">
                      <p className="text-xs text-red-500 dark:text-red-400">{t('admin.endSeasonWarning')}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleEndSeason}
                          disabled={seasonLoading}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
                        >
                          {seasonLoading ? t('admin.running') : t('common.confirm')}
                        </button>
                        <button
                          onClick={() => setSeasonConfirming(false)}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.noActiveSeason')}</p>
                <button
                  onClick={handleCreateSeason}
                  disabled={seasonLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
                >
                  {seasonLoading ? t('admin.running') : t('admin.createSeason')}
                </button>
              </div>
            )}

            {seasonPreview && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  {t('admin.seasonPreview')}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <StatCard label={t('admin.previewUsers')} value={seasonPreview.willReset?.users || 0} />
                  <StatCard label={t('admin.previewProperties')} value={seasonPreview.willReset?.properties || 0} />
                  <StatCard label={t('admin.previewTransactions')} value={seasonPreview.willReset?.transactions || 0} />
                  <StatCard label={t('admin.previewLoans')} value={seasonPreview.willReset?.activeLoans || 0} />
                  <StatCard
                    label={t('admin.previewConstruction')}
                    value={seasonPreview.willReset?.activeConstruction || 0}
                  />
                </div>
              </div>
            )}

            {seasonResult && (
              <div className="mt-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3 text-sm text-green-700 dark:text-green-300">
                {seasonResult.message}
              </div>
            )}
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('admin.previousSeasons')}</h3>
            {seasons.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.noCompletedSeasons')}</p>
            ) : (
              <Table
                headers={[
                  t('admin.seasonNumber', { number: '' }).trim(),
                  t('admin.seasonStarted'),
                  t('admin.seasonEnded'),
                  t('admin.totalPlayers'),
                  t('admin.totalMonths'),
                ]}
                rows={seasons}
                renderRow={(s) => (
                  <>
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">#{s.number}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatDate(s.startDate)}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                      {s.endDate ? formatDate(s.endDate) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{s.archive?.totalPlayers || 0}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                      {s.archive?.economicStatistics?.tickCount || 0}
                    </td>
                  </>
                )}
              />
            )}
          </div>
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="space-y-6">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('admin.maintenanceTitle')}</h3>

            <div className="flex items-center gap-3 mb-4">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  maintenanceInfo?.enabled
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                }`}
              >
                {maintenanceInfo?.enabled ? '🔴 Enabled' : '🟢 Disabled'}
              </span>
              {maintenanceInfo?.enabledAt && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Since: {new Date(maintenanceInfo.enabledAt).toLocaleString()}
                </span>
              )}
            </div>

            {maintenanceInfo?.enabled ? (
              <button
                onClick={handleDisableMaintenance}
                disabled={maintenanceLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                {maintenanceLoading ? t('admin.running') : t('admin.disableMaintenance')}
              </button>
            ) : (
              <>
                {!maintenanceConfirming ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        {t('admin.maintenanceMessage')}
                      </label>
                      <input
                        type="text"
                        value={maintenanceMessage}
                        onChange={(e) => setMaintenanceMessage(e.target.value)}
                        placeholder={t('admin.maintenanceMessagePlaceholder')}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>
                    <button
                      onClick={() => setMaintenanceConfirming(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
                    >
                      {t('admin.enableMaintenance')}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{t('admin.maintenanceConfirm')}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleEnableMaintenance}
                        disabled={maintenanceLoading}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
                      >
                        {maintenanceLoading ? t('admin.running') : t('common.confirm')}
                      </button>
                      <button
                        onClick={() => setMaintenanceConfirming(false)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'database' && (
        <div className="space-y-6">
          {backupResult && (
            <div
              className={`rounded p-3 text-sm ${
                backupResult.error
                  ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              }`}
            >
              {backupResult.error || backupResult.message}
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('admin.databaseOverview')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label={t('admin.totalBackups')} value={backupStats?.totalBackups || 0} />
              <StatCard label={t('admin.storageUsed')} value={backupStats?.totalSizeFormatted || '0 B'} />
              <StatCard
                label={t('admin.lastBackup')}
                value={
                  backupStats?.lastBackup
                    ? new Date(backupStats.lastBackup.createdAt).toLocaleString()
                    : t('admin.never')
                }
              />
            </div>
            <button
              onClick={handleCreateBackup}
              disabled={backupLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
            >
              {backupLoading ? t('admin.running') : t('admin.createBackup')}
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('admin.uploadBackup')}</h3>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".gz,.zip,.gzip,.archive,.bson"
                onChange={(e) => setBackupFile(e.target.files[0])}
                className="text-sm text-gray-600 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300 hover:file:bg-blue-100"
              />
              <button
                onClick={handleUploadBackup}
                disabled={!backupFile || backupLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                {backupLoading ? t('admin.running') : t('admin.upload')}
              </button>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('admin.backupHistory')}</h3>
            {backups.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.noBackups')}</p>
            ) : (
              <div className="space-y-3">
                {backups.map((b) => (
                  <div
                    key={b._id}
                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            b.status === 'completed'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : b.status === 'creating' || b.status === 'restoring'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          }`}
                        >
                          {b.status}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{b.type}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                        {new Date(b.createdAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {(b.size / 1024 / 1024).toFixed(1)} MB
                        {b.duration ? ` · ${b.duration}s` : ''}
                        {b.createdBy?.username ? ` · ${b.createdBy.username}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleViewBackupLogs(b._id)}
                        className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded transition-colors"
                      >
                        {t('admin.logs')}
                      </button>
                      {b.status === 'completed' && (
                        <>
                          <button
                            onClick={() => handleDownloadBackup(b._id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                          >
                            {t('admin.download')}
                          </button>
                          <button
                            onClick={() => {
                              setRestoreConfirmId(b._id);
                              setRestoreText('');
                            }}
                            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded transition-colors"
                          >
                            {t('admin.restore')}
                          </button>
                          <button
                            onClick={() => setBackupConfirmId(b._id)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition-colors"
                          >
                            {t('admin.delete')}
                          </button>
                        </>
                      )}
                    </div>

                    {backupConfirmId === b._id && (
                      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                            {t('admin.confirmDeleteBackup')}
                          </p>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleDeleteBackup(b._id)}
                              disabled={backupLoading}
                              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded"
                            >
                              {backupLoading ? t('admin.running') : t('common.confirm')}
                            </button>
                            <button
                              onClick={() => setBackupConfirmId(null)}
                              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {restoreConfirmId === b._id && (
                      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
                          <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
                            {t('admin.restoreWarning')}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                            {new Date(b.createdAt).toLocaleString()} — {(b.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                          <div className="mb-4">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Type <strong>RESTORE</strong> to confirm:
                            </label>
                            <input
                              type="text"
                              value={restoreText}
                              onChange={(e) => setRestoreText(e.target.value)}
                              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-white"
                              placeholder="RESTORE"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={handleRestoreBackup}
                              disabled={restoreText !== 'RESTORE' || backupLoading}
                              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded"
                            >
                              {backupLoading ? t('admin.running') : t('admin.restore')}
                            </button>
                            <button
                              onClick={() => {
                                setRestoreConfirmId(null);
                                setRestoreText('');
                              }}
                              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {backupLogs && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setBackupLogs(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('admin.backupLogs')}</h3>
              <button
                onClick={() => setBackupLogs(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
              >
                &times;
              </button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {backupLogs.filename} &middot; {backupLogs.type} &middot; {backupLogs.status} &middot;{' '}
              {new Date(backupLogs.createdAt).toLocaleString()}
            </div>
            {backupLogsLoading ? (
              <p className="text-sm text-gray-500">{t('common.loading')}</p>
            ) : (
              <div className="flex-1 overflow-y-auto bg-gray-900 rounded p-3 font-mono text-xs space-y-1">
                {backupLogs.logs?.length === 0 && <p className="text-gray-400">{t('admin.noLogs')}</p>}
                {backupLogs.logs?.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-gray-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span
                      className={`shrink-0 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-green-400'}`}
                    >
                      [{log.level}]
                    </span>
                    <span className="text-gray-300">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setBackupLogs(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
