import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from './ConfirmDialog';
import { formatMoney, formatCompact } from '../utils/format';
import { translateError } from '../i18n/errors';
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

/**
 * Property Demolition & Redevelopment panel.
 *
 * Renders one of three states from GET /properties/:id/redevelopment/status:
 *  - 'none'          → demolition quote + Demolish action (server-gated eligibility)
 *  - 'land'          → cleared land + rebuild projects (server-priced, tick-scheduled)
 *  - 'redeveloping'  → in-flight construction progress + scheduled completion tick
 *
 * The server is authoritative: costs/salvage/value always come from the status
 * route, never from this component. Mutations re-fetch status and notify the
 * parent to reload the property + player balance.
 */
export default function RedevelopmentPanel({ property, hasManageAccess, onMutated, currentPeriod }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const [demolishLoading, setDemolishLoading] = useState(false);
  const [confirmProject, setConfirmProject] = useState(null);
  const [redevelopLoading, setRedevelopLoading] = useState(false);

  const propertyId = property?._id;

  const loadStatus = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await api(`/properties/${propertyId}/redevelopment/status`);
      setStatus(res);
      setError(null);
    } catch (err) {
      setError(translateError(err, t));
    }
    setLoading(false);
  }, [propertyId, t]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleMutated = useCallback(async () => {
    await loadStatus();
    if (onMutated) await onMutated();
  }, [loadStatus, onMutated]);

  const handleDemolish = async () => {
    if (demolishLoading) return;
    setDemolishLoading(true);
    try {
      const res = await api(`/properties/${propertyId}/demolish`, { method: 'POST' });
      setActionMsg({ type: 'success', text: t('redevelopment.demolished') });
      setConfirmDemolish(false);
      setStatus({ ...status, ...res });
      await handleMutated();
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
    setDemolishLoading(false);
  };

  const handleRedevelop = async () => {
    if (redevelopLoading || !confirmProject) return;
    setRedevelopLoading(true);
    try {
      const res = await api(`/properties/${propertyId}/redevelop`, {
        method: 'POST',
        body: JSON.stringify({ projectType: confirmProject.id }),
      });
      setActionMsg({ type: 'success', text: t('redevelopment.started') });
      setConfirmProject(null);
      setStatus({ ...status, ...res, status: res.status || 'redeveloping' });
      await handleMutated();
    } catch (err) {
      setActionMsg({ type: 'error', text: translateError(err, t) });
    }
    setRedevelopLoading(false);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
        <p className="text-sm text-gray-400 dark:text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  if (error || !status) {
    return null;
  }

  const heading = (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-lg">🏗️</span>
      <h2 className="text-lg font-bold">{t('redevelopment.title')}</h2>
    </div>
  );

  const actionMessage = actionMsg && (
    <p className={`text-xs mb-3 ${actionMsg.type === 'success' ? 'text-blue-500' : 'text-red-500'}`}>
      {actionMsg.text}
    </p>
  );

  const demolishDialogBody =
    status.status === 'none' ? (
      <div className="space-y-3 text-sm">
        {property?.name ? (
          <p className="font-semibold text-gray-900 dark:text-white break-words">{property.name}</p>
        ) : null}

        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('redevelopment.landRemaining')}</p>
          {status.landSize != null && status.landSize > 0 ? (
            <p className="font-semibold text-gray-900 dark:text-white break-words">
              {t('redevelopment.availableArea')}: {formatCompact(status.landSize)} {t('development.sqft')}
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('redevelopment.landUnknown')}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.demolitionCost')}</p>
            <p className="font-semibold text-red-500 break-words">{formatMoney(status.demolitionCost)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.salvage')}</p>
            <p className="font-semibold text-green-600 dark:text-green-400 break-words">
              {formatMoney(status.demolitionSalvage)}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.netProceeds')}</p>
            <p
              className={`font-semibold break-words ${status.netProceeds >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}
            >
              {status.netProceeds >= 0 ? '+' : ''}
              {formatMoney(status.netProceeds)}
            </p>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6">
      {heading}
      {actionMessage}

      {status.status === 'none' && (
        <div className="space-y-3">
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('redevelopment.buildingValue')}</p>
            <p className="text-lg font-bold text-orange-500 dark:text-orange-400">
              {formatMoney(status.buildingValue)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.demolitionCost')}</p>
              <p className="font-semibold text-red-500">{formatMoney(status.demolitionCost)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.salvage')}</p>
              <p className="font-semibold text-green-600 dark:text-green-400">
                {formatMoney(status.demolitionSalvage)}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.netProceeds')}</p>
              <p
                className={`font-semibold ${status.netProceeds >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}
              >
                {status.netProceeds >= 0 ? '+' : ''}
                {formatMoney(status.netProceeds)}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('redevelopment.demolishNote')}</p>
          {status.eligibleForDemolition && hasManageAccess ? (
            <button
              onClick={() => setConfirmDemolish(true)}
              className="w-full bg-red-600 hover:bg-red-500 text-white text-sm py-2.5 rounded transition-colors"
            >
              {t('redevelopment.demolish')}
            </button>
          ) : (
            <p className="w-full text-center text-sm text-gray-400 dark:text-gray-500 py-2.5">
              {t('redevelopment.ineligible')}
            </p>
          )}
        </div>
      )}

      {status.status === 'land' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.landValue')}</p>
              <p className="font-semibold">{formatMoney(status.landValue)}</p>
            </div>
            {status.landSize > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.landSize')}</p>
                <p className="font-semibold">
                  {formatCompact(status.landSize)} {t('development.sqft')}
                </p>
              </div>
            )}
            {status.clearedAtTick != null && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded col-span-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.clearedAt')}</p>
                <p className="font-semibold">{t('propertyManagement.tick', { number: status.clearedAtTick })}</p>
              </div>
            )}
          </div>

          {hasManageAccess && (
            <>
              <p className="text-sm font-semibold">{t('redevelopment.chooseProject')}</p>
              <div className="space-y-2">
                {status.options.map((option) => (
                  <div
                    key={option.id}
                    className={`bg-gray-50 dark:bg-gray-800 p-3 rounded border ${
                      option.eligible
                        ? 'border-gray-200 dark:border-gray-700'
                        : 'border-red-300 dark:border-red-900/40 opacity-60'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{option.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {option.unitsGenerated} {t('companyDevelopment.units')} · {option.constructionPeriods}{' '}
                          {t('redevelopment.periods')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 capitalize">{option.category}</p>
                      </div>
                      <div className="text-end shrink-0">
                        <p className="text-sm font-semibold text-orange-500 dark:text-orange-400 break-words">
                          {formatMoney(option.estimatedCost)}
                        </p>
                        {option.eligible ? (
                          <button
                            onClick={() => setConfirmProject(option)}
                            className="mt-1 px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition-colors"
                          >
                            {t('redevelopment.rebuild')}
                          </button>
                        ) : (
                          <p className="mt-1 text-xs text-red-500">{t('redevelopment.tooSmall')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('redevelopment.redevelopNote')}</p>
            </>
          )}
        </div>
      )}

      {status.status === 'redeveloping' && (
        <div className="space-y-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4">
            <p className="font-semibold text-gray-900 dark:text-white">{status.projectName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('redevelopment.constructionCost')}: {formatMoney(status.constructionCost)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.remainingTicks')}</p>
              <p className="font-semibold text-blue-600 dark:text-blue-400">{status.remainingTicks}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('redevelopment.completesAt')}</p>
              <p className="font-semibold">{t('propertyManagement.tick', { number: status.completionTick })}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('redevelopment.progressNote')}</p>
        </div>
      )}

      <ConfirmDialog
        open={confirmDemolish}
        title={t('redevelopment.demolishConfirmTitle')}
        message={t('redevelopment.demolishConfirmMessage')}
        confirmLabel={t('redevelopment.demolishConfirmAction')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleDemolish}
        onCancel={() => setConfirmDemolish(false)}
        loading={demolishLoading}
      >
        {demolishDialogBody}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!confirmProject}
        title={t('redevelopment.rebuildConfirmTitle')}
        message={t('redevelopment.rebuildConfirmMessage', {
          name: confirmProject?.name,
          cost: formatMoney(confirmProject?.estimatedCost),
          periods: confirmProject?.constructionPeriods,
        })}
        confirmLabel={t('redevelopment.startRedevelop')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleRedevelop}
        onCancel={() => setConfirmProject(null)}
        loading={redevelopLoading}
      />
    </div>
  );
}
