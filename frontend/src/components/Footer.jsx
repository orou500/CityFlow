import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="py-6 px-4 border-t border-border mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="font-bold text-base">
          <span className="text-blue-600 dark:text-blue-400">City</span>
          <span className="text-orange-500 dark:text-orange-400">Flow</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
          <Link to="/terms" className="hover:text-primary transition-colors">
            {t('legal.termsTitle')}
          </Link>
          <Link to="/privacy" className="hover:text-primary transition-colors">
            {t('legal.privacyTitle')}
          </Link>
          <Link to="/cookies" className="hover:text-primary transition-colors">
            {t('legal.cookiesTitle')}
          </Link>
        </div>
        <div className="text-muted text-xs">&copy; {new Date().getFullYear()} CityFlow. All rights reserved.</div>
      </div>
    </footer>
  );
}
