import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';

export default function ProjectDetailsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { fetchProjectDetail } = useGameStore();
  const { user } = useAuthStore();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchProjectDetail(id);
        setProject(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  if (error) {
    const isDenied = error === 'Not authorized';
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold mb-2">
          {isDenied ? t('projectDetail.accessDenied') : t('projectDetail.notFound')}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          {isDenied ? t('projectDetail.accessDeniedMsg') : t('projectDetail.notFoundMsg')}
        </p>
        <button
          onClick={() => navigate('/development')}
          className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500"
        >
          {t('projectDetail.backToDevelopment')}
        </button>
      </div>
    );
  }

  if (!project) return null;

  const progress = Math.min(100, Math.round(project.progress || 0));
  const remainingPeriods =
    project.completionPeriod && project.constructionPeriods
      ? Math.max(
          0,
          project.completionPeriod - project.startPeriod - Math.round((progress / 100) * project.constructionPeriods),
        )
      : project.completionPeriod && project.startPeriod
        ? Math.max(0, project.completionPeriod - project.startPeriod)
        : null;

  const statusConfig = {
    planning: {
      label: t('projectDetail.statusPlanned'),
      color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
    },
    under_construction: { label: t('projectDetail.statusUnderConstruction'), color: 'bg-yellow-900 text-yellow-300' },
    completed: { label: t('projectDetail.statusCompleted'), color: 'bg-green-900 text-green-300' },
    cancelled: { label: t('projectDetail.statusCancelled'), color: 'bg-red-900 text-red-300' },
  };

  const status = statusConfig[project.status] || statusConfig.planning;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl mx-auto w-full">
      <button
        onClick={() => navigate('/development')}
        className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 mb-4 inline-flex items-center gap-1 text-sm"
      >
        {t('projectDetail.backToDevelopment')}
      </button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.projectName}</h1>
        <span className={`px-3 py-1 rounded text-sm font-semibold w-fit ${status.color}`}>{status.label}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            {t('projectDetail.projectInfo')}
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400 text-sm">{t('projectDetail.projectType')}</span>
              <span className="text-gray-900 dark:text-white text-sm font-medium">
                {t(`development.proj.${project.projectType}.name`)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400 text-sm">{t('projectDetail.category')}</span>
              <span className="text-gray-900 dark:text-white text-sm font-medium">
                {t(`development.cat.${project.category}.label`)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400 text-sm">{t('projectDetail.location')}</span>
              <span className="text-gray-900 dark:text-white text-sm font-medium text-right">
                {[project.cityId?.name, project.cityId?.country].filter(Boolean).join(', ')}
              </span>
            </div>
            {project.landId?.location && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('projectDetail.district')}</span>
                <span className="text-gray-900 dark:text-white text-sm font-medium">{project.landId.location}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400 text-sm">{t('projectDetail.owner')}</span>
              <span className="text-gray-900 dark:text-white text-sm font-medium">
                {user?.displayName || user?.username}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            {t('development.progress')}
          </h2>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500 dark:text-gray-400">{t('development.progress')}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
            <div
              className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400 dark:text-gray-500">{t('development.started')}</p>
              <p className="text-gray-900 dark:text-white font-medium">
                {project.startPeriod ? `${t('general.period')} ${project.startPeriod}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 dark:text-gray-500">{t('development.estimatedCompletion')}</p>
              <p className="text-gray-900 dark:text-white font-medium">
                {project.completionPeriod ? `${t('general.period')} ${project.completionPeriod}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 dark:text-gray-500">{t('projectDetail.remainingPeriods')}</p>
              <p className="text-gray-900 dark:text-white font-medium">
                {remainingPeriods !== null ? `${remainingPeriods} ${t('general.periods')}` : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            {t('projectDetail.financials')}
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400 text-sm">{t('projectDetail.developmentCost')}</span>
              <span className="text-gray-900 dark:text-white text-sm font-medium">
                ${project.totalCost?.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400 text-sm">{t('projectDetail.investedAmount')}</span>
              <span className="text-gray-900 dark:text-white text-sm font-medium">
                ${(project.investedAmount || project.totalCost)?.toLocaleString()}
              </span>
            </div>
            {project.status === 'completed' && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 mt-3">
                <p className="text-green-600 dark:text-green-400 font-semibold text-sm mb-2">
                  {t('projectDetail.projectCompleted')}
                </p>
                {project.landId && (
                  <Link
                    to={`/property/${project.landId._id}`}
                    className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 text-sm font-medium"
                  >
                    {t('projectDetail.viewProperty')} &rarr;
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            {t('projectDetail.timeline')}
          </h2>
          <div className="space-y-4">
            {project.startPeriod && (
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 mt-1" />
                  <div className="w-0.5 h-full min-h-[2rem] bg-gray-300 dark:bg-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('general.period')} {project.startPeriod}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('projectDetail.projectStarted')}</p>
                </div>
              </div>
            )}
            {project.completionPeriod && (
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-3 h-3 rounded-full mt-1 ${project.status === 'completed' ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-500'}`}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('general.period')} {project.completionPeriod}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {project.status === 'completed'
                      ? t('projectDetail.finished')
                      : t('projectDetail.estimatedCompletion')}
                  </p>
                </div>
              </div>
            )}
            {!project.startPeriod && !project.completionPeriod && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('projectDetail.noTimeline')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
