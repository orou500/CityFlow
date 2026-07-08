import { useEffect, useState } from 'react';
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

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm rounded-t-lg font-medium transition-colors ${
        active
          ? 'bg-gray-50 dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
          : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function Table({ headers, rows, renderRow }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
            {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">{t('admin.noData')}</td></tr>
          ) : (
            rows.map((row, i) => <tr key={row._id || i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-gray-800/50">{renderRow(row)}</tr>)
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminPage() {
  const { t } = useTranslation();
  const {
    adminOverview, adminUsers, adminProperties, adminEvents,
    fetchAdminOverview, fetchAdminTicks, runTicks,
    fetchAdminUsers, setUserBalance, toggleUserBan,
    fetchAdminProperties, createProperty, updateProperty, deleteProperty,
    fetchAdminEvents, createEvent, toggleEvent,
    updateCity, cities, fetchCities,
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
  const [userPage, setUserPage] = useState(1);
  const USERS_PER_PAGE = 20;
  const [eventSearch, setEventSearch] = useState('');
  const [eventPage, setEventPage] = useState(1);
  const EVENTS_PER_PAGE = 20;

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
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleRunTicks() {
    setTickLoading(true);
    setTickResult(null);
    try {
      const res = await runTicks(tickCount);
      setTickResult(res);
      await loadData();
    } catch (e) {
      console.error(e);
    }
    setTickLoading(false);
  }

  async function handleSetBalance(userId) {
    try {
      await setUserBalance(userId, parseFloat(editUserBalance));
      setEditUserId(null);
      await fetchAdminUsers();
    } catch (e) { console.error(e); }
  }

  async function handleToggleBan(userId) {
    try {
      await toggleUserBan(userId);
      await fetchAdminUsers();
    } catch (e) { console.error(e); }
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
      setNewPropName(''); setNewPropPrice(''); setNewPropOwner('');
      await fetchAdminProperties();
    } catch (e) { console.error(e); }
  }

  async function handleUpdateProperty(id) {
    try {
      await updateProperty(id, editPropData);
      setEditPropId(null);
      setEditPropData({});
      await fetchAdminProperties();
    } catch (e) { console.error(e); }
  }

  async function handleDeleteProperty(id) {
    if (!window.confirm(t('admin.confirmDelete'))) return;
    try {
      await deleteProperty(id);
      await fetchAdminProperties();
    } catch (e) { console.error(e); }
  }

  async function handleUpdateCity(id) {
    try {
      await updateCity(id, editCityData);
      setEditCityId(null);
      setEditCityData({});
      await fetchCities();
    } catch (e) { console.error(e); }
  }

  async function handleCreateEvent() {
    setEventError(null);
    try {
      const affectedCities = newEventCities.split(',').map(s => s.trim()).filter(Boolean);
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
      setNewEventName(''); setNewEventDesc(''); setNewEventCities(''); setNewEventCategory('boom'); setNewEventScope('local');
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
    } catch (e) { console.error(e); }
  }

  const cityOptions = cities || [];

  if (loading && !adminOverview) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
    );
  }

  const overview = adminOverview;

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('admin.title')}</h1>

      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>{t('admin.overview')}</TabButton>
        <TabButton active={tab === 'ticks'} onClick={() => setTab('ticks')}>{t('admin.periodsTab')}</TabButton>
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>{t('admin.users')}</TabButton>
        <TabButton active={tab === 'properties'} onClick={() => setTab('properties')}>{t('admin.properties')}</TabButton>
        <TabButton active={tab === 'cities'} onClick={() => setTab('cities')}>{t('admin.cities')}</TabButton>
        <TabButton active={tab === 'events'} onClick={() => setTab('events')}>{t('admin.events')}</TabButton>
      </div>

      {tab === 'overview' && overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label={t('admin.totalUsers')} value={overview.totalUsers?.toLocaleString() || 0} />
          <StatCard label={t('admin.totalCities')} value={overview.totalCities || 0} />
          <StatCard label={t('admin.totalProperties')} value={overview.totalProperties || 0} />
          <StatCard label={t('admin.transactions')} value={overview.totalTransactions?.toLocaleString() || 0} />
          <StatCard label={t('admin.activeEvents')} value={overview.activeEvents || 0} />
          <StatCard label={t('admin.activeLoans')} value={overview.activeLoans || 0} />
          <StatCard label={t('admin.moneyInCirculation')} value={`$${(overview.totalMoneyInCirculation || 0).toLocaleString()}`} />
          <StatCard label={t('admin.periodNumber')} value={overview.tickNumber || 0} />
        </div>
      )}

      {tab === 'ticks' && (
        <div className="space-y-6">
          {tickInfo && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label={t('admin.currentPeriod')} value={tickInfo.tickNumber || 0} />
              <StatCard label={t('admin.interval')} value={`${tickInfo.tickIntervalMinutes} min`} />
              <StatCard label={t('admin.lastPeriod')} value={tickInfo.lastTickAt ? formatDate(tickInfo.lastTickAt) : t('admin.never')} />
              <StatCard label={t('admin.nextAutoPeriod')} value={tickInfo.nextTickAt ? formatDate(tickInfo.nextTickAt) : t('admin.na')} />
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('admin.manualPeriodExecution')}</h3>
            <div className="flex items-center gap-3 mb-3">
              <label className="text-sm text-gray-500 dark:text-gray-400">{t('admin.periodsToRun')}</label>
              <input
                type="number"
                min={1}
                max={50}
                value={tickCount}
                onChange={e => setTickCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                className="w-20 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"
              />
              <button
                onClick={handleRunTicks}
                disabled={tickLoading}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-200 dark:disabled:bg-gray-600 text-gray-900 dark:text-white text-sm rounded transition-colors"
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
            onChange={e => { setUserSearch(e.target.value); setUserPage(1); }}
            placeholder={t('searchPlayers')}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500"
          />

          {(() => {
            const filtered = userSearch
              ? adminUsers.filter(u =>
                  [u.username, u.email, u.role]
                    .some(v => v?.toLowerCase().includes(userSearch.toLowerCase()))
                )
              : adminUsers;
            return <>
          <Table
            headers={[t('admin.username'), t('admin.email'), t('admin.role'), t('admin.balance'), t('admin.propertiesShort'), t('admin.banned'), t('admin.actions')]}
            rows={filtered.slice(0, userPage * USERS_PER_PAGE)}
            renderRow={(u) => (
              <>
                <td className="px-3 py-2 text-gray-900 dark:text-white">{u.username}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{u.email}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-purple-900 text-purple-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">
                  {editUserId === u._id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={editUserBalance}
                        onChange={e => setEditUserBalance(e.target.value)}
                        className="w-24 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 text-gray-900 dark:text-white text-xs"
                      />
                      <button onClick={() => handleSetBalance(u._id)} className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300">{t('common.save')}</button>
                      <button onClick={() => setEditUserId(null)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">X</button>
                    </div>
                  ) : (
                    <span>${u.balance?.toLocaleString()}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{u.propertyCount || 0}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.banned ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>
                    {u.banned ? t('admin.yes') : t('admin.no')}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditUserId(u._id); setEditUserBalance(String(u.balance)); }}
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
                {t('dashboard.showing', { shown: Math.min(userPage * USERS_PER_PAGE, filtered.length), total: filtered.length })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setUserPage(p => Math.max(1, p - 1))}
                  disabled={userPage === 1}
                  className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('marketplace.previous')}
                </button>
                <button
                  onClick={() => setUserPage(p => p + 1)}
                  disabled={userPage * USERS_PER_PAGE >= filtered.length}
                  className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('marketplace.next')}
                </button>
              </div>
            </div>
          )}
          </>;
          })()}
        </>
      )}

      {tab === 'properties' && (
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('admin.createProperty')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <select value={newPropCity} onChange={e => setNewPropCity(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm">
                <option value="">{t('admin.selectCity')}</option>
                {cityOptions.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <select value={newPropType} onChange={e => setNewPropType(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm">
                <option value="apartment">{t('property.apartment')}</option>
                <option value="house">{t('property.house')}</option>
                <option value="commercial">{t('property.commercial')}</option>
                <option value="land">{t('property.land')}</option>
              </select>
              <input value={newPropName} onChange={e => setNewPropName(e.target.value)} placeholder={t('admin.namePlaceholder')} className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm" />
              <input value={newPropPrice} onChange={e => setNewPropPrice(e.target.value)} placeholder={t('admin.basePricePlaceholder')} type="number" className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm" />
              <input value={newPropOwner} onChange={e => setNewPropOwner(e.target.value)} placeholder={t('admin.ownerIdPlaceholder')} className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm" />
            </div>
            <button onClick={handleCreateProperty} className="mt-3 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-gray-900 dark:text-white text-sm rounded transition-colors">{t('admin.create')}</button>
          </div>

          <input
            value={propSearch}
            onChange={e => { setPropSearch(e.target.value); setPropPage(1); }}
            placeholder={t('marketplace.searchPlaceholder')}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500"
          />

          {(() => {
            const filtered = propSearch
              ? adminProperties.filter(p =>
                  [p.name, p.cityId?.name, p.type, p.ownerId?.username]
                    .some(v => v?.toLowerCase().includes(propSearch.toLowerCase()))
                )
              : adminProperties;
            return <>
          <Table
            headers={[t('admin.name'), t('admin.type'), t('admin.city'), t('admin.price'), t('admin.rent'), t('admin.owner'), t('admin.actions')]}
            rows={filtered.slice(0, propPage * PROPS_PER_PAGE)}
            renderRow={(p) => (
              <>
                <td className="px-3 py-2 text-gray-900 dark:text-white">{p.name}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.type}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.cityId?.name || t('admin.na')}</td>
                <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">${p.currentPrice?.toLocaleString()}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">${p.rent?.toLocaleString()}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.ownerId?.username || t('admin.unowned')}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => { setEditPropId(p._id); setEditPropData({ currentPrice: p.currentPrice, rent: p.rent, forSale: p.forSale }); }} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300">{t('admin.edit')}</button>
                    <button onClick={() => handleDeleteProperty(p._id)} className="text-xs text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300">{t('admin.delete')}</button>
                  </div>
                </td>
              </>
            )}
          />
           {filtered.length > PROPS_PER_PAGE && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('dashboard.showing', { shown: Math.min(propPage * PROPS_PER_PAGE, filtered.length), total: filtered.length })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPropPage(p => Math.max(1, p - 1))}
                  disabled={propPage === 1}
                  className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('marketplace.previous')}
                </button>
                <button
                  onClick={() => setPropPage(p => p + 1)}
                  disabled={propPage * PROPS_PER_PAGE >= filtered.length}
                  className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('marketplace.next')}
                </button>
              </div>
            </div>
          )}
          </>;
          })()}

          {editPropId && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-md">
                <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{t('admin.editProperty')}</h3>
                <div className="space-y-3">
                  <div><label className="text-xs text-gray-500 dark:text-gray-400 block">{t('admin.price')}</label><input type="number" value={editPropData.currentPrice || ''} onChange={e => setEditPropData(p => ({ ...p, currentPrice: parseFloat(e.target.value) }))} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm" /></div>
                  <div><label className="text-xs text-gray-500 dark:text-gray-400 block">{t('admin.rent')}</label><input type="number" value={editPropData.rent || ''} onChange={e => setEditPropData(p => ({ ...p, rent: parseFloat(e.target.value) }))} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm" /></div>
                  <div><label className="text-xs text-gray-500 dark:text-gray-400 block">{t('city.forSale')}</label><select value={editPropData.forSale ? 'true' : 'false'} onChange={e => setEditPropData(p => ({ ...p, forSale: e.target.value === 'true' }))} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm"><option value="true">{t('admin.yes')}</option><option value="false">{t('admin.no')}</option></select></div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => handleUpdateProperty(editPropId)} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-gray-900 dark:text-white text-sm rounded">{t('common.save')}</button>
                  <button onClick={() => setEditPropId(null)} className="px-4 py-1.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white text-sm rounded">{t('common.cancel')}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'cities' && (
        <Table
          headers={[t('admin.name'), t('map.population'), t('map.demand'), t('map.supply'), t('map.avgPrice'), t('map.growthRate'), t('admin.actions')]}
          rows={cityOptions}
          renderRow={(c) => (
            <>
              <td className="px-3 py-2 text-gray-900 dark:text-white">{c.name}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{c.population?.toLocaleString()}</td>
              <td className="px-3 py-2">{c.demandIndex != null ? <span className={`text-xs px-2 py-0.5 rounded ${c.demandIndex > 60 ? 'bg-green-900 text-green-300' : c.demandIndex > 30 ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'}`}>{c.demandIndex}</span> : <span className="text-gray-400 dark:text-gray-500">-</span>}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{c.supplyIndex ?? '-'}</td>
              <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">${c.avgPrice?.toLocaleString() || '-'}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{c.growthRate != null ? `${c.growthRate}%` : '-'}</td>
              <td className="px-3 py-2">
                <button onClick={() => { setEditCityId(c._id); setEditCityData({ demandIndex: c.demandIndex, supplyIndex: c.supplyIndex, population: c.population, growthRate: c.growthRate, avgPrice: c.avgPrice }); }} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300">{t('admin.edit')}</button>
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
              {['demandIndex', 'supplyIndex', 'population', 'growthRate', 'avgPrice'].map(field => (
                <div key={field}>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block capitalize">{field.replace(/([A-Z])/g, ' $1')}</label>
                  <input type="number" value={editCityData[field] ?? ''} onChange={e => setEditCityData(d => ({ ...d, [field]: parseFloat(e.target.value) }))} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => handleUpdateCity(editCityId)} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-gray-900 dark:text-white text-sm rounded">Save</button>
              <button onClick={() => setEditCityId(null)} className="px-4 py-1.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white text-sm rounded">Cancel</button>
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
                <input value={newEventName} onChange={e => setNewEventName(e.target.value)} placeholder={t('admin.eventNamePlaceholder')} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('admin.description')}</label>
                <input value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)} placeholder={t('admin.descPlaceholder')} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('admin.category')}</label>
                <select value={newEventCategory} onChange={e => setNewEventCategory(e.target.value)} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm">
                  <option value="boom">{t('admin.boom')}</option>
                  <option value="recession">{t('admin.recession')}</option>
                  <option value="disaster">{t('admin.disaster')}</option>
                  <option value="policy">{t('admin.policyChange')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('admin.scope')}</label>
                <select value={newEventScope} onChange={e => setNewEventScope(e.target.value)} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm">
                  <option value="local">{t('admin.local')}</option>
                  <option value="global">{t('admin.global')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('admin.duration')} ({t('general.periods')})</label>
                <input value={newEventDuration} onChange={e => setNewEventDuration(parseInt(e.target.value) || 3)} type="number" min={1} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('admin.affectedCityIds')}</label>
                <input value={newEventCities} onChange={e => setNewEventCities(e.target.value)} placeholder={t('admin.cityIdsPlaceholder')} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-white text-sm" />
              </div>
            </div>
            <button onClick={handleCreateEvent} className="mt-3 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-gray-900 dark:text-white text-sm rounded transition-colors">{t('admin.create')}</button>
          </div>

          <input
            value={eventSearch}
            onChange={e => { setEventSearch(e.target.value); setEventPage(1); }}
            placeholder={t('marketplace.searchPlaceholder')}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500"
          />

          {(() => {
            const filtered = eventSearch
              ? adminEvents.filter(e =>
                  [e.name, e.type]
                    .some(v => v?.toLowerCase().includes(eventSearch.toLowerCase()))
                )
              : adminEvents;
            return <>
          <Table
            headers={[t('admin.name'), t('admin.type'), t('admin.duration'), t('admin.remaining'), t('admin.active'), t('admin.actions')]}
            rows={filtered.slice(0, eventPage * EVENTS_PER_PAGE)}
            renderRow={(e) => (
              <>
                <td className="px-3 py-2 text-gray-900 dark:text-white">{e.name}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{e.type}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{e.duration ?? '-'}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{e.remainingTicks ?? '-'}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${e.active ? 'bg-green-900 text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{e.active ? t('admin.active') : t('admin.inactive')}</span>
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => handleToggleEvent(e)} className={`text-xs ${e.active ? 'text-red-600 dark:text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`}>
                    {e.active ? t('admin.deactivate') : t('admin.activate')}
                  </button>
                </td>
              </>
            )}
          />
          {filtered.length > EVENTS_PER_PAGE && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('dashboard.showing', { shown: Math.min(eventPage * EVENTS_PER_PAGE, filtered.length), total: filtered.length })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setEventPage(p => Math.max(1, p - 1))}
                  disabled={eventPage === 1}
                  className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('marketplace.previous')}
                </button>
                <button
                  onClick={() => setEventPage(p => p + 1)}
                  disabled={eventPage * EVENTS_PER_PAGE >= filtered.length}
                  className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('marketplace.next')}
                </button>
              </div>
            </div>
          )}
          </>;
          })()}
        </div>
      )}
    </div>
  );
}
