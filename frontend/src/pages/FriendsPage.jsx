import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';

function getToken() {
  return useAuthStore.getState().token || localStorage.getItem('token');
}

export default function FriendsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [sent, setSent] = useState([]);
  const [tab, setTab] = useState('friends');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchFriends = useCallback(async () => {
    const tok = getToken();
    if (!tok) return;
    try {
      const res = await fetch('/api/friends', { headers: { Authorization: `Bearer ${tok}` } });
      const data = await res.json();
      if (data.error) { setMsg(data.error); return; }
      setFriends(data);
    } catch (e) { console.error('fetchFriends error:', e); setMsg('Failed to load friends'); }
  }, []);

  const fetchRequests = useCallback(async () => {
    const tok = getToken();
    if (!tok) return;
    try {
      const res = await fetch('/api/friends/requests', { headers: { Authorization: `Bearer ${tok}` } });
      const data = await res.json();
      if (data.error) { setMsg(data.error); return; }
      setIncoming(data.incoming || []);
      setSent(data.sent || []);
    } catch (e) { console.error('fetchRequests error:', e); setMsg('Failed to load requests'); }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMsg('');
    await Promise.all([fetchFriends(), fetchRequests()]);
    setLoading(false);
  }, [fetchFriends, fetchRequests]);

  useEffect(() => { loadAll(); }, [loadAll, location.key]);

  async function acceptRequest(requestId) {
    const tok = getToken();
    try {
      const res = await fetch(`/api/friends/accept/${requestId}`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else loadAll();
    } catch (e) { console.error('accept error:', e); setMsg('Failed to accept'); }
  }

  async function declineRequest(requestId) {
    const tok = getToken();
    try {
      const res = await fetch(`/api/friends/decline/${requestId}`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else loadAll();
    } catch (e) { console.error('decline error:', e); setMsg('Failed to decline'); }
  }

  async function cancelRequest(requestId) {
    const tok = getToken();
    try {
      const res = await fetch(`/api/friends/request/${requestId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else loadAll();
    } catch (e) { console.error('cancel error:', e); setMsg('Failed to cancel'); }
  }

  async function removeFriend(friendId) {
    const tok = getToken();
    try {
      const res = await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else fetchFriends();
    } catch (e) { console.error('remove error:', e); setMsg('Failed to remove friend'); }
  }

  function FriendCard({ friend, showRemove }) {
    return (
      <div className="bg-gray-50/50 dark:bg-gray-800/50 rounded-lg border border-gray-200/50 dark:border-gray-700/50 p-4 flex items-center justify-between">
        <Link to={`/profile/${friend.username}`} className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
            {(friend.displayName || friend.username).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-gray-900 dark:text-white text-sm font-medium truncate">{friend.displayName || friend.username}</div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400">${(friend.netWorth || 0).toLocaleString()}</div>
          </div>
        </Link>
        {showRemove && (
          <button onClick={() => removeFriend(friend._id)} className="text-xs text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 ml-2 flex-shrink-0">
            {t('friends.remove')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('friends.title')}</h1>

        {msg && (
          <div className="bg-red-900 text-red-600 dark:text-red-300 p-3 rounded text-sm">{msg}</div>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" />
          </div>
        )}

        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
          {['friends', 'incoming', 'sent'].map((key) => {
            const count = key === 'friends' ? friends.length : key === 'incoming' ? incoming.length : sent.length;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`text-sm px-4 py-2 rounded-t transition-colors ${tab === key ? 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border-b-2 border-emerald-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
              >
                {t(`friends.tab.${key}`)} {count > 0 && <span className="text-gray-400 dark:text-gray-500">({count})</span>}
              </button>
            );
          })}
        </div>

        {tab === 'friends' && (
          <div className="space-y-3">
            {friends.length === 0 && <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">{t('friends.noFriends')}</p>}
            {friends.map((f) => (
              <FriendCard key={f._id} friend={f} showRemove />
            ))}
          </div>
        )}

        {tab === 'incoming' && (
          <div className="space-y-3">
            {incoming.length === 0 && <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">{t('friends.noIncoming')}</p>}
            {incoming.map((r) => (
              <div key={r._id} className="bg-gray-50/50 dark:bg-gray-800/50 rounded-lg border border-gray-200/50 dark:border-gray-700/50 p-4 flex items-center justify-between">
                <Link to={`/profile/${r.senderId.username}`} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    {(r.senderId.displayName || r.senderId.username).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-gray-900 dark:text-white text-sm font-medium">{r.senderId.displayName || r.senderId.username}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{t('friends.sentYouRequest')}</div>
                  </div>
                </Link>
                <div className="flex gap-2">
                  <button onClick={() => acceptRequest(r._id)} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded transition-colors">
                    {t('friends.accept')}
                  </button>
                  <button onClick={() => declineRequest(r._id)} className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded transition-colors">
                    {t('friends.decline')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'sent' && (
          <div className="space-y-3">
            {sent.length === 0 && <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">{t('friends.noSent')}</p>}
            {sent.map((r) => (
              <div key={r._id} className="bg-gray-50/50 dark:bg-gray-800/50 rounded-lg border border-gray-200/50 dark:border-gray-700/50 p-4 flex items-center justify-between">
                <Link to={`/profile/${r.receiverId.username}`} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    {(r.receiverId.displayName || r.receiverId.username).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-gray-900 dark:text-white text-sm font-medium">{r.receiverId.displayName || r.receiverId.username}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{t('friends.pending')}</div>
                  </div>
                </Link>
                <button onClick={() => cancelRequest(r._id)} className="text-xs text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300">
                  {t('friends.cancel')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
