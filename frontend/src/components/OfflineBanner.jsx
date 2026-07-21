import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { onNetworkChange, getNetworkStatus } from '../utils/network';
import { isNativePlatform } from '../utils/capacitor';

export default function OfflineBanner() {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState(true);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isNativePlatform()) return;

    setIsOnline(getNetworkStatus());
    const unsub = onNetworkChange((connected) => {
      setIsOnline(connected);
      if (!connected) setShow(true);
      if (connected) {
        setTimeout(() => setShow(false), 3000);
      }
    });
    return unsub;
  }, []);

  if (!isNativePlatform() || isOnline) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/95 p-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">
          <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.242 2.829a5 5 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">CityFlow</h2>
        <p className="text-gray-400 text-sm mb-6">
          {t('mobile.offlineMessage', 'CityFlow is currently unavailable. Please try again later.')}
        </p>
        <div className="flex justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}
