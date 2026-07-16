import { useTranslation } from 'react-i18next';
import DiscordSettings from '../components/DiscordSettings';

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <DiscordSettings />
      </div>
    </div>
  );
}
