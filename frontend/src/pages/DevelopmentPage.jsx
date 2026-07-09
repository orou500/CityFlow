import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { translateError } from '../i18n/errors';

export default function DevelopmentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const {
    myLand,
    fetchMyLand,
    myProjects,
    fetchMyProjects,
    myBuildings,
    fetchMyBuildings,
    developmentOptions,
    fetchDevelopmentOptions,
    estimateProject,
    startConstruction,
    upgradeBuilding,
    fetchUpgradeOptions,
    fetchUserData,
  } = useGameStore();

  const [tab, setTab] = useState('my-land');
  const [selectedLand, setSelectedLand] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [upgradeModal, setUpgradeModal] = useState(null);
  const [upgradeOptions, setUpgradeOptions] = useState(null);
  const [confirmUpgrade, setConfirmUpgrade] = useState(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetchMe();
    fetchMyLand();
    fetchMyProjects();
    fetchMyBuildings();
  }, []);

  async function handleSelectLand(land) {
    setSelectedLand(land);
    setSelectedProject(null);
    setEstimate(null);
    setError(null);
    try {
      await fetchDevelopmentOptions(land.cityId?._id || land.cityId, land.location);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSelectProject(project) {
    setSelectedProject(project);
    setEstimating(true);
    setError(null);
    try {
      const est = await estimateProject(selectedLand._id, project.id);
      setEstimate(est);
    } catch (e) {
      setError(e.message);
    }
    setEstimating(false);
  }

  async function handleStartConstruction() {
    if (!selectedLand || !selectedProject) return;
    setStarting(true);
    setError(null);
    try {
      await startConstruction(selectedLand._id, selectedProject.id);
      setSuccess(t('development.constructionStarted', { name: selectedProject.name }));
      setSelectedLand(null);
      setSelectedProject(null);
      setEstimate(null);
      fetchMe();
      fetchMyLand();
      fetchMyProjects();
      fetchUserData();
    } catch (e) {
      setError(e.message);
    }
    setStarting(false);
  }

  function calculateProgress(project) {
    const total = project.constructionPeriods || 1;
    const elapsed = project.progress || 0;
    return Math.min(100, Math.round(elapsed));
  }

  useEffect(() => {
    if (upgradeModal) {
      setUpgradeOptions(null);
      setConfirmUpgrade(null);
      fetchUpgradeOptions(upgradeModal)
        .then(setUpgradeOptions)
        .catch((e) => setError(e.message));
    }
  }, [upgradeModal]);

  async function handleUpgrade(propertyId, upgradeType) {
    setUpgrading(true);
    setError(null);
    try {
      await upgradeBuilding(propertyId, upgradeType);
      setSuccess(t('development.upgradeApplied'));
      setUpgradeModal(null);
      setUpgradeOptions(null);
      setConfirmUpgrade(null);
      fetchMyBuildings();
      fetchMe();
      fetchUserData();
    } catch (e) {
      setError(e.message);
    }
    setUpgrading(false);
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  const tabs = [
    { id: 'my-land', label: t('development.myLand') },
    { id: 'start', label: t('development.startDevelopment') },
    {
      id: 'projects',
      label: `${t('development.activeProjects')} (${myProjects.filter((p) => p.status === 'under_construction').length})`,
    },
    { id: 'buildings', label: `${t('development.myBuildings')} (${myBuildings.length})` },
  ];

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <h1 className="text-2xl font-bold mb-6">{t('development.title')}</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => {
              setTab(tabItem.id);
              setError(null);
              setSuccess(null);
            }}
            className={`px-4 py-2 rounded text-sm transition-colors ${
              tab === tabItem.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900 text-red-300 p-3 rounded mb-4 text-sm">
          {translateError(new Error(error), t)}
          <button onClick={() => setError(null)} className="ml-2">
            &times;
          </button>
        </div>
      )}
      {success && (
        <div className="bg-blue-900 text-blue-300 p-3 rounded mb-4 text-sm">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Tab: My Land */}
      {tab === 'my-land' && (
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">{t('development.landDescription')}</p>
          {myLand.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400 mb-4">{t('development.noLand')}</p>
              <button
                onClick={() => navigate('/marketplace?type=land')}
                className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded text-sm"
              >
                {t('development.browseLand')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myLand.map((land) => (
                <div
                  key={land._id}
                  className={`bg-white dark:bg-gray-900 rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedLand?._id === land._id
                      ? 'ring-2 ring-orange-500'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-850'
                  }`}
                  onClick={() => {
                    handleSelectLand(land);
                    setTab('start');
                  }}
                >
                  <h3 className="font-semibold text-gray-900 dark:text-white">{land.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {land.cityId?.name || t('development.unknown')} {land.location ? `- ${land.location}` : ''}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-400 dark:text-gray-500">{t('development.landSize')}</p>
                      <p className="text-gray-900 dark:text-white">
                        {land.size ? `${land.size.toLocaleString()} ${t('development.sqft')}` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 dark:text-gray-500">{t('development.value')}</p>
                      <p className="text-orange-500 dark:text-orange-400">${land.currentPrice?.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Start Development */}
      {tab === 'start' && (
        <div>
          {!selectedLand ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">{t('development.selectLand')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <div className="bg-white dark:bg-gray-900 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('development.selectedLand')}</h3>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{selectedLand.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {selectedLand.cityId?.name || t('development.unknown')}{' '}
                    {selectedLand.location ? `- ${selectedLand.location}` : ''}
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400 dark:text-gray-500">{t('development.sizeLabel')}</span>
                      <span>
                        {selectedLand.size ? `${selectedLand.size.toLocaleString()} ${t('development.sqft')}` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 dark:text-gray-500">{t('development.valueLabel')}</span>
              <span className="text-orange-500 dark:text-orange-400">
                ${selectedLand.currentPrice?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedLand(null);
                      setSelectedProject(null);
                      setEstimate(null);
                    }}
                    className="mt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    &larr; {t('development.changeLand')}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-2">
                {!selectedProject ? (
                  <div className="space-y-4">
                    {developmentOptions.map((cat) => (
                      <div key={cat.id} className="bg-white dark:bg-gray-900 rounded-lg p-4">
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-1">
                          {t(`development.cat.${cat.id}.label`, cat.label)}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                          {t(`development.cat.${cat.id}.description`, cat.description)}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {cat.projects.map((proj) => (
                            <div
                              key={proj.id}
                              className="bg-gray-50 dark:bg-gray-800 rounded p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                              onClick={() => handleSelectProject(proj)}
                            >
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {t(`development.proj.${proj.id}.name`, proj.name)}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {t(`development.proj.${proj.id}.description`, proj.description)}
                              </p>
                              <div className="mt-2 flex justify-between text-sm">
                                <span className="text-gray-400 dark:text-gray-500">
                                  {proj.constructionPeriods} {t('development.period')}
                                </span>
                              <span className="text-orange-500 dark:text-orange-400">
                                ~${proj.estimatedCost?.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        {t(`development.proj.${selectedProject.id}.name`, selectedProject.name)}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                        {t(`development.proj.${selectedProject.id}.description`, selectedProject.description)}
                      </p>

                      {estimating ? (
                        <p className="text-gray-500 dark:text-gray-400">{t('development.calculating')}</p>
                      ) : estimate ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('development.totalCost')}</p>
                              <p className="text-lg font-bold text-orange-500 dark:text-orange-400">
                                ${estimate.totalCost?.toLocaleString()}
                              </p>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t('development.constructionTime')}
                              </p>
                              <p className="text-lg font-bold text-gray-900 dark:text-white">
                                {estimate.constructionPeriods} {t('development.periods')}
                              </p>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('development.units')}</p>
                              <p className="text-lg font-bold text-gray-900 dark:text-white">
                                {estimate.unitsGenerated}
                              </p>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t('development.netIncome')}</p>
                              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                                ${estimate.estimatedNetIncome?.toLocaleString()}
                              </p>
                            </div>
                          </div>

                          <div className="bg-gray-50 dark:bg-gray-800 rounded p-4">
                            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                              {t('development.detailedBreakdown')}
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">{t('development.baseCost')}</span>
                                <span>${estimate.totalCost?.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">
                                  {t('development.estRentPerUnit')}
                                </span>
                                <span>${estimate.estimatedUnitRent?.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">
                                  {t('development.estGrossIncome')}
                                </span>
                              <span className="text-orange-500 dark:text-orange-400">
                                +${estimate.estimatedIncome?.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">
                                  {t('development.estMaintenance')}
                                </span>
                                <span className="text-red-600 dark:text-red-400">
                                  -${estimate.estimatedMaintenance?.toLocaleString()}
                                </span>
                              </div>
                              <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold">
                                <span className="text-gray-600 dark:text-gray-300">
                                  {t('development.netIncomeLabel')}
                                </span>
                                <span className="text-purple-600 dark:text-purple-400">
                                  ${estimate.estimatedNetIncome?.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <button
                              onClick={handleStartConstruction}
                              disabled={starting}
                              className="bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 dark:disabled:bg-gray-600 text-gray-900 dark:text-white px-6 py-2 rounded text-sm font-semibold transition-colors"
                            >
                              {starting
                                ? t('development.starting')
                                : t('development.startConstructionCost', {
                                    cost: estimate.totalCost?.toLocaleString(),
                                  })}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedProject(null);
                                setEstimate(null);
                              }}
                              className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-4 py-2 rounded text-sm transition-colors"
                            >
                              {t('development.backToProjects')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400">{t('development.calculating')}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Active Projects */}
      {tab === 'projects' && (
        <div>
          {myProjects.filter((p) => p.status === 'under_construction').length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">{t('development.noProjects')}</p>
              <button
                onClick={() => setTab('my-land')}
                className="mt-3 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded text-sm"
              >
                {t('development.startAQuote')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {myProjects
                .filter((p) => p.status === 'under_construction')
                .map((project) => {
                  const progress = calculateProgress(project);
                  return (
                    <div
                      key={project._id}
                      className="bg-white dark:bg-gray-900 rounded-lg p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-850 transition-colors"
                      onClick={() => navigate(`/project/${project._id}`)}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{project.projectName}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {project.landId?.name || t('development.landSize')}
                          </p>
                        </div>
                        <span className="bg-yellow-900 text-yellow-300 px-2 py-1 rounded text-xs font-semibold">
                          {t('development.underConstruction')}
                        </span>
                      </div>

                      <div className="mb-2">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500 dark:text-gray-400">{t('development.progress')}</span>
                          <span className="text-blue-600 dark:text-blue-400">{progress}%</span>
                        </div>
                        <div className="w-full bg-gray-50 dark:bg-gray-800 rounded-full h-2.5">
                          <div
                            className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm mt-3">
                        <div>
                          <p className="text-gray-400 dark:text-gray-500">{t('development.invested')}</p>
                          <p className="text-gray-900 dark:text-white">${project.totalCost?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 dark:text-gray-500">{t('development.started')}</p>
                          <p className="text-gray-900 dark:text-white">
                            {t('general.period')} {project.startPeriod}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400 dark:text-gray-500">{t('development.estimatedCompletion')}</p>
                          <p className="text-gray-900 dark:text-white">
                            {t('general.period')} {project.completionPeriod}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Tab: My Buildings */}
      {tab === 'buildings' && (
        <div>
          {myBuildings.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">{t('development.noBuildings')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myBuildings.map((b) => {
                const unitCount = b.units?.length || 0;
                const occupiedUnits = b.units?.filter((u) => u.occupied).length || 0;
                return (
                  <div
                    key={b._id}
                    className="bg-white dark:bg-gray-900 rounded-lg p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-850 transition-colors"
                    onClick={() => navigate(`/property/${b._id}`)}
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-white">{b.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {b.cityId?.name || t('development.unknown')}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                        <p className="text-gray-400 dark:text-gray-500 text-xs">{t('development.units')}</p>
                        <p className="text-gray-900 dark:text-white font-semibold">{unitCount}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                        <p className="text-gray-400 dark:text-gray-500 text-xs">{t('development.occupancy')}</p>
                        <p className="text-blue-600 dark:text-blue-400 font-semibold">
                          {occupiedUnits}/{unitCount}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                        <p className="text-gray-400 dark:text-gray-500 text-xs">{t('development.value')}</p>
                        <p className="text-gray-900 dark:text-white font-semibold">
                          ${b.currentPrice?.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                        <p className="text-gray-400 dark:text-gray-500 text-xs">{t('development.incomePerPeriod')}</p>
                        <p className="text-purple-600 dark:text-purple-400 font-semibold">
                          ${b.rent?.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setUpgradeModal(b._id);
                        }}
                        className="text-xs bg-orange-500 hover:bg-orange-400 text-white px-3 py-1 rounded transition-colors"
                      >
                        {t('development.upgrades')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Upgrade Modal */}
      {upgradeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          {confirmUpgrade ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-sm">
              <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{t('development.confirmUpgrade')}</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400 dark:text-gray-500">{t('development.currentValue')}</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    ${upgradeOptions.propertyValue?.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 dark:text-gray-500">{t('development.projectedValue')}</span>
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    ${confirmUpgrade.projectedValue?.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 dark:text-gray-500">{t('development.upgradeCost')}</span>
                  <span className="text-red-500 font-medium">-${confirmUpgrade.cost?.toLocaleString()}</span>
                </div>
                {confirmUpgrade.rentIncrease > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400 dark:text-gray-500">{t('development.expectedRentIncrease')}</span>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      +${confirmUpgrade.rentIncrease?.toLocaleString()}/{t('development.period')}
                    </span>
                  </div>
                )}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between font-semibold">
                  <span className="text-gray-400 dark:text-gray-500">{t('development.newBalance')}</span>
                  <span className="text-gray-900 dark:text-white">
                    ${(upgradeOptions.balance - confirmUpgrade.cost)?.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setConfirmUpgrade(null)}
                  className="flex-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white py-2 rounded text-sm transition-colors"
                >
                  {t('development.back')}
                </button>
                <button
                  onClick={() => handleUpgrade(upgradeModal, confirmUpgrade.type)}
                  disabled={upgrading}
                  className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-800 text-white py-2 rounded text-sm transition-colors"
                >
                  {upgrading ? t('development.processing') : t('development.confirm')}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-900 dark:text-white font-semibold">{t('development.buildingUpgrades')}</h3>
                <button
                  onClick={() => {
                    setUpgradeModal(null);
                    setUpgradeOptions(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
                >
                  &times;
                </button>
              </div>
              {upgradeOptions ? (
                <div className="space-y-3">
                  {upgradeOptions.upgrades.map((u) => {
                    const canAfford = u.cost <= upgradeOptions.balance;
                    return (
                      <div
                        key={u.type}
                        className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border ${
                          canAfford
                            ? 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer'
                            : 'border-gray-200 dark:border-gray-700 opacity-60'
                        } transition-colors`}
                        onClick={() => canAfford && setConfirmUpgrade(u)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">
                              {t(`development.${u.type}`)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {t(`development.${u.type}Desc`)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">
                              ${u.cost?.toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{t('development.costLabel')}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          {u.valueBoost > 0 && (
                            <span className="text-blue-600 dark:text-blue-400">
                              +{(u.valueBoost * 100).toFixed(0)}% {t('development.value')}
                            </span>
                          )}
                          {u.rentBoost > 0 && (
                            <span className="text-blue-600 dark:text-blue-400">
                              +{(u.rentBoost * 100).toFixed(0)}% {t('development.rent')}
                            </span>
                          )}
                          {u.conditionBoost > 0 && (
                            <span className="text-blue-500">
                              +{u.conditionBoost} {t('development.condition')}
                            </span>
                          )}
                          {u.unitBoost > 0 && (
                            <span className="text-blue-500">
                              +{(u.unitBoost * 100).toFixed(0)}% {t('development.units')}
                            </span>
                          )}
                          {u.riskReduction && <span className="text-purple-500">{t('development.reducedRisk')}</span>}
                        </div>
                        {!canAfford && (
                          <p className="mt-2 text-xs text-red-500">
                            {t('development.insufficientFunds')} — ${u.cost?.toLocaleString()}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">{t('common.loading')}</p>
                </div>
              )}
              {!confirmUpgrade && (
                <button
                  onClick={() => {
                    setUpgradeModal(null);
                    setUpgradeOptions(null);
                  }}
                  className="w-full mt-3 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white py-2 rounded text-sm transition-colors"
                >
                  {t('development.cancel')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
