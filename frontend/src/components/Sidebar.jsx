import { useEffect, useRef, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { useGameStore } from '../store/useGameStore';
import { useTheme } from './ThemeProvider';
import UserSearch from './UserSearch';

export default function Sidebar({ collapsed, onToggleCollapse }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const unreadCount = useGameStore((s) => s.unreadCount);
  const fetchUnreadCount = useGameStore((s) => s.fetchUnreadCount);
  const { preference, setPreference } = useTheme();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const hasUnread = unreadCount > 0;
  const avatarClassName = useMemo(
    () => `w-7 h-7 rounded-full object-cover ${hasUnread ? 'animate-avatar-pulse' : ''}`,
    [hasUnread],
  );
  const avatarFallbackClassName = useMemo(
    () =>
      `w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium ${hasUnread ? 'animate-avatar-pulse' : ''}`,
    [hasUnread],
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    if (user) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path) => {
    if (path === '/profile') {
      return location.pathname === '/profile' || location.pathname.startsWith('/profile/');
    }
    return location.pathname === path;
  };

  const mainLinks = [
    { to: '/map', icon: '\uD83D\uDDFA\uFE0F', label: t('nav.map'), tour: 'map' },
    { to: '/marketplace', icon: '\uD83C\uDFEA', label: t('nav.market'), tour: 'marketplace' },
    { to: '/development', icon: '\uD83C\uDFD7\uFE0F', label: t('nav.development'), tour: 'development' },
    { to: '/bank', icon: '\uD83C\uDFE6', label: t('nav.bank'), tour: 'bank' },
    { to: '/dashboard', icon: '\uD83D\uDCCA', label: t('nav.portfolio'), tour: 'dashboard' },
  ];

  const userMenuItems = [
    { to: '/profile', icon: '\uD83D\uDC64', label: t('nav.myProfile') },
    { to: '/friends', icon: '\uD83D\uDC65', label: t('nav.friends') },
    { to: '/notifications', icon: '\uD83D\uDD14', label: t('nav.notifications'), badge: unreadCount },
    { to: '/settings', icon: '\u2699\uFE0F', label: t('nav.settings'), disabled: true },
    { separator: true },
    { action: 'logout', icon: '\uD83D\uDEAA', label: t('nav.logout'), danger: true },
  ];

  const visibleLinks = user ? mainLinks : mainLinks.filter((l) => l.to === '/map');

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

  const themeIcon = preference === 'light' ? '\u2600\uFE0F' : preference === 'dark' ? '\uD83C\uDF19' : '\uD83D\uDD04';
  const langLabel = i18n.language === 'en' ? 'HE' : 'EN';
  const userInitial = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  const avatarUrl = user?.avatar || null;

  function linkClasses(active, opts = {}) {
    const base = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors';
    const state = active
      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
      : opts.disabled
        ? 'text-muted opacity-50 cursor-not-allowed'
        : 'text-secondary hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800';
    const justify = collapsed ? 'justify-center px-2' : '';
    return `${base} ${state} ${justify}`;
  }

  function renderNavLink(link, active, opts = {}) {
    return (
      <Link
        key={link.to}
        to={link.to}
        data-tour={link.tour}
        onClick={(e) => {
          if (opts.disabled) e.preventDefault();
        }}
        title={collapsed ? link.label : undefined}
        className={`${linkClasses(active, opts)} relative`}
      >
        <span className="text-lg shrink-0">{link.icon}</span>
        {!collapsed && <span>{link.label}</span>}
        {active && !collapsed && <span className="ml-auto w-1 h-4 rounded-full bg-blue-500 shrink-0" />}
      </Link>
    );
  }

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-30 p-2 rounded-md bg-card border border-border text-secondary hover:text-primary transition-colors"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-card border-r border-border transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div
          className={`flex items-center h-14 px-4 border-b border-border shrink-0 overflow-hidden ${collapsed ? '' : 'justify-center'}`}
        >
          <Link to="/" className={`flex items-center ${collapsed ? 'mx-auto' : ''}`}>
            <img
              src="/images/favicon.png"
              alt="CF"
              className={`h-8 w-8 object-contain transition-all duration-300 ${collapsed ? '' : 'hidden'}`}
            />
            <img
              src="/images/logo-text.png"
              alt="CityFlow"
              className={`h-25 object-contain transition-all duration-300 ${collapsed ? 'hidden' : ''}`}
            />
          </Link>
        </div>

        {!collapsed && user && (
          <div className="px-2 py-2 border-b border-border shrink-0">
            <UserSearch />
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {visibleLinks.map((link) => renderNavLink(link, isActive(link.to)))}

          {user?.role === 'admin' && (
            <Link
              to="/admin"
              title={collapsed ? t('nav.admin') : undefined}
              className={`${linkClasses(isActive('/admin'))} ${collapsed ? 'justify-center px-2' : ''}`}
            >
              <span className="text-lg shrink-0">{'\uD83D\uDEE0\uFE0F'}</span>
              {!collapsed && <span>{t('nav.admin')}</span>}
            </Link>
          )}
        </nav>

        <div className="border-t border-border pt-2 pb-2 px-2 space-y-1 shrink-0">
          {!user && location.pathname === '/' && (
            <div className="px-2 pb-1">
              <Link
                to="/login"
                className={`block text-center text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors ${collapsed ? 'w-8 h-8 flex items-center justify-center mx-auto' : ''}`}
                title={collapsed ? t('nav.login') : undefined}
              >
                {collapsed ? '\uD83D\uDD11' : t('nav.login')}
              </Link>
            </div>
          )}
          <div className={`flex ${collapsed ? 'flex-col' : 'flex-row'} gap-1 px-2 pt-1`}>
            <button
              onClick={toggleLanguage}
              className={`text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-secondary transition-colors shrink-0 ${collapsed ? 'w-8 h-8' : 'flex-1 py-1.5'}`}
            >
              {langLabel}
            </button>
            <button
              onClick={() =>
                setPreference(preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light')
              }
              className={`text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-secondary transition-colors shrink-0 ${collapsed ? 'w-8 h-8' : 'flex-1 py-1'}`}
              title={t('nav.theme')}
            >
              {themeIcon}
            </button>
          </div>
        </div>

        {user && (
          <div className="border-t border-border shrink-0 relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center justify-center w-full px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors relative"
            >
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className={avatarClassName} />
                ) : (
                  <div className={avatarFallbackClassName}>{userInitial}</div>
                )}
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-card leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              {!collapsed && (
                <>
                  <span className="ms-2.5 text-sm text-primary truncate">{user.displayName || user.username}</span>
                  <span className="text-xs text-green-600 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded ms-1">
                    ${user.balance?.toLocaleString()}
                  </span>
                  <svg
                    className={`absolute end-3 w-3 h-3 text-muted transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>

            {userMenuOpen && (
              <div
                className={`absolute bottom-full inset-x-0 mb-1 bg-card border border-border rounded-lg shadow-lg py-1 z-50 ${collapsed ? 'start-1/2 -translate-x-1/2 rtl:translate-x-1/2 w-48' : ''}`}
              >
                {userMenuItems.map((item, i) => {
                  if (item.separator) {
                    return <div key={`sep-${i}`} className="border-t border-border my-1" />;
                  }
                  if (item.action === 'logout') {
                    return (
                      <button
                        key="logout"
                        onClick={() => {
                          handleLogout();
                          setUserMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors`}
                      >
                        <span className="text-base shrink-0">{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={(e) => {
                        if (item.disabled) e.preventDefault();
                        setUserMenuOpen(false);
                      }}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${item.disabled ? 'text-muted opacity-50 cursor-not-allowed' : 'text-secondary hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                      <span className="text-base shrink-0">{item.icon}</span>
                      <span>{item.label}</span>
                      {item.badge > 0 && (
                        <span className="ml-auto bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-badge-glow">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center border-t border-border text-muted hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 text-xs h-8 gap-1.5"
          title={collapsed ? t('common.expandSidebar') || 'Expand' : t('common.collapseSidebar') || 'Collapse'}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {!collapsed && <span className="text-xs">{t('common.collapseSidebar') || 'Collapse'}</span>}
        </button>
      </aside>
    </>
  );
}
