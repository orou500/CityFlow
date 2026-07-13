import { useState, useEffect, useCallback, createContext, useContext, useRef, useMemo } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

const TYPE_STYLES = {
  friend_request: 'bg-blue-600',
  property_offer: 'bg-blue-600',
  offer_accepted: 'bg-green-600',
  offer_rejected: 'bg-red-600',
  offer_countered: 'bg-amber-600',
  offer_expired: 'bg-gray-600',
  construction_complete: 'bg-blue-600',
  system: 'bg-blue-600',
};

const TYPE_ICONS = {
  friend_request: '👤',
  property_offer: '🤝',
  offer_accepted: '✅',
  offer_rejected: '❌',
  offer_countered: '🔄',
  offer_expired: '⏰',
  construction_complete: '🏗️',
  system: '📄',
};

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const bgColor = TYPE_STYLES[toast.type] || 'bg-blue-600';
  const icon = TYPE_ICONS[toast.type] || '📄';

  return (
    <div
      className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 max-w-sm w-full animate-slide-in`}
      role="alert"
    >
      <span className="text-lg shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{toast.title}</p>
        <p className="text-xs opacity-90 mt-0.5 line-clamp-2">{toast.message}</p>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-white/70 hover:text-white shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const lastCountRef = useRef(0);
  const initializedRef = useRef(false);

  const addToast = useCallback((notification) => {
    const id = notification._id || Date.now().toString();
    setToasts((prev) => {
      if (prev.some((t) => t.id === id)) return prev;
      return [...prev, { id, ...notification }];
    });
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const checkForNewNotifications = useCallback(
    async (currentCount, latestNotification) => {
      if (!initializedRef.current) {
        lastCountRef.current = currentCount;
        initializedRef.current = true;
        return;
      }

      if (currentCount > lastCountRef.current && latestNotification && !latestNotification.read) {
        addToast(latestNotification);
      }

      lastCountRef.current = currentCount;
    },
    [addToast],
  );

  const contextValue = useMemo(
    () => ({ addToast, dismissToast, checkForNewNotifications }),
    [addToast, dismissToast, checkForNewNotifications],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onDismiss={dismissToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
