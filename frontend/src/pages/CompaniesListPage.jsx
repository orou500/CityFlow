import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCompanyStore } from '../store/useCompanyStore';
import { useAuthStore } from '../store/useAuthStore';
import { useGameStore } from '../store/useGameStore';
import { formatMoney } from '../utils/format';

const CREATION_FEE = 5_000_000;
const MIN_NET_WORTH = 5_000_000;
const MIN_PORTFOLIO = 3_000_000;
const MIN_ACCOUNT_AGE_DAYS = 28;

function getRoleBadge(role, t) {
  const colors = {
    ceo: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    director: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    officer: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    member: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    recruit: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  };
  const label = t(`companies.role${role.charAt(0).toUpperCase() + role.slice(1)}`);
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] || colors.member}`}>
      {label}
    </span>
  );
}

export default function CompaniesListPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const {
    companies,
    companiesTotal,
    companiesPage,
    companiesTotalPages,
    myCompanies,
    invitations,
    loading,
    error,
    fetchCompanies,
    fetchMyCompanies,
    fetchInvitations,
    createCompany,
    acceptInvitation,
    declineInvitation,
  } = useCompanyStore();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('reputation');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const { userData, fetchUserData } = useGameStore();

  useEffect(() => {
    fetchCompanies({ sort });
    fetchMyCompanies();
    fetchInvitations();
    fetchUserData();
  }, [sort]);

  const portfolioValue = userData?.properties?.reduce((sum, p) => sum + (p.currentPrice || 0), 0) || 0;
  const netWorth = (userData?.user?.balance ?? user?.balance ?? 0) + portfolioValue;
  const accountAgeDays = user?.createdAt
    ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const handleCreate = async () => {
    setCreating(true);
    setCreateError('');
    try {
      await createCompany(newName, newDesc);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      await fetchMyCompanies();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleSearch = () => {
    fetchCompanies({ search, sort, page: 1 });
  };

  const handlePage = (page) => {
    fetchCompanies({ search, sort, page });
  };

  const handleAccept = async (companyId, invitationId) => {
    try {
      await acceptInvitation(companyId, invitationId);
      await fetchMyCompanies();
    } catch {}
  };

  const handleDecline = async (companyId, invitationId) => {
    try {
      await declineInvitation(companyId, invitationId);
    } catch {}
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{t('companies.title')}</h1>
        {user && !user.companyId && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs sm:text-sm font-medium transition-colors shrink-0"
          >
            {t('companies.createCompany')}
          </button>
        )}
      </div>

      {invitations.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-3">
            {t('companies.pendingInvitations')} ({invitations.length})
          </h3>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.company._id}
                className="flex items-center justify-between gap-2 bg-white dark:bg-gray-800 rounded-lg p-3"
              >
                <div className="min-w-0">
                  <span className="font-medium text-gray-900 dark:text-white truncate block">{inv.company.name}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {inv.company.memberCount} {t('companies.members')}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleAccept(inv.company._id, inv._id)}
                    className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    {t('common.accept')}
                  </button>
                  <button
                    onClick={() => handleDecline(inv.company._id, inv._id)}
                    className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    {t('common.decline')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {myCompanies.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">{t('companies.myCompany')}</h3>
          {myCompanies.map((c) => (
            <Link
              key={c._id}
              to={`/real-estate-companies/${c._id}`}
              className="flex items-center justify-between gap-2 bg-white dark:bg-gray-800 rounded-lg p-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm shrink-0">
                  {c.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="font-medium text-gray-900 dark:text-white truncate block">{c.name}</span>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    Level {c.level} · {c.reputation} {t('companies.reputation')}
                  </div>
                </div>
              </div>
              <div className="text-right text-sm shrink-0">
                <div className="text-gray-900 dark:text-white font-medium">{formatMoney(c.stats?.netWorth || 0)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {c.members?.length || 0}/{c.maxMembers} {t('companies.members')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">{t('companies.newCompany')}</h3>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('companies.namePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            maxLength={50}
          />
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder={t('companies.descPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            maxLength={500}
          />
          {createError && <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('companies.requirements')}</p>
            <RequirementItem met={(user?.balance || 0) >= CREATION_FEE} text={t('companies.reqFee')} />
            <RequirementItem met={(user?.level || 0) >= 15} text={t('companies.reqLevel', { min: 15 })} />
            <RequirementItem met={netWorth >= MIN_NET_WORTH} text={t('companies.reqNetWorth')} />
            <RequirementItem met={portfolioValue >= MIN_PORTFOLIO} text={t('companies.reqPortfolio')} />
            <RequirementItem met={accountAgeDays >= MIN_ACCOUNT_AGE_DAYS} text={t('companies.reqAccountAge')} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-green-700"
            >
              {creating ? t('common.loading') : t('common.confirm')}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={t('companies.searchPlaceholder')}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          {t('common.search')}
        </button>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
        >
          <option value="reputation">{t('companies.sortReputation')}</option>
          <option value="networth">{t('companies.sortNetWorth')}</option>
          <option value="members">{t('companies.sortMembers')}</option>
          <option value="properties">{t('companies.sortProperties')}</option>
          <option value="level">{t('companies.sortLevel')}</option>
          <option value="newest">{t('companies.sortNewest')}</option>
          <option value="name">{t('companies.sortName')}</option>
        </select>
      </div>

      {loading && <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('common.loading')}</div>}
      {error && <div className="text-center py-8 text-red-600 dark:text-red-400">{error}</div>}

      {!loading && companies.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-3">🏢</div>
          <p>{t('companies.noCompanies')}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {companies.map((company) => (
          <Link
            key={company._id}
            to={`/real-estate-companies/${company._id}`}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {company.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{company.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {company.description?.substring(0, 80)}
                    {company.description?.length > 80 ? '...' : ''}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatMoney(company.stats?.netWorth || 0)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('companies.netWorth')}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>⭐ {company.reputation}</span>
              <span>📊 Lvl {company.level}</span>
              <span>
                👥 {company.members?.length || 0}/{company.maxMembers}
              </span>
              <span>🏠 {company.stats?.propertiesOwned || 0}</span>
            </div>
          </Link>
        ))}
      </div>

      {companiesTotalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => handlePage(companiesPage - 1)}
            disabled={companiesPage <= 1}
            className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
          >
            {t('marketplace.previous')}
          </button>
          <span className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
            {companiesPage}/{companiesTotalPages}
          </span>
          <button
            onClick={() => handlePage(companiesPage + 1)}
            disabled={companiesPage >= companiesTotalPages}
            className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
          >
            {t('marketplace.next')}
          </button>
        </div>
      )}
    </div>
  );
}

function RequirementItem({ met, text }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={met ? 'text-green-500' : 'text-red-500'}>{met ? '✓' : '✗'}</span>
      <span className={met ? 'text-gray-600 dark:text-gray-400' : 'text-red-600 dark:text-red-400'}>{text}</span>
    </div>
  );
}
