const AdminModal = ({ title, onClose, children, className = '', panelClassName = '' }) => (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto flex flex-col ${
        panelClassName || 'p-4 sm:p-6'
      } ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {title && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <h3 className="text-gray-900 dark:text-white font-semibold">{title}</h3>
          <button
            type="button"
            aria-label="close"
            onClick={onClose}
            className="shrink-0 p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {children}
    </div>
  </div>
);

export default AdminModal;
