import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useTheme } from './ThemeProvider';
import { useToast } from './Toast';
import UserSearch from './UserSearch';

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const unreadCount = useGameStore((s) => s.unreadCount);
  const fetchUnreadCount = useGameStore((s) => s.fetchUnreadCount);
  const fetchNotifications = useGameStore((s) => s.fetchNotifications);
  const { preference, setPreference } = useTheme();
  const { checkForNewNotifications } = useToast();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const hasUnread = unreadCount > 0;
  const bellClassName = useMemo(
    () =>
      `relative transition-colors ${hasUnread ? 'text-red-500 dark:text-red-400 animate-bell-ring' : 'text-muted hover:text-primary'}`,
    [hasUnread],
  );
  const avatarClassName = useMemo(
    () => `w-6 h-6 rounded-full object-cover ${hasUnread ? 'animate-avatar-pulse' : ''}`,
    [hasUnread],
  );
  const avatarFallbackClassName = useMemo(
    () =>
      `w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium ${hasUnread ? 'animate-avatar-pulse' : ''}`,
    [hasUnread],
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    if (user) {
      fetchUnreadCount();
      const poll = async () => {
        const count = await fetchUnreadCount();
        const notifications = await fetchNotifications();
        const latest = notifications?.length > 0 ? notifications[0] : null;
        checkForNewNotifications(count, latest);
      };
      poll();
      const interval = setInterval(poll, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') setUserMenuOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const handleLinkClick = () => {
    closeMobileMenu();
    setUserMenuOpen(false);
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'he' : 'en';
    i18n.changeLanguage(newLang);
    document.body.dir = newLang === 'he' ? 'rtl' : 'ltr';
    if (user) {
      fetch('/api/users/language', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ language: newLang }),
      }).catch(() => {});
    }
  };

  const cycleTheme = () => {
    const next = preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light';
    setPreference(next);
  };

  const themeIcon = preference === 'light' ? '\u2600\uFE0F' : preference === 'dark' ? '\uD83C\uDF19' : '\uD83D\uDD04';

  const navLinks = [
    { to: '/map', label: t('nav.map'), icon: '\uD83D\uDDFA\uFE0F', tour: 'map' },
    { to: '/marketplace', label: t('nav.market'), icon: '\uD83C\uDFEA', tour: 'marketplace' },
    { to: '/development', label: t('nav.development'), icon: '\uD83C\uDFD7\uFE0F', tour: 'development' },
    { to: '/bank', label: t('nav.bank'), icon: '\uD83C\uDFE6', tour: 'bank' },
    { to: '/dashboard', label: t('nav.portfolio'), icon: '\uD83D\uDCCA', tour: 'dashboard' },
  ];

  const userInitial = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  const avatarUrl = user?.avatar || null;

  return (
    <nav className="bg-card border-b border-border px-4 py-3 flex items-center justify-between relative z-50">
      <div className="flex items-center gap-6">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden text-xl text-secondary hover:text-primary transition-colors"
          aria-label="Toggle navigation menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={mobileMenuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}
            />
          </svg>
        </button>

        <Link to="/" onClick={closeMobileMenu} className="shrink-0 flex items-center">
          <img src="/images/logo-text.png" alt="CityFlow" className="h-25" />
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              data-tour={link.tour}
              onClick={handleLinkClick}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-secondary hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <span className="text-base">{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          ))}
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              onClick={handleLinkClick}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 dark:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <span className="text-base">{'\uD83D\uDEE0\uFE0F'}</span>
              <span>{t('nav.admin')}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user && <UserSearch />}

        <button
          onClick={toggleLanguage}
          className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-2 py-1 rounded text-secondary transition-colors"
        >
          {i18n.language === 'en' ? 'HE' : 'EN'}
        </button>

        <button
          onClick={cycleTheme}
          className="text-sm px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title={t('nav.theme')}
        >
          {themeIcon}
        </button>

        {user ? (
          <>
            <Link to="/notifications" className={bellClassName} title={t('nav.notifications')}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -end-1.5 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold animate-badge-pop">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>

            <button className="relative text-muted opacity-50 cursor-not-allowed" disabled title="Coming soon">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </button>

            <span className="text-sm text-green-600 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded">
              ${user.balance?.toLocaleString()}
            </span>

            {user?.level > 0 && (
              <span className="hidden sm:inline text-xs bg-blue-600/15 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">
                Lv.{user.level}
              </span>
            )}

            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-3 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="relative shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className={avatarClassName} />
                  ) : (
                    <div className={avatarFallbackClassName}>{userInitial}</div>
                  )}
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-card leading-none animate-badge-glow">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-sm text-secondary hidden sm:inline max-w-[100px] truncate">
                  {user.displayName || user.username}
                </span>
                <svg
                  className={`w-3 h-3 text-muted shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <div className="absolute end-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
                  <Link
                    to="/profile"
                    onClick={handleLinkClick}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-secondary hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-base">{'\uD83D\uDC64'}</span>
                    <span>{t('nav.myProfile')}</span>
                  </Link>
                  <Link
                    to="/friends"
                    onClick={handleLinkClick}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-secondary hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-base">{'\uD83D\uDC65'}</span>
                    <span>{t('nav.friends')}</span>
                  </Link>
                  <div className="border-t border-border my-1" />
                  <Link
                    to="/notifications"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-secondary hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-base">{'\uD83D\uDD14'}</span>
                    <span>{t('nav.notifications')}</span>
                    {unreadCount > 0 && (
                      <span className="ms-auto bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-base">{'\u2699\uFE0F'}</span>
                    <span>{t('nav.settings')}</span>
                  </Link>
                  <Link
                    to="/help"
                    onClick={(e) => {
                      e.preventDefault();
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted cursor-not-allowed transition-colors"
                  >
                    <span className="text-base">{'\u2753'}</span>
                    <span>{t('nav.help')}</span>
                    <span className="ms-auto text-[10px] text-muted">{t('common.soon')}</span>
                  </Link>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={() => {
                      handleLogout();
                      setUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-base">{'\uD83D\uDEAA'}</span>
                    <span>{t('nav.logout')}</span>
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Link
            to="/login"
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors"
          >
            {t('nav.login')}
          </Link>
        )}
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full inset-x-0 bg-card border-b border-border shadow-lg z-50">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                data-tour={link.tour}
                onClick={handleLinkClick}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-secondary hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
              >
                <span className="text-lg">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                onClick={handleLinkClick}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-purple-600 dark:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
              >
                <span className="text-lg">{'\uD83D\uDEE0\uFE0F'}</span>
                <span>{t('nav.admin')}</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
