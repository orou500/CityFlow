import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { getApiBaseUrl } from '../utils/capacitor';

function getToken() {
  return useAuthStore.getState().token || localStorage.getItem('token');
}

export default function UserSearch() {
  const { t } = useTranslation();
  const API = getApiBaseUrl();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleChange(value) {
    setQuery(value);
    if (value.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    try {
      const tok = getToken();
      if (!tok) return;
      const res = await fetch(`${API}/users/search?q=${encodeURIComponent(value)}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      setResults(data);
      setOpen(true);
    } catch (e) {
      console.error('search error:', e);
      setResults([]);
    }
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t('nav.searchPlayers')}
        className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs px-2 py-1.5 w-28 text-gray-600 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-gray-400 dark:focus:border-gray-500"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
          {results.map((u) => (
            <Link
              key={u._id}
              to={`/profile/${u.username}`}
              onClick={() => {
                setOpen(false);
                setQuery('');
              }}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                {(u.displayName || u.username).charAt(0).toUpperCase()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
                {u.displayName || u.username}
                {u.displayName && <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">@{u.username}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
