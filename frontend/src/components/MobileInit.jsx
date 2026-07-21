import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNativePlatform } from '../utils/capacitor';
import { setupDeepLinking, setNavigateFunction } from '../utils/deepLinks';
import {
  registerForPushNotifications,
  setupPushNotificationListeners,
} from '../utils/pushNotifications';
import {
  isBiometricEnabled,
  isBiometricAvailable,
  authenticateWithBiometric,
} from '../utils/biometric';
import { useAuthStore } from '../store/useAuthStore';

export default function MobileInit() {
  const navigate = useNavigate();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const user = useAuthStore((s) => s.user);
  const [biometricPending, setBiometricPending] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!isNativePlatform() || initialized.current) return;
    initialized.current = true;

    setNavigateFunction(navigate);
    setupDeepLinking();
    setupPushNotificationListeners(navigate);

    if (user) {
      registerForPushNotifications();
    }
  }, []);

  useEffect(() => {
    if (!isNativePlatform()) return;
    if (user) {
      registerForPushNotifications();
    }
  }, [user]);

  if (!isNativePlatform()) return null;
  if (biometricPending) {
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-5xl mb-4">
            <svg className="w-16 h-16 mx-auto text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-sm">Verifying identity...</p>
        </div>
      </div>
    );
  }

  return null;
}
