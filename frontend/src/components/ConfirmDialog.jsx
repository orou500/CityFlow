import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = true,
  loading = false,
}) {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const isRtl = i18n?.language?.toLowerCase().startsWith('he');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xl">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        {message && <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">{message}</p>}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-3 sm:py-2.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 text-gray-900 dark:text-white text-sm font-medium rounded-lg transition-colors"
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-3 sm:py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {loading ? t('common.loading') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
