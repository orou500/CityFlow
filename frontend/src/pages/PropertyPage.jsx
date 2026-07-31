import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCompanyStore } from '../store/useCompanyStore';
import { translateError } from '../i18n/errors';
import { formatMoney, formatMoneyExact, formatCompact } from '../utils/format';
import CompactValue from '../components/CompactValue';
import RiskDashboard from '../components/RiskDashboard';
import PropertyImage from '../components/PropertyImage';
import { getApiBaseUrl } from '../utils/capacitor';

const API = getApiBaseUrl();

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function PriceHistoryChart({ history }) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const [activeIdx, setActiveIdx] = useState(null);
  const [pinned, setPinned] = useState(false);

  if (!history || history.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-500 text-sm">
        {t('propertyDetail.notEnoughData')}
      </div>
    );
  }

  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 600;
  const h = 160;
  const padding = 24;
  const chartW = w - padding * 2;
  const chartH = h - padding * 2;

  const getPoint = (i) => {
    const t = i / (prices.length - 1);
    const x = isRtl ? padding + (1 - t) * chartW : padding + t * chartW;
    const y = padding + chartH - ((prices[i] - min) / range) * chartH;
    return { x, y };
  };

  const polyline = prices
    .map((_, i) => {
      const pt = getPoint(i);
      return `${pt.x},${pt.y}`;
    })
    .join(' ');

  const startColor = prices[0] <= prices[prices.length - 1] ? '#1E90FF' : '#ef4444';

  const active = activeIdx !== null ? history[activeIdx] : null;
  const activePt = activeIdx !== null ? getPoint(activeIdx) : null;
  const prevPrice = activeIdx > 0 ? history[activeIdx - 1].price : null;
  const diff = activeIdx > 0 && active ? active.price - history[activeIdx - 1].price : null;
  const diffPct = diff !== null && prevPrice ? (diff / prevPrice) * 100 : null;

  const fmt = formatMoneyExact;
  const fmtDiff = (v) => {
    const sign = v >= 0 ? '+' : '';
    return `${sign}$${formatCompact(Math.abs(v))}`;
  };
  const fmtPct = (v) => {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  };

  const showPoint = (i) => {
    if (!pinned) setActiveIdx(i);
  };
  const hidePoint = () => {
    if (!pinned) setActiveIdx(null);
  };
  const clickPoint = (i) => {
    if (pinned && activeIdx === i) {
      setPinned(false);
      setActiveIdx(null);
    } else {
      setActiveIdx(i);
      setPinned(true);
    }
  };

  const isTopHalf = activePt && activePt.y < h * 0.35;

  return (
    <div className="relative" onMouseLeave={hidePoint}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible">
        <polyline
          fill="none"
          stroke={startColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polyline}
        />
        <text
          x={isRtl ? w - padding : padding}
          y={padding + 10}
          className="fill-gray-600 dark:fill-gray-300 text-[10px]"
          textAnchor={isRtl ? 'end' : 'start'}
        >
          {fmt(max)}
        </text>
        <text
          x={isRtl ? w - padding : padding}
          y={h - padding - 4}
          className="fill-gray-600 dark:fill-gray-300 text-[10px]"
          textAnchor={isRtl ? 'end' : 'start'}
        >
          {fmt(min)}
        </text>
        <text
          x={isRtl ? padding : w - padding}
          y={h - padding - 4}
          className="fill-gray-600 dark:fill-gray-300 text-[10px]"
          textAnchor={isRtl ? 'start' : 'end'}
        >
          {prices.length} {t('general.periods')}
        </text>
        {prices.map((_, i) => {
          const pt = getPoint(i);
          const isActive = activeIdx === i;
          return (
            <g key={i}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isActive ? 5 : 3.5}
                fill={isActive ? '#1E90FF' : '#6b7280'}
                stroke={isActive ? '#0057B8' : 'none'}
                strokeWidth={isActive ? 2 : 0}
              />
              <circle
                cx={pt.x}
                cy={pt.y}
                r="14"
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => showPoint(i)}
                onClick={() => clickPoint(i)}
              />
            </g>
          );
        })}
      </svg>

      {active && activePt && (
        <div
          className={`absolute z-10 min-w-[140px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs shadow-lg ${pinned ? 'shadow-2xl ring-1 ring-blue-500/40' : 'pointer-events-none'}`}
          style={{
            left: `${(activePt.x / w) * 100}%`,
            top: isTopHalf ? `${(activePt.y / h) * 100 + 2}%` : `${(activePt.y / h) * 100}%`,
            transform: isTopHalf ? 'translate(-50%, 10px)' : 'translate(-50%, calc(-100% - 10px))',
          }}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              ...(isTopHalf
                ? { top: '-5px', borderBottom: '5px solid var(--color-border)' }
                : { bottom: '-5px', borderTop: '5px solid var(--color-border)' }),
            }}
          />

          <div className="space-y-0.5">
            <div>
              <span className="text-gray-500 dark:text-gray-400">{t('propertyDetail.chartMonth')}</span> {active.tick}
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">{t('propertyDetail.chartPrice')}</span>{' '}
              <span className="font-semibold text-blue-600 dark:text-blue-400">{fmt(active.price)}</span>
            </div>
            {diff !== null && (
              <>
                <div className={`${diff >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                  <span className="text-gray-500 dark:text-gray-400">{t('propertyDetail.chartChange')}</span>{' '}
                  {fmtDiff(diff)} ({fmtPct(diffPct)})
                </div>
                <div className="text-gray-400 dark:text-gray-500">
                  <span className="text-gray-500 dark:text-gray-400">{t('propertyDetail.chartPrevious')}</span>{' '}
                  {fmt(prevPrice)}
                </div>
              </>
            )}
          </div>

          {pinned && (
            <button
              onClick={() => {
                setPinned(false);
                setActiveIdx(null);
              }}
              className="absolute -top-2 -right-2 w-4 h-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-300 text-[10px] leading-none"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const propertyTypes = {
  apartment: 'Apartment',
  house: 'House',
  commercial: 'Commercial',
  land: 'Land',
};

export default function PropertyPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const { fetchUserData, createOffer } = useGameStore();
  const {
    myCompanies,
    fetchMyCompanies,
    createPropertyPurchaseRequest,
    createDevelopmentRequest,
    fetchDevelopmentRequests,
    voteDevelopmentRequest,
  } = useCompanyStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerLoading, setOfferLoading] = useState(false);
  const [unitsPage, setUnitsPage] = useState(0);
  const [gradeData, setGradeData] = useState(null);
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [gradeLoading, setGradeLoading] = useState(false);
  const [improvementStatus, setImprovementStatus] = useState(null);
  const [managementData, setManagementData] = useState(null);
  const [managementHistory, setManagementHistory] = useState([]);
  const [rentInput, setRentInput] = useState('');
  const [maintenanceMsg, setMaintenanceMsg] = useState(null);
  const [rentMsg, setRentMsg] = useState(null);
  const [devRequests, setDevRequests] = useState([]);
  const [devOptions, setDevOptions] = useState(null);
  const [showAllConstruction, setShowAllConstruction] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);
  const [devModalType, setDevModalType] = useState('');
  const [devModalData, setDevModalData] = useState(null);
  const [devLoading, setDevLoading] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState(null);
  const UNITS_PER_PAGE = 5;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api(`/properties/${id}/detail`);
      setData(res);
      const prop = res.property;
      const isDirectOwner = prop?.ownerId?._id === user?._id;
      const isCompanyProp = !!prop?.companyId;
      const shouldLoadManagement = isDirectOwner || isCompanyProp;
      if (shouldLoadManagement) {
        try {
          const improvementRes = await api(`/development/improvements/status/${id}`);
          setImprovementStatus(improvementRes);
        } catch {
          /* not owner/not authorized */
        }
        try {
          const mgmtRes = await api(`/management/${id}`);
          setManagementData(mgmtRes);
          setRentInput(String(mgmtRes.perUnitRent || ''));
          try {
            const histRes = await api(`/management/${id}/history?limit=30`);
            setManagementHistory(histRes);
          } catch {
            /* no history yet */
          }
        } catch {
          /* not owner/not authorized */
        }
      }
      api('/world/status')
        .then((s) => setCurrentPeriod(s.currentCycle))
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) {
      setUnitsPage(0);
      load();
    }
  }, [id]);

  useEffect(() => {
    if (user) fetchMyCompanies();
  }, [user]);

  useEffect(() => {
    const propCompany = data?.property?.companyId;
    const companyId = typeof propCompany === 'object' ? propCompany?._id : propCompany;
    if (companyId && data?.property) {
      fetchDevelopmentRequests(companyId)
        .then((requests) => {
          const propId = data.property._id?.toString?.() || data.property._id;
          setDevRequests(
            (requests || []).filter((r) => {
              const rPropId = r.propertyId?._id?.toString?.() || r.propertyId?.toString?.() || r.propertyId;
              return rPropId === propId;
            }),
          );
        })
        .catch(() => {});
      const loadOptions = async () => {
        try {
          const prop = data.property;
          if (prop.type === 'land' && prop.cityId) {
            const cityId = prop.cityId._id || prop.cityId;
            const locationParam = prop.location ? `?location=${encodeURIComponent(prop.location)}` : '';
            const options = await api(`/development/options/city/${cityId}${locationParam}`);
            const allProjects = options.flatMap((c) => c.projects);
            if (allProjects.length > 0) {
              setDevOptions({ type: 'construction', options: allProjects });
            }
          } else if (prop.type !== 'land') {
            const [upgrades, improvements] = await Promise.all([
              api(`/development/upgrades/${id}`).catch(() => null),
              api(`/development/improvements/available/${id}`).catch(() => null),
            ]);
            setDevOptions({
              type: 'development',
              upgrades: upgrades?.upgrades || [],
              improvements: improvements?.available || [],
            });
          }
        } catch {
          /* not authorized */
        }
      };
      loadOptions();
    }
  }, [data?.property?.companyId, data?.property?._id]);

  const handleBuy = async () => {
    try {
      const res = await api('/properties/buy', {
        method: 'POST',
        body: JSON.stringify({ propertyId: id }),
      });
      setActionMsg({ type: 'success', text: t('errors.propertyPurchased') });
      load();
      fetchMe();
      fetchUserData();
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
  };

  const ceoCompanies = myCompanies.filter((c) => {
    const member = c.members?.find((m) => {
      const uid = m.userId?._id || m.userId;
      return uid?.toString() === user?._id?.toString();
    });
    return (
      member?.role === 'ceo' ||
      c.founderId?._id?.toString() === user?._id?.toString() ||
      c.founderId?.toString() === user?._id?.toString()
    );
  });

  const handleProposeCompanyPurchase = async () => {
    const companyId = ceoCompanies[0]?._id;
    if (!companyId) return;
    try {
      await createPropertyPurchaseRequest(companyId, id);
      setActionMsg({ type: 'success', text: t('propertyDetail.companyPurchaseProposed') });
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
  };

  const handleSell = async () => {
    try {
      const res = await api('/properties/sell', {
        method: 'POST',
        body: JSON.stringify({ propertyId: id }),
      });
      const price = res.property?.currentPrice || 0;
      setActionMsg({ type: 'success', text: t('errors.propertySold', { price: formatMoney(price) }) });
      load();
      fetchMe();
      fetchUserData();
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
  };

  const handleMakeOffer = async () => {
    const amount = parseFloat(offerAmount);
    if (!amount || amount <= 0) return;
    setOfferLoading(true);
    try {
      await createOffer(id, amount);
      setActionMsg({ type: 'success', text: t('propertyDetail.offerSent') });
      setShowOfferModal(false);
      setOfferAmount('');
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
    setOfferLoading(false);
  };

  const handleGradeUpgrade = async () => {
    setGradeLoading(true);
    try {
      const res = await api('/properties/grade/upgrade', {
        method: 'POST',
        body: JSON.stringify({ propertyId: id }),
      });
      setActionMsg({ type: 'success', text: t('propertyDetail.gradeUpgraded', { grade: res.grade }) });
      setShowGradeModal(false);
      await load();
      await fetchMe();
      await fetchUserData();
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
    setGradeLoading(false);
  };

  const handleSetRent = async () => {
    const amount = parseFloat(rentInput);
    if (!amount || amount <= 0) {
      setRentMsg({ type: 'error', text: t('propertyManagement.rentInputPlaceholder') });
      return;
    }
    setRentMsg(null);
    try {
      await api(`/management/${id}/rent`, {
        method: 'POST',
        body: JSON.stringify({ rentPerUnit: amount }),
      });
      setRentMsg({ type: 'success', text: t('propertyManagement.rentUpdated') });
      const mgmtRes = await api(`/management/${id}`);
      setManagementData(mgmtRes);
      await load();
    } catch (err) {
      setRentMsg({ type: 'error', text: err.message });
    }
  };

  const handleSetMaintenance = async (level) => {
    setMaintenanceMsg(null);
    try {
      await api(`/management/${id}/maintenance`, {
        method: 'POST',
        body: JSON.stringify({ level }),
      });
      setMaintenanceMsg({ type: 'success', text: t('propertyManagement.maintenanceUpdated') });
      const mgmtRes = await api(`/management/${id}`);
      setManagementData(mgmtRes);
      const histRes = await api(`/management/${id}/history?limit=30`);
      setManagementHistory(histRes);
      await load();
    } catch (err) {
      setMaintenanceMsg({ type: 'error', text: err.message });
    }
  };

  const propCompany = data?.property?.companyId;
  const ownedCompanyId = typeof propCompany === 'object' ? propCompany?._id : propCompany;
  const owningCompany = ownedCompanyId
    ? myCompanies.find((c) => {
        const cid = c._id?.toString?.() || c._id;
        return cid === ownedCompanyId?.toString?.();
      })
    : null;

  const handleOpenDevProposal = (type, option) => {
    setDevModalType(type);
    setDevModalData(option);
    setShowDevModal(true);
  };

  const handleCreateDevProposal = async () => {
    if (!ownedCompanyId || !devModalType) return;
    setDevLoading(true);
    try {
      let actionType, actionData;
      if (devModalType === 'upgrade') {
        actionType = 'upgrade';
        actionData = { upgradeType: devModalData.type };
      } else if (devModalType === 'improvement') {
        actionType = 'improvement';
        actionData = { improvementId: devModalData.id };
      } else if (devModalType === 'construction') {
        actionType = 'construction';
        actionData = { projectType: devModalData.id };
      }
      await createDevelopmentRequest(ownedCompanyId, id, actionType, actionData);
      setActionMsg({ type: 'success', text: t('companyDevelopment.proposalCreated') });
      setShowDevModal(false);
      const requests = await fetchDevelopmentRequests(ownedCompanyId);
      setDevRequests(
        (requests || []).filter((r) => {
          const rPropId = r.propertyId?._id?.toString?.() || r.propertyId?.toString?.() || r.propertyId;
          return rPropId === id;
        }),
      );
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
    setDevLoading(false);
  };

  const handleVoteDevRequest = async (reqId, vote) => {
    if (!ownedCompanyId) return;
    try {
      await voteDevelopmentRequest(ownedCompanyId, reqId, vote);
      const requests = await fetchDevelopmentRequests(ownedCompanyId);
      setDevRequests(
        (requests || []).filter((r) => {
          const rPropId = r.propertyId?._id?.toString?.() || r.propertyId?.toString?.() || r.propertyId;
          return rPropId === id;
        }),
      );
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
  };

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-600 dark:text-red-400">
          {error ? translateError(new Error(error), t) : t('errors.Property not found')}
        </p>
      </div>
    );
  }

  const { property, totalRentEarned, totalInvestment, investmentHistory, intrinsicValue, unrealizedGain, roi } = data;
  const isOwner = user && property.ownerId?._id === user._id;
  const isCompanyOwned = !!property.companyId;
  const isCompanyMember =
    isCompanyOwned &&
    myCompanies.some((c) => {
      const cid = c._id?.toString?.() || c._id;
      const propCid = typeof property.companyId === 'object' ? property.companyId?._id : property.companyId;
      return (
        cid === propCid?.toString?.() &&
        c.members?.some((m) => {
          const uid = m.userId?._id || m.userId;
          return uid?.toString?.() === user?._id?.toString?.() && ['ceo', 'director'].includes(m.role);
        })
      );
    });
  const hasManageAccess = isOwner || isCompanyMember;
  const isBankOwned = !property?.ownerId && !isCompanyOwned;
  const canOffer = user && !hasManageAccess && !isBankOwned && (property?.ownerId || isCompanyOwned);

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 mb-4 inline-block"
      >
        &larr; {t('propertyDetail.backToCity')}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <PropertyImage
              property={property}
              alt={property.name}
              className="w-full max-h-[480px] object-contain bg-gray-100 dark:bg-gray-800 rounded-md mb-4"
            />
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <h1 className="text-2xl font-bold min-w-0 flex-1 break-words">{property.name}</h1>
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium capitalize shrink-0">
                {t(`property.${property.type}`, { defaultValue: property.type })}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.currentValue')}</p>
                <p className="text-sm md:text-lg font-bold text-orange-500 dark:text-orange-400 break-words whitespace-normal">
                  <CompactValue value={property.currentPrice} />
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.baseValue')}</p>
                <p className="text-sm md:text-lg font-semibold break-words whitespace-normal">
                  <CompactValue value={property.basePrice} />
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.propertyType')}</p>
                <p className="text-sm md:text-lg font-semibold break-words whitespace-normal">
                  {t(`property.${property.type}`, { defaultValue: property.type })}
                </p>
              </div>
              {property.size > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.propertySize')}</p>
                  <p className="text-sm md:text-lg font-semibold break-words whitespace-normal">
                    {formatCompact(property.size)} {t('development.sqft')}
                  </p>
                </div>
              )}
              {intrinsicValue > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.intrinsicValue')}</p>
                  <p className="text-sm md:text-lg font-semibold text-blue-600 dark:text-blue-400 break-words whitespace-normal">
                    <CompactValue value={intrinsicValue} />
                  </p>
                </div>
              )}
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.rentIncome')}</p>
                <p className="text-sm md:text-lg font-semibold text-orange-500 dark:text-orange-400 break-words whitespace-normal">
                  <CompactValue value={property.rent} />
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.condition')}</p>
                <p className="text-sm md:text-lg font-semibold">{property.condition}%</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.propertyRating')}</p>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-yellow-500 text-sm leading-none capitalize break-words">
                    {improvementStatus?.propertyRating || property.propertyRating || 'standard'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-3">{t('propertyDetail.marketInfo')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                  {t('propertyDetail.demandIndex')}
                </p>
                <p className="text-lg font-semibold break-words">{property.cityId?.demandIndex?.toFixed(2) || '—'}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                  {t('propertyDetail.supplyIndex')}
                </p>
                <p className="text-lg font-semibold break-words">{property.cityId?.supplyIndex?.toFixed(2) || '—'}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                  {t('propertyDetail.growthRate')}
                </p>
                <p className="text-lg font-semibold break-words">
                  {property.cityId?.growthRate != null ? `${(property.cityId.growthRate * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>
          </div>

          {data?.riskProfile && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
              <div className="mb-3 bg-blue-900/20 border border-blue-800 rounded p-3 text-xs text-blue-300">
                {t('propertyDetail.riskExplanation')}
              </div>
              <RiskDashboard riskProfile={data.riskProfile} />
            </div>
          )}

          {property.units && property.units.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-3">
                {t('propertyDetail.buildingUnits', { count: property.units.length })}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.occupancy')}</p>
                  <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{property.occupancy}%</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.maintenanceCost')}</p>
                  <p className="text-sm md:text-lg font-semibold text-red-600 dark:text-red-400 break-words whitespace-normal">
                    <CompactValue value={property.maintenanceCost} />
                  </p>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {(() => {
                  const start = unitsPage * UNITS_PER_PAGE;
                  const end = start + UNITS_PER_PAGE;
                  const pageUnits = property.units.slice(start, end);
                  const totalPages = Math.ceil(property.units.length / UNITS_PER_PAGE);
                  return (
                    <>
                      {pageUnits.map((unit, i) => (
                        <div
                          key={start + i}
                          className="bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded text-sm flex justify-between items-center gap-2"
                        >
                          <div className="min-w-0 break-words">
                            <span className="text-gray-500 dark:text-gray-400">
                              {t('propertyDetail.unitNumber', { number: unit.unitNumber })}
                            </span>
                            <span className="text-gray-400 dark:text-gray-500 ml-2">
                              {unit.type?.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-blue-600 dark:text-blue-400">
                              {formatMoney(unit.rentPrice)}
                              {t('propertyDetail.perPeriod')}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${unit.occupied ? 'bg-blue-900 text-blue-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
                            >
                              {unit.occupied ? t('propertyDetail.occupied') : t('propertyDetail.vacant')}
                            </span>
                          </div>
                        </div>
                      ))}
                      {property.units.length > UNITS_PER_PAGE && (
                        <div className="flex items-center justify-between pt-2 text-xs text-gray-500 dark:text-gray-400">
                          <button
                            onClick={() => setUnitsPage((p) => Math.max(0, p - 1))}
                            disabled={unitsPage === 0}
                            className="px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            &larr; {t('common.previous')}
                          </button>
                          <span>
                            {t('common.showingRange', {
                              start: start + 1,
                              end: Math.min(end, property.units.length),
                              total: property.units.length,
                            })}
                          </span>
                          <button
                            onClick={() => setUnitsPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={unitsPage >= totalPages - 1}
                            className="px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            {t('common.next')} &rarr;
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {hasManageAccess && managementData && property?.type !== 'land' && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-4">{t('propertyManagement.title')}</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                    {t('propertyManagement.qualityScore')}
                  </p>
                  <p
                    className={`text-lg font-bold break-words ${managementData.qualityScore >= 70 ? 'text-blue-600 dark:text-blue-400' : managementData.qualityScore >= 40 ? 'text-yellow-500' : 'text-red-500'}`}
                  >
                    {managementData.qualityScore}/100
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                    {t('propertyManagement.occupancy')}
                  </p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400 break-words">
                    {managementData.occupancy}%
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                    {t('propertyManagement.maintenanceLevel')}
                  </p>
                  <p className="text-lg font-bold capitalize break-words">{managementData.maintenanceLevel}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                    {t('propertyManagement.netProfit')}
                  </p>
                  <p
                    className={`text-lg font-bold break-words ${managementData.netProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}
                  >
                    {formatMoney(managementData.netProfit)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
                  <p className="text-sm font-semibold mb-2">{t('propertyManagement.setRent')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {t('propertyManagement.currentRentPerUnit')}: {formatMoney(managementData.perUnitRent)}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={rentInput}
                      onChange={(e) => setRentInput(e.target.value)}
                      placeholder={t('propertyManagement.rentInputPlaceholder')}
                      className="flex-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-gray-900 dark:text-white text-sm"
                    />
                    <button
                      onClick={handleSetRent}
                      disabled={!managementData.rentChangeAvailable}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
                    >
                      {t('common.save')}
                    </button>
                  </div>
                  {rentMsg && (
                    <p className={`text-xs mt-2 ${rentMsg.type === 'success' ? 'text-blue-500' : 'text-red-500'}`}>
                      {rentMsg.text}
                    </p>
                  )}
                  {!managementData.rentChangeAvailable && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {t('propertyManagement.rentCooldown', { months: 1 })}
                    </p>
                  )}
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
                  <p className="text-sm font-semibold mb-2">{t('propertyManagement.setMaintenance')}</p>
                  <div className="space-y-1.5">
                    {managementData.maintenanceTiers?.map((tier) => (
                      <button
                        key={tier.id}
                        onClick={() => handleSetMaintenance(tier.id)}
                        disabled={managementData.maintenanceLevel === tier.id}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          managementData.maintenanceLevel === tier.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">
                            {t(`propertyManagement.${tier.id === 'none' ? 'noMaintenance' : tier.id + 'Maintenance'}`)}
                          </span>
                          <span className="text-xs opacity-75">
                            {tier.monthlyCost > 0
                              ? formatMoney(tier.monthlyCost) + t('propertyDetail.perPeriod')
                              : t('propertyManagement.none')}
                          </span>
                        </div>
                        <p className="text-xs opacity-70 mt-0.5">
                          {t(
                            `propertyManagement.${tier.id === 'none' ? 'noMaintenance' : tier.id + 'Maintenance'}Desc`,
                          )}
                        </p>
                      </button>
                    ))}
                  </div>
                  {maintenanceMsg && (
                    <p
                      className={`text-xs mt-2 ${maintenanceMsg.type === 'success' ? 'text-blue-500' : 'text-red-500'}`}
                    >
                      {maintenanceMsg.text}
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <p className="text-sm font-semibold">{t('propertyManagement.history')}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyManagement.historyDesc')}</p>
                  </div>
                </div>
                {managementHistory.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-1 pr-2">{t('propertyManagement.month')}</th>
                          <th className="text-right py-1 px-2">{t('propertyManagement.qualityScore')}</th>
                          <th className="text-right py-1 px-2">{t('propertyManagement.occupancy')}</th>
                          <th className="text-right py-1 px-2">{t('propertyManagement.rentIncome')}</th>
                          <th className="text-right py-1 px-2">{t('propertyManagement.maintenanceCost')}</th>
                          <th className="text-right py-1 pl-2">{t('propertyManagement.netProfit')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {managementHistory
                          .slice()
                          .reverse()
                          .slice(0, 12)
                          .map((entry, i) => (
                            <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                              <td className="py-1 pr-2 text-gray-600 dark:text-gray-300">
                                {t('propertyManagement.tick', { number: entry.tick })}
                              </td>
                              <td className="py-1 px-2 text-right">
                                <span
                                  className={
                                    entry.qualityScore >= 70
                                      ? 'text-blue-500'
                                      : entry.qualityScore >= 40
                                        ? 'text-yellow-500'
                                        : 'text-red-500'
                                  }
                                >
                                  {entry.qualityScore}
                                </span>
                              </td>
                              <td className="py-1 px-2 text-right text-blue-500">{entry.occupancy}%</td>
                              <td className="py-1 px-2 text-right text-blue-600 dark:text-blue-400">
                                {formatMoney(entry.rentIncome)}
                              </td>
                              <td className="py-1 px-2 text-right text-red-500">
                                {formatMoney(entry.maintenanceCost)}
                              </td>
                              <td
                                className={`py-1 pl-2 text-right font-medium ${entry.netProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}
                              >
                                {formatMoney(entry.netProfit)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                    {t('propertyManagement.noHistory')}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-3">{t('propertyDetail.priceHistory')}</h2>
            <div className="overflow-visible">
              <PriceHistoryChart history={property.priceHistory} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">{t('propertyDetail.ownership')}</h2>
            {hasManageAccess ? (
              <div className="space-y-3">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.owner')}</p>
                  <p className="font-semibold">{user.username}</p>
                </div>
                {property.lastPurchasePrice && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.purchasePrice')}</p>
                    <p className="font-semibold break-words whitespace-normal">{formatMoney(property.lastPurchasePrice)}</p>
                  </div>
                )}
                {property.lastPurchaseDate && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.purchaseDate')}</p>
                    <p className="font-semibold text-sm break-words">
                      {new Date(property.lastPurchaseDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.totalRentEarned')}</p>
                  <p className="font-semibold text-purple-600 dark:text-purple-400 break-words whitespace-normal">
                    {formatMoney(totalRentEarned)}
                  </p>
                </div>
                {totalInvestment > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.totalInvestment')}</p>
                    <p className="font-semibold text-orange-500 dark:text-orange-400 break-words whitespace-normal">
                      {formatMoney(totalInvestment)}
                    </p>
                  </div>
                )}
              </div>
            ) : property.ownerId ? (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.owner')}</p>
                <p className="font-semibold">{property.ownerId.username || 'Unknown'}</p>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">{t('propertyDetail.unowned')}</p>
            )}
          </div>

          {hasManageAccess && investmentHistory && investmentHistory.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-4">{t('propertyDetail.investments')}</h2>
              <div className="space-y-3">
                {property.lastPurchasePrice > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.purchasePrice')}</p>
                    <p className="font-semibold break-words whitespace-normal">{formatMoney(property.lastPurchasePrice)}</p>
                  </div>
                )}
                {totalInvestment > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('propertyDetail.totalCapitalInvested')}
                    </p>
                    <p className="font-semibold text-orange-500 dark:text-orange-400 break-words whitespace-normal">
                      {formatMoney(totalInvestment)}
                    </p>
                  </div>
                )}
                {intrinsicValue > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.intrinsicValue')}</p>
                    <p className="font-semibold text-blue-600 dark:text-blue-400 break-words whitespace-normal">
                      <CompactValue value={intrinsicValue} />
                    </p>
                  </div>
                )}
                {totalInvestment > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.unrealizedGain')}</p>
                    <p
                      className={`font-semibold break-words whitespace-normal ${unrealizedGain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {unrealizedGain >= 0 ? '+' : ''}
                      {formatMoney(unrealizedGain)}
                    </p>
                  </div>
                )}
                {totalInvestment > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('propertyDetail.roi')}</p>
                    <p
                      className={`font-semibold break-words whitespace-normal ${roi >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {roi >= 0 ? '+' : ''}
                      {roi.toFixed(1)}%
                    </p>
                  </div>
                )}
              </div>

              {investmentHistory.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">
                    {t('propertyDetail.investmentHistory')}
                  </h3>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {investmentHistory
                      .slice()
                      .reverse()
                      .map((inv, idx) => (
                        <div
                          key={idx}
                          className="bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded text-sm flex justify-between items-center gap-2"
                        >
                          <div className="min-w-0 break-words">
                            <span className="text-gray-900 dark:text-white">{inv.description || inv.type}</span>
                            {inv.tick && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">#{inv.tick}</span>
                            )}
                          </div>
                          <span className="font-semibold text-orange-500 dark:text-orange-400 shrink-0 break-words">
                            {formatMoney(inv.amount)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {actionMsg && (
            <div
              className={`p-3 rounded text-sm ${actionMsg.type === 'success' ? 'bg-blue-900 text-blue-300' : 'bg-red-900 text-red-300'}`}
            >
              {actionMsg.text}
              <button onClick={() => setActionMsg(null)} className="ml-2">
                &times;
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">{t('propertyDetail.actions')}</h2>
            <div className="space-y-2">
              {property.cityId && (
                <button
                  onClick={() => navigate(`/city/${property.cityId._id || property.cityId}`)}
                  className="w-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm py-2 rounded transition-colors"
                >
                  {t('propertyDetail.navToCity')}
                </button>
              )}
              {user && !hasManageAccess && property.forSale && (
                <button
                  onClick={handleBuy}
                  className="w-full bg-orange-500 hover:bg-orange-400 text-gray-900 dark:text-white text-sm py-2 rounded transition-colors break-words"
                >
                  {t('propertyDetail.buyProperty')} — {formatMoney(property.currentPrice)}
                </button>
              )}
              {user && !hasManageAccess && property.forSale && ceoCompanies.length > 0 && (
                <button
                  onClick={handleProposeCompanyPurchase}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white text-sm py-2 rounded transition-colors"
                >
                  {t('propertyDetail.proposeCompanyPurchase')}
                </button>
              )}
              {canOffer && (
                <button
                  onClick={() => setShowOfferModal(true)}
                  className="w-full bg-orange-500 hover:bg-orange-400 text-gray-900 dark:text-white text-sm py-2 rounded transition-colors"
                >
                  {t('propertyDetail.makeOffer')}
                </button>
              )}
              {user && hasManageAccess && (
                <button
                  onClick={handleSell}
                  className="w-full bg-yellow-600 hover:bg-yellow-500 text-gray-900 dark:text-white text-sm py-2 rounded transition-colors break-words"
                >
                  {t('propertyDetail.sellProperty')} — {formatMoney(property.currentPrice)}
                </button>
              )}
              {user && hasManageAccess && improvementStatus && property?.type !== 'land' && !isCompanyOwned && (
                <button
                  onClick={() => navigate(`/development?tab=improvements&propertyId=${id}`)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded transition-colors"
                >
                  {t('propertyDetail.viewImprovements')}
                </button>
              )}
              {user &&
                hasManageAccess &&
                isCompanyOwned &&
                devOptions?.type === 'development' &&
                !property.companyId?.activeImprovement &&
                devOptions.improvements.length > 0 && (
                  <div className="space-y-1">
                    {devOptions.improvements.slice(0, 3).map((imp) => (
                      <button
                        key={imp.id}
                        onClick={() => handleOpenDevProposal('improvement', imp)}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded transition-colors flex justify-between items-center px-3 gap-2"
                      >
                        <span className="min-w-0 break-words">{imp.name}</span>
                        <span className="text-blue-200 text-xs shrink-0 break-words">
                          {formatMoney(Math.round(property.currentPrice * imp.baseCostPercent))}
                        </span>
                      </button>
                    ))}
                    {devOptions.improvements.length > 3 && (
                      <button
                        onClick={() => navigate(`/development?tab=improvements&propertyId=${id}`)}
                        className="w-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-xs py-1.5 rounded transition-colors"
                      >
                        +{devOptions.improvements.length - 3} {t('common.more')}
                      </button>
                    )}
                  </div>
                )}
              {user &&
                hasManageAccess &&
                isCompanyOwned &&
                devOptions?.type === 'development' &&
                devOptions.upgrades.length > 0 && (
                  <div className="space-y-1">
                    {devOptions.upgrades
                      .filter((u) => u.cost > 0)
                      .slice(0, 3)
                      .map((upg) => (
                        <button
                          key={upg.type}
                          onClick={() => handleOpenDevProposal('upgrade', upg)}
                          className="w-full bg-purple-600 hover:bg-purple-500 text-white text-sm py-2 rounded transition-colors flex justify-between items-center px-3 gap-2"
                        >
                          <span className="min-w-0 break-words">
                            {upg.name} Lv.{upg.level}
                          </span>
                          <span className="text-purple-200 text-xs shrink-0 break-words">{formatMoney(upg.cost)}</span>
                        </button>
                      ))}
                  </div>
                )}
              {user && hasManageAccess && isCompanyOwned && devOptions?.type === 'construction' && (
                <div className="space-y-1">
                  {(showAllConstruction ? devOptions.options : devOptions.options.slice(0, 4)).map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => handleOpenDevProposal('construction', proj)}
                      className="w-full bg-green-600 hover:bg-green-500 text-white text-sm py-2 rounded transition-colors flex justify-between items-center px-3 gap-2"
                    >
                      <div className="flex flex-col items-start min-w-0">
                        <span className="break-words">{proj.name}</span>
                        <span className="text-green-200 text-xs">
                          {proj.unitsGenerated} {t('companyDevelopment.units')} · {proj.constructionPeriods}{' '}
                          {t('companyDevelopment.months') || 'mo'}
                        </span>
                      </div>
                      <span className="text-green-200 text-xs shrink-0 break-words">
                        {formatMoney(proj.estimatedCost || proj.baseCost || 0)}
                      </span>
                    </button>
                  ))}
                  {devOptions.options.length > 4 && (
                    <button
                      onClick={() => setShowAllConstruction(!showAllConstruction)}
                      className="text-xs text-gray-400 dark:text-gray-500 text-center w-full hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1"
                    >
                      {showAllConstruction
                        ? t('common.showLess')
                        : `+${devOptions.options.length - 4} ${t('common.more')}`}
                    </button>
                  )}
                </div>
              )}
              {user && hasManageAccess && improvementStatus && improvementStatus.activeImprovement && (
                <div className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm py-2 rounded text-center space-y-0.5">
                  <div className="font-medium">🔨 {t('development.improvementInProgress')}</div>
                  <div className="text-xs">
                    {improvementStatus.activeImprovement.name} —{' '}
                    {Math.round(improvementStatus.activeImprovement.progress || 0)}%
                    {improvementStatus.activeImprovement.completionPeriod &&
                      improvementStatus.currentPeriod != null && (
                        <span className="ml-1 text-gray-400 dark:text-gray-500">
                          (
                          {Math.max(
                            0,
                            improvementStatus.activeImprovement.completionPeriod - improvementStatus.currentPeriod,
                          )}{' '}
                          {t('development.periodsRemaining') || 'months left'})
                        </span>
                      )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {isCompanyOwned && devRequests.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 mt-4">
              <h2 className="text-lg font-bold mb-4">{t('companyDevelopment.pendingProposals')}</h2>
              <div className="space-y-3">
                {devRequests.map((dr) => {
                  const totalVoters = (owningCompany?.members?.length || 1) - 1;
                  const yesVotes = dr.votes?.filter((v) => v.vote === 'yes').length || 0;
                  const noVotes = dr.votes?.filter((v) => v.vote === 'no').length || 0;
                  const hasVoted = dr.votes?.some((v) => {
                    const uid = v.userId?._id || v.userId;
                    return uid?.toString() === user?._id?.toString();
                  });
                  const isProposer =
                    dr.requestedBy?._id?.toString?.() === user?._id?.toString() ||
                    dr.requestedBy?.toString?.() === user?._id?.toString();
                  const actionLabel =
                    dr.actionType === 'upgrade'
                      ? `Upgrade: ${devOptions?.upgrades?.find((u) => (u.type || u.id) === dr.actionData?.upgradeType)?.name || dr.actionData?.upgradeType}`
                      : dr.actionType === 'improvement'
                        ? `Improvement: ${devOptions?.improvements?.find((i) => i.id === dr.actionData?.improvementId)?.name || dr.actionData?.improvementId}`
                        : `Construction: ${devOptions?.options?.find((p) => p.id === dr.actionData?.projectType)?.name || dr.actionData?.projectType}`;

                  return (
                    <div
                      key={dr._id}
                      className={`border rounded-lg p-3 ${
                        dr.status === 'executed'
                          ? 'border-green-500/30 bg-green-50 dark:bg-green-900/10'
                          : dr.status === 'rejected' || dr.status === 'failed'
                            ? 'border-red-500/30 bg-red-50 dark:bg-red-900/10'
                            : 'border-purple-500/30 bg-purple-50 dark:bg-purple-900/10'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium text-sm text-gray-900 dark:text-white">{actionLabel}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatMoney(dr.estimatedCost)}
                            {dr.estimatedValueIncrease > 0 && (
                              <span className="ml-2 text-green-500">
                                +{formatMoney(dr.estimatedValueIncrease)} value
                              </span>
                            )}
                          </div>
                          {dr.actionType === 'construction' && dr.actionData?.projectType && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {(() => {
                                const proj = devOptions?.options?.find((p) => p.id === dr.actionData.projectType);
                                if (proj) {
                                  return `${proj.unitsGenerated || '—'} ${t('companyDevelopment.units')} · ${proj.constructionPeriods || '—'} ${t('companyDevelopment.months') || 'mo'}`;
                                }
                                return null;
                              })()}
                            </div>
                          )}
                          {dr.requestedBy && (
                            <div className="text-xs text-gray-400 mt-1">
                              {isProposer
                                ? t('companyDevelopment.proposedByYou')
                                : t('companyDevelopment.proposedBy', { name: dr.requestedBy.username || 'Unknown' })}
                            </div>
                          )}
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            dr.status === 'pending'
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                              : dr.status === 'executed'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          }`}
                        >
                          {t(`companyDevelopment.${dr.status}`)}
                        </span>
                      </div>

                      {dr.status === 'pending' && totalVoters > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <span>
                              {yesVotes}/{totalVoters} {t('companyDevelopment.yesVotes')}
                            </span>
                            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div
                                className="bg-green-500 h-1.5 rounded-full"
                                style={{ width: `${Math.min(100, (yesVotes / totalVoters) * 100)}%` }}
                              />
                            </div>
                          </div>
                          {!isProposer && !hasVoted && user && (
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => handleVoteDevRequest(dr._id, 'yes')}
                                className="flex-1 px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition-colors"
                              >
                                {t('companyDevelopment.approve')}
                              </button>
                              <button
                                onClick={() => handleVoteDevRequest(dr._id, 'no')}
                                className="flex-1 px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition-colors"
                              >
                                {t('companyDevelopment.reject')}
                              </button>
                            </div>
                          )}
                          {hasVoted && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {t('companyDevelopment.alreadyVoted')}
                            </div>
                          )}
                        </div>
                      )}
                      {dr.status === 'executed' && dr.actionType === 'construction' && dr.constructionProjectId && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <span>
                              {t('companyDevelopment.constructionProgress') || 'Construction'}:{' '}
                              {dr.constructionProjectId.progress || 0}%
                            </span>
                            {dr.constructionProjectId.completionPeriod &&
                              dr.constructionProjectId.startPeriod != null && (
                                <span className="text-gray-400 dark:text-gray-500">
                                  {Math.max(0, dr.constructionProjectId.completionPeriod - (currentPeriod || 0))}{' '}
                                  {t('companyDevelopment.months') || 'mo'} {t('development.left') || 'left'}
                                </span>
                              )}
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, dr.constructionProjectId.progress || 0)}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {dr.constructionProjectId.status === 'under_construction'
                              ? t('companyDevelopment.underConstruction') || 'Under Construction'
                              : dr.constructionProjectId.status === 'completed'
                                ? t('companyDevelopment.completed') || 'Completed'
                                : dr.constructionProjectId.status}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showDevModal && devModalData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-sm">
            <h3 className="text-gray-900 dark:text-white font-semibold mb-2">
              {t('companyDevelopment.confirmProposal')}
            </h3>
            <div className="space-y-2 mb-4 text-sm">
              <div className="text-gray-500 dark:text-gray-400">{t('companyDevelopment.property')}:</div>
              <div className="font-medium text-gray-900 dark:text-white">{property?.name}</div>
              <div className="text-gray-500 dark:text-gray-400">{t('companyDevelopment.action')}:</div>
              <div className="font-medium text-gray-900 dark:text-white">
                {devModalType === 'upgrade' && `${devModalData.name} (Level ${devModalData.level})`}
                {devModalType === 'improvement' && devModalData.name}
                {devModalType === 'construction' && devModalData.name}
              </div>
              <div className="text-gray-500 dark:text-gray-400">{t('companyDevelopment.cost')}:</div>
              <div className="font-medium text-orange-500 dark:text-orange-400">
                {formatMoney(
                  devModalType === 'upgrade'
                    ? devModalData.cost
                    : devModalType === 'improvement'
                      ? Math.round(property?.currentPrice * devModalData.baseCostPercent)
                      : devModalData.estimatedCost || devModalData.baseCost || 0,
                )}
              </div>
              {devModalData.rentIncrease != null && (
                <>
                  <div className="text-gray-500 dark:text-gray-400">
                    {t('companyDevelopment.estimatedRentIncrease')}:
                  </div>
                  <div className="font-medium text-green-500 dark:text-green-400">
                    +{formatMoney(devModalData.rentIncrease)}/mo
                  </div>
                </>
              )}
              {devModalData.projectedValue != null && (
                <>
                  <div className="text-gray-500 dark:text-gray-400">
                    {t('companyDevelopment.estimatedValueIncrease')}:
                  </div>
                  <div className="font-medium text-green-500 dark:text-green-400">
                    +{formatMoney(devModalData.projectedValue - (property?.currentPrice || 0))}
                  </div>
                </>
              )}
              {devModalType === 'construction' && devModalData.unitsGenerated && (
                <>
                  <div className="text-gray-500 dark:text-gray-400">{t('companyDevelopment.units')}:</div>
                  <div className="font-medium text-gray-900 dark:text-white">{devModalData.unitsGenerated}</div>
                  <div className="text-gray-500 dark:text-gray-400">{t('companyDevelopment.constructionTime')}:</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {devModalData.constructionPeriods} {t('development.periodsRemaining') || 'months'}
                  </div>
                </>
              )}
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {t('companyDevelopment.membersWillVote')}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateDevProposal}
                disabled={devLoading}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-200 dark:disabled:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                {devLoading ? t('common.loading') : t('companyDevelopment.submitProposal')}
              </button>
              <button
                onClick={() => setShowDevModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white text-sm rounded transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOfferModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-sm">
            <h3 className="text-gray-900 dark:text-white font-semibold mb-2">{t('propertyDetail.makeAnOffer')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('propertyDetail.marketValue')}: {formatMoney(property.currentPrice)}
              <br />
              {t('propertyDetail.minimumOffer')}: {formatMoney(Math.round(property.currentPrice * 0.7))} (70%)
            </p>
            <input
              type="number"
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              placeholder={t('propertyDetail.yourOfferAmount')}
              className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-gray-900 dark:text-white text-sm mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={handleMakeOffer}
                disabled={offerLoading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 dark:disabled:bg-gray-600 text-gray-900 dark:text-white text-sm rounded transition-colors"
              >
                {offerLoading ? t('propertyDetail.sending') : t('propertyDetail.sendOffer')}
              </button>
              <button
                onClick={() => setShowOfferModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white text-sm rounded transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGradeModal && gradeData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-sm">
            <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{t('propertyDetail.viewImprovements')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('propertyDetail.improvementsDescription')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/development')}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
              >
                {t('propertyDetail.goToDevelopment')}
              </button>
              <button
                onClick={() => setShowGradeModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white text-sm rounded transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
