import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { translateError } from '../i18n/errors';

const API = '/api';

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const SELECT_STYLE =
  'w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500';
const INPUT_STYLE =
  'w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500';

function PropertyCard({ p, cities, propertyTypes, onBuy, t, user, navigate }) {
  const cityData = typeof p.cityId === 'object' ? p.cityId : cities.find((c) => c._id === p.cityId);
  const cityName = cityData?.name || '—';
  const isBankOwned = !p.ownerId;

  return (
    <div className="bg-white dark:bg-gray-900 p-4 rounded flex flex-col gap-2 h-full">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3
            className="font-semibold cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate"
            onClick={() => navigate(`/property/${p._id}`)}
          >
            {p.name}
          </h3>
          {isBankOwned && (
            <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded shrink-0">
              {t('marketplace.bank')}
            </span>
          )}
        </div>
        <div className="flex gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1 flex-wrap">
          <span>{cityName}</span>
          <span>·</span>
          <span>{propertyTypes[p.type] || p.type}</span>
          <span>·</span>
          <span>
            {t('city.rent')}: ${p.rent?.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">${p.currentPrice?.toLocaleString()}</p>
        {user ? (
          <button
            onClick={() => onBuy(p._id)}
            className="bg-emerald-600 hover:bg-emerald-500 text-gray-900 dark:text-white text-sm px-4 py-1.5 rounded transition-colors"
          >
            {t('marketplace.buy')}
          </button>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('nav.login')}</p>
        )}
      </div>
    </div>
  );
}

export default function Marketplace() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, fetchMe } = useAuthStore();

  const [cities, setCities] = useState([]);
  const [properties, setProperties] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
  const [country, setCountry] = useState(searchParams.get('country') || '');
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [seller, setSeller] = useState(searchParams.get('seller') || '');
  const [listingStatus, setListingStatus] = useState(searchParams.get('forSale') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');
  const [page, setPage] = useState(parseInt(searchParams.get('page')) || 1);

  useEffect(() => {
    (async () => {
      try {
        const data = await api('/cities');
        setCities(data);
      } catch {}
    })();
  }, []);

  const countries = [...new Set(cities.map((c) => c.country).filter(Boolean))].sort();
  const filteredCities = country ? cities.filter((c) => c.country === country) : cities;

  const loadProperties = useCallback(async (params) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) qs.set(k, v);
      });
      const data = await api(`/properties?${qs.toString()}`);
      setProperties(data.properties);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
    setLoading(false);
  }, []);

  const applyFilters = () => {
    const params = { page: '1' };
    if (search) params.search = search;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (country) params.country = country;
    if (city) params.city = city;
    if (type) params.type = type;
    if (seller) params.seller = seller;
    if (listingStatus) params.forSale = listingStatus;
    if (sort && sort !== 'newest') params.sort = sort;
    setPage(1);
    setSearchParams(params);
    loadProperties(params);
  };

  const resetFilters = () => {
    setSearch('');
    setMinPrice('');
    setMaxPrice('');
    setCountry('');
    setCity('');
    setType('');
    setSeller('');
    setListingStatus('');
    setSort('newest');
    setPage(1);
    setSearchParams({});
    loadProperties({});
  };

  const goToPage = (p) => {
    setPage(p);
    const params = Object.fromEntries(searchParams.entries());
    params.page = String(p);
    setSearchParams(params);
    loadProperties({ ...searchParams, page: String(p) });
  };

  useEffect(() => {
    const params = Object.fromEntries(searchParams.entries());
    loadProperties(params);
  }, []);

  const handleBuy = async (propertyId) => {
    try {
      await api('/properties/buy', {
        method: 'POST',
        body: JSON.stringify({ propertyId }),
      });
      setActionMsg({ type: 'success', text: t('errors.propertyPurchased') });
      const params = Object.fromEntries(searchParams.entries());
      loadProperties(params);
      if (user) fetchMe();
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
  };

  const propertyTypes = {
    apartment: t('property.apartment'),
    house: t('property.house'),
    commercial: t('property.commercial'),
    land: t('property.land'),
  };

  const bankProperties = properties.filter((p) => !p.ownerId);
  const playerProperties = properties.filter((p) => p.ownerId);

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <h1 className="text-2xl font-bold mb-6">{t('marketplace.title')}</h1>

      {actionMsg && (
        <div
          className={`p-3 rounded mb-4 text-sm flex items-center justify-between ${actionMsg.type === 'success' ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}
        >
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="ml-2 text-lg leading-none">
            &times;
          </button>
        </div>
      )}

      {/* Mobile filter toggle */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="md:hidden w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-600 dark:text-gray-300 mb-4 flex items-center justify-between"
      >
        <span>{t('marketplace.filters')}</span>
        <svg
          className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Filter panel */}
      <div className={`bg-white dark:bg-gray-900 rounded-lg p-4 mb-6 ${showFilters ? 'block' : 'hidden'} md:block`}>
        {/* Search */}
        <div className="mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('marketplace.searchPlaceholder')}
            className={INPUT_STYLE}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyFilters();
            }}
          />
        </div>

        {/* Filter grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('marketplace.minPrice')}</label>
            <input
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="$0"
              className={INPUT_STYLE}
              min="0"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('marketplace.maxPrice')}</label>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="$999,999,999"
              className={INPUT_STYLE}
              min="0"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('marketplace.country')}</label>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setCity('');
              }}
              className={SELECT_STYLE}
            >
              <option value="">{t('marketplace.allCountries')}</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('marketplace.city')}</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className={SELECT_STYLE}>
              <option value="">{t('marketplace.allCities')}</option>
              {filteredCities.map((c) => (
                <option key={c._id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('marketplace.type')}</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={SELECT_STYLE}>
              <option value="">{t('marketplace.allTypes')}</option>
              <option value="apartment">{t('property.apartment')}</option>
              <option value="house">{t('property.house')}</option>
              <option value="commercial">{t('property.commercial')}</option>
              <option value="land">{t('property.land')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('marketplace.seller')}</label>
            <select value={seller} onChange={(e) => setSeller(e.target.value)} className={SELECT_STYLE}>
              <option value="">{t('marketplace.allSellers')}</option>
              <option value="bank">{t('marketplace.bank')}</option>
              <option value="player">{t('marketplace.player')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('marketplace.status')}</label>
            <select value={listingStatus} onChange={(e) => setListingStatus(e.target.value)} className={SELECT_STYLE}>
              <option value="">{t('marketplace.allStatuses')}</option>
              <option value="true">{t('marketplace.forSale')}</option>
              <option value="false">{t('marketplace.notForSale')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('marketplace.sort')}</label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className={SELECT_STYLE}>
              <option value="newest">{t('marketplace.newestListed')}</option>
              <option value="oldest">{t('marketplace.oldestListed')}</option>
              <option value="price_asc">{t('marketplace.priceLowToHigh')}</option>
              <option value="price_desc">{t('marketplace.priceHighToLow')}</option>
              <option value="return">{t('marketplace.highestReturn')}</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={applyFilters}
            className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-gray-900 dark:text-white text-sm rounded transition-colors"
          >
            {t('marketplace.applyFilters')}
          </button>
          <button
            onClick={resetFilters}
            className="px-4 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 text-sm rounded transition-colors"
          >
            {t('marketplace.resetFilters')}
          </button>
        </div>
      </div>

      {/* Result count */}
      {!loading && properties.length > 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          {t('marketplace.totalResults', { count: total })}
        </p>
      )}

      {/* Property list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      ) : properties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-gray-500 dark:text-gray-400 mb-1">{t('marketplace.noResults')}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">{t('marketplace.noResultsHint')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {bankProperties.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-3">
                {t('marketplace.bankProperties', { count: bankProperties.length })}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
                {bankProperties.map((p) => (
                  <PropertyCard
                    key={p._id}
                    p={p}
                    cities={cities}
                    propertyTypes={propertyTypes}
                    onBuy={handleBuy}
                    t={t}
                    user={user}
                    navigate={navigate}
                  />
                ))}
              </div>
            </div>
          )}
          {playerProperties.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-3">
                {t('marketplace.playerListings', { count: playerProperties.length })}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
                {playerProperties.map((p) => (
                  <PropertyCard
                    key={p._id}
                    p={p}
                    cities={cities}
                    propertyTypes={propertyTypes}
                    onBuy={handleBuy}
                    t={t}
                    user={user}
                    navigate={navigate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('marketplace.previous')}
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {t('marketplace.page')} {page} / {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('marketplace.next')}
          </button>
        </div>
      )}
    </div>
  );
}
