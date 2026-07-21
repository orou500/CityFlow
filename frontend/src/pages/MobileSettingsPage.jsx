import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { isNativePlatform, saveSetting, loadSetting } from '../utils/capacitor';
import {
  isBiometricAvailable,
  getBiometricType,
  isBiometricEnabled,
  setBiometricEnabled,
} from '../utils/biometric';
import { useTheme } from '../components/ThemeProvider';
import {
  registerForPushNotifications,
  unregisterPushNotifications,
} from '../utils/pushNotifications';

export default function MobileSettingsPage() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [biometricAvail, setBiometricAvail] = useState(false);
  const [biometricType, setBiometricTypeState] = useState(null);
  const [biometricOn, setBiometricOn] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const push = await loadSetting('push_enabled', true);
    setPushEnabled(push);
    const saver = await loadSetting('data_saver', false);
    setDataSaver(saver);

    if (isNativePlatform()) {
      const avail = await isBiometricAvailable();
      setBiometricAvail(avail);
      if (avail) {
        const type = await getBiometricType();
        setBiometricTypeState(type);
        const enabled = await isBiometricEnabled();
        setBiometricOn(enabled);
      }
    }
  }

  async function togglePush() {
    const next = !pushEnabled;
    setPushEnabled(next);
    await saveSetting('push_enabled', next);
    if (next) {
      await registerForPushNotifications();
    } else {
      await unregisterPushNotifications();
    }
  }

  async function toggleBiometric() {
    const next = !biometricOn;
    setBiometricOn(next);
    await setBiometricEnabled(next);
  }

  async function toggleDataSaver() {
    const next = !dataSaver;
    setDataSaver(next);
    await saveSetting('data_saver', next);
  }

  const biometricLabel =
    biometricType === 'FaceID'
      ? 'Face ID'
      : biometricType === 'TouchID'
        ? 'Touch ID'
        : biometricType === 'Fingerprint'
          ? t('mobile.fingerprint', 'Fingerprint')
          : t('mobile.biometric', 'Biometric');

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('mobile.settings', 'Mobile Settings')}
        </h1>
        <Link to="/settings" className="text-sm text-blue-600 dark:text-blue-400">
          {t('settings.title', 'Settings')}
        </Link>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
        <div className="flex items-center justify-between p-4">
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {t('mobile.pushNotifications', 'Push Notifications')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('mobile.pushDesc', 'Receive alerts for rent, sales, auctions')}
            </div>
          </div>
          <button
            onClick={togglePush}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              pushEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                pushEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {isNativePlatform() && biometricAvail && (
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">{biometricLabel}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('mobile.biometricDesc', 'Quick login with biometrics')}
              </div>
            </div>
            <button
              onClick={toggleBiometric}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                biometricOn ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  biometricOn ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between p-4">
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {t('mobile.darkMode', 'Dark Mode')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('mobile.darkModeDesc', 'Switch between light and dark themes')}
            </div>
          </div>
          <div className="flex gap-1">
            {['light', 'dark', 'system'].map((mode) => (
              <button
                key={mode}
                onClick={() => setPreference(mode)}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  preference === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between p-4">
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {t('mobile.dataSaver', 'Data Saver')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('mobile.dataSaverDesc', 'Reduce data usage on mobile networks')}
            </div>
          </div>
          <button
            onClick={toggleDataSaver}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              dataSaver ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                dataSaver ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-400 dark:text-gray-500 text-center">
        CityFlow Mobile v1.0.0
      </div>
    </div>
  );
}
