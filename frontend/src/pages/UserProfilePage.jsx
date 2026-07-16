import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { useGameStore } from '../store/useGameStore';
import { formatMoney } from '../utils/format';

function StatCard({ label, value, color }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center">
      <div className={`text-xl font-bold ${color || 'text-gray-900 dark:text-white'}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function getToken() {
  return useAuthStore.getState().token || localStorage.getItem('token');
}

export default function UserProfilePage() {
  const { t } = useTranslation();
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const token = getToken();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', portfolioVisible: true });
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [friendStatus, setFriendStatus] = useState(null);
  const [seasonHistory, setSeasonHistory] = useState([]);
  const [oauthStatus, setOauthStatus] = useState(null);
  const fileRef = useRef(null);

  const targetUsername = username || currentUser?.username;
  const isOwner = !username || (currentUser && targetUsername === currentUser.username);
  const { fetchPlayerSeasonHistory } = useGameStore();

  useEffect(() => {
    if (!targetUsername) return;
    fetch(`/api/users/${encodeURIComponent(targetUsername)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setProfile(data);
          setForm({
            displayName: data.user.displayName || '',
            bio: data.user.bio || '',
            portfolioVisible: data.user.profileVisibility?.portfolio !== false,
          });
          fetchPlayerSeasonHistory(data.user._id)
            .then(setSeasonHistory)
            .catch(() => {});
        }
      })
      .catch(() => setError('Failed to load profile'));

    if (currentUser && username && username !== currentUser.username) {
      fetch(`/api/friends/status/${encodeURIComponent(username)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => setFriendStatus(data.status))
        .catch(() => {});
    }
  }, [targetUsername, token, username, currentUser]);

  async function sendFriendRequest() {
    try {
      const res = await fetch(`/api/friends/request/${encodeURIComponent(targetUsername)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else setFriendStatus('sent');
    } catch {
      setMsg('Failed to send request');
    }
  }

  async function acceptFriendRequest() {
    if (!friendStatus?.requestId) return;
    try {
      const res = await fetch(`/api/friends/accept/${friendStatus.requestId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else setFriendStatus('friends');
    } catch {
      setMsg('Failed to accept');
    }
  }

  async function declineFriendRequest() {
    if (!friendStatus?.requestId) return;
    try {
      const res = await fetch(`/api/friends/decline/${friendStatus.requestId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else setFriendStatus('none');
    } catch {
      setMsg('Failed to decline');
    }
  }

  async function cancelFriendRequest() {
    if (!friendStatus?.requestId) return;
    try {
      const res = await fetch(`/api/friends/request/${friendStatus.requestId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else setFriendStatus('none');
    } catch {
      setMsg('Failed to cancel');
    }
  }

  useEffect(() => {
    if (!isOwner) return;
    fetch('/api/auth/oauth/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setOauthStatus)
      .catch(() => {});
  }, [isOwner, token]);

  async function handleUnlinkOAuth(provider) {
    if (!confirm(`Are you sure you want to unlink ${provider}?`)) return;
    try {
      const res = await fetch('/api/auth/oauth/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else {
        setOauthStatus((prev) => ({
          ...prev,
          providers: prev.providers.filter((p) => p !== provider),
        }));
        setMsg(`${provider} unlinked`);
      }
    } catch {
      setMsg('Failed to unlink OAuth provider');
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setMsg('');
    try {
      const res = await fetch('/api/users/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          displayName: form.displayName,
          bio: form.bio,
          profileVisibility: { portfolio: form.portfolioVisible },
        }),
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else {
        setProfile((p) => ({ ...p, user: data.user }));
        setEditing(false);
        setMsg('Settings saved');
      }
    } catch {
      setMsg('Failed to save');
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    setMsg('');
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setMsg('Passwords do not match');
      return;
    }
    try {
      const res = await fetch('/api/users/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: pwdForm.currentPassword, newPassword: pwdForm.newPassword }),
      });
      const data = await res.json();
      if (data.error) setMsg(data.error);
      else {
        setMsg('Password updated');
        setChangingPassword(false);
        setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch {
      setMsg('Failed to update password');
    }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const res = await fetch('/api/users/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (data.avatar) {
        setProfile((p) => ({ ...p, user: { ...p.user, avatar: data.avatar } }));
      }
    } catch {
      /* ignore */
    }
    setUploading(false);
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{error}</h2>
          <Link to="/" className="text-blue-600 dark:text-blue-400 hover:text-blue-300">
            {t('common.goHome')}
          </Link>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
      </div>
    );
  }

  const { user: profileUser, properties, portfolioValue, totalRent, netWorth } = profile;
  const joined = new Date(profileUser.joinedAt || profileUser.createdAt).toLocaleDateString();
  const displayName = profileUser.displayName || profileUser.username;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {msg && (
          <div
            className={`p-3 rounded text-sm ${msg === 'Settings saved' || msg === 'Password updated' ? 'bg-blue-900 text-blue-300' : 'bg-red-900 text-red-300'}`}
          >
            {msg}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="relative">
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center text-3xl">
                {profileUser.avatar ? (
                  <img src={profileUser.avatar} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">{displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              {isOwner && (
                <>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute bottom-0 end-0 bg-blue-600 hover:bg-blue-500 text-white text-xs w-7 h-7 rounded-full flex items-center justify-center"
                    disabled={uploading}
                  >
                    {uploading ? '...' : '✏'}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </>
              )}
            </div>
            <div className="text-center md:text-left flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{displayName}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">@{profileUser.username}</p>
              {profileUser.bio && (
                <p className="text-gray-600 dark:text-gray-300 mt-2 text-sm whitespace-pre-line">{profileUser.bio}</p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {t('profile.joined')} {joined}
              </p>
              {!isOwner && friendStatus && (
                <div className="mt-3">
                  {friendStatus === 'friends' && (
                    <span className="inline-block text-sm text-blue-600 dark:text-blue-400 font-medium">
                      ✅ {t('friends.friends')}
                    </span>
                  )}
                  {friendStatus === 'sent' && (
                    <div className="flex gap-2">
                      <span className="text-sm text-yellow-600 dark:text-yellow-400">
                        ⏳ {t('friends.requestSent')}
                      </span>
                      <button
                        onClick={cancelFriendRequest}
                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-300"
                      >
                        {t('friends.cancel')}
                      </button>
                    </div>
                  )}
                  {friendStatus === 'received' && (
                    <div className="flex gap-2">
                      <button
                        onClick={acceptFriendRequest}
                        className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors"
                      >
                        {t('friends.accept')}
                      </button>
                      <button
                        onClick={declineFriendRequest}
                        className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1 rounded transition-colors"
                      >
                        {t('friends.decline')}
                      </button>
                    </div>
                  )}
                  {friendStatus === 'none' && (
                    <button
                      onClick={sendFriendRequest}
                      className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded transition-colors"
                    >
                      ➕ {t('friends.addFriend')}
                    </button>
                  )}
                </div>
              )}
            </div>
            {isOwner && (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(!editing)}
                  className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {editing ? t('common.cancel') : t('profile.editProfile')}
                </button>
                <button
                  onClick={() => setChangingPassword(!changingPassword)}
                  className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {changingPassword ? t('common.cancel') : t('profile.changePassword')}
                </button>
              </div>
            )}
          </div>

          {editing && isOwner && (
            <form onSubmit={handleSave} className="mt-6 space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                  {t('profile.displayName')}
                </label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-gray-900 dark:text-white text-sm"
                  maxLength={50}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('profile.bio')}</label>
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-gray-900 dark:text-white text-sm h-24 resize-none"
                  maxLength={500}
                />
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{form.bio.length}/500</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="portfolioVis"
                  checked={form.portfolioVisible}
                  onChange={(e) => setForm({ ...form, portfolioVisible: e.target.checked })}
                  className="rounded bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                />
                <label htmlFor="portfolioVis" className="text-sm text-gray-600 dark:text-gray-300">
                  {t('profile.showPortfolio')}
                </label>
              </div>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-6 py-2 rounded-lg font-semibold transition-colors"
              >
                {t('common.save')}
              </button>
            </form>
          )}

          {changingPassword && isOwner && (
            <form
              onSubmit={handlePasswordChange}
              className="mt-6 space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6"
            >
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                  {t('profile.currentPassword')}
                </label>
                <input
                  type="password"
                  value={pwdForm.currentPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-gray-900 dark:text-white text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('profile.newPassword')}</label>
                <input
                  type="password"
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-gray-900 dark:text-white text-sm"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                  {t('profile.confirmPassword')}
                </label>
                <input
                  type="password"
                  value={pwdForm.confirmPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-gray-900 dark:text-white text-sm"
                  required
                />
              </div>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-6 py-2 rounded-lg font-semibold transition-colors"
              >
                {t('common.save')}
              </button>
            </form>
          )}

          {isOwner && oauthStatus?.providers && (
            <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                {t('profile.connectedAccounts')}
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    <span className="text-sm text-gray-900 dark:text-white">Google</span>
                  </div>
                  {oauthStatus.providers?.includes('google') ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-600 dark:text-green-400">{t('profile.linked')}</span>
                      {oauthStatus.hasPassword && (
                        <button
                          onClick={() => handleUnlinkOAuth('google')}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-500"
                        >
                          {t('profile.unlink')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <a href="/api/auth/google" className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500">
                      {t('profile.link')}
                    </a>
                  )}
                </div>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                    <span className="text-sm text-gray-900 dark:text-white">Discord</span>
                  </div>
                  {oauthStatus.providers?.includes('discord') ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-600 dark:text-green-400">{t('profile.linked')}</span>
                      {oauthStatus.hasPassword && (
                        <button
                          onClick={() => handleUnlinkOAuth('discord')}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-500"
                        >
                          {t('profile.unlink')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <a
                      href="/api/auth/discord"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500"
                    >
                      {t('profile.link')}
                    </a>
                  )}
                </div>
              </div>
              {!oauthStatus.hasPassword && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('profile.noPasswordWarning')}</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">Lv.{profileUser.level || 1}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {(profileUser.xp || 0).toLocaleString()} / {(profileUser.xpToNextLevel || 100).toLocaleString()} XP
              </span>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {Math.round(((profileUser.xp || 0) / (profileUser.xpToNextLevel || 100)) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(((profileUser.xp || 0) / (profileUser.xpToNextLevel || 100)) * 100, 100)}%` }}
            />
          </div>
          {profileUser.lifetimeStats && (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mt-4">
              {[
                { label: t('profile.transactions'), value: profileUser.lifetimeStats.totalTransactions || 0 },
                { label: t('profile.propertiesOwned'), value: profileUser.lifetimeStats.totalPropertiesOwned || 0 },
                {
                  label: t('profile.earned'),
                  value: formatMoney(profileUser.lifetimeStats.totalMoneyEarned || 0),
                },
                {
                  label: t('profile.spent'),
                  value: formatMoney(profileUser.lifetimeStats.totalMoneySpent || 0),
                },
                { label: t('profile.loans'), value: profileUser.lifetimeStats.totalLoansTaken || 0 },
                { label: t('profile.friendsAdded'), value: profileUser.lifetimeStats.totalFriendsAdded || 0 },
                { label: t('profile.upgrades'), value: profileUser.lifetimeStats.totalUpgrades || 0 },
                { label: t('profile.construction'), value: profileUser.lifetimeStats.totalConstructionStarted || 0 },
                { label: t('profile.seasons'), value: profileUser.lifetimeStats.totalSeasonsCompleted || 0 },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{s.value}</div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label={t('profile.netWorth')}
            value={formatMoney(netWorth || 0)}
            color="text-orange-500 dark:text-orange-400"
          />
          <StatCard
            label={t('profile.cash')}
            value={formatMoney(profileUser.balance || 0)}
            color="text-gray-900 dark:text-white"
          />
          <StatCard
            label={t('profile.properties')}
            value={(properties || []).length.toString()}
            color="text-blue-600 dark:text-blue-400"
          />
          <StatCard
            label={t('profile.rentalIncome')}
            value={formatMoney(totalRent || 0)}
            color="text-yellow-600 dark:text-yellow-400"
          />
        </div>

        {seasonHistory.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('profile.seasonHistory')}</h2>
              <Link to="/seasons" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                {t('profile.viewLeaderboard')} →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-xs">
                    <th className="text-left px-3 py-2">{t('seasons.seasonNumber', { number: '' }).trim()}</th>
                    <th className="text-left px-3 py-2">{t('profile.seasonRank')}</th>
                    <th className="text-left px-3 py-2">{t('seasons.netWorth')}</th>
                    <th className="text-left px-3 py-2">{t('seasons.portfolioValue')}</th>
                    <th className="text-left px-3 py-2">{t('seasons.properties')}</th>
                    <th className="text-left px-3 py-2">{t('profile.seasonPlayers')}</th>
                    <th className="text-left px-3 py-2">{t('seasons.months')}</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonHistory.map((s) => (
                    <tr key={s.seasonNumber} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">#{s.seasonNumber}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`font-semibold ${
                            s.rank === 1
                              ? 'text-yellow-500'
                              : s.rank === 2
                                ? 'text-gray-400'
                                : s.rank === 3
                                  ? 'text-amber-600'
                                  : 'text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {s.rank === 1 && '🥇 '}
                          {s.rank === 2 && '🥈 '}
                          {s.rank === 3 && '🥉 '}#{s.rank}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                        {formatMoney(s.netWorth || 0)}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {formatMoney(s.portfolioValue || 0)}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{s.propertiesOwned || 0}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {s.rank}/{s.totalPlayers}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{s.monthsPlayed || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {profileUser.achievements?.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('profile.achievements')}</h2>
            <div className="flex flex-wrap gap-2">
              {profileUser.achievements.map((a, i) => (
                <span
                  key={i}
                  className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm px-3 py-1 rounded-full"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {properties?.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('profile.portfolio')}</h2>
            <div className="grid gap-3">
              {properties.map((p) => (
                <Link
                  key={p._id}
                  to={`/property/${p._id}`}
                  className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 rounded-lg p-4 transition-colors"
                >
                  <div>
                    <div className="text-gray-900 dark:text-white font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {p.cityId?.name || ''} - {p.type}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-orange-500 dark:text-orange-400 text-sm font-semibold">
                      ${p.currentPrice?.toLocaleString()}
                    </div>
                    {p.rent > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ${p.rent}/{t('general.period')}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {profile.transactions?.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('profile.activity')}</h2>
            <div className="space-y-2">
              {profile.transactions.map((tx) => {
                const typeMap = {
                  buy: { label: t('profile.bought'), color: 'text-blue-600 dark:text-blue-400' },
                  sell: { label: t('profile.sold'), color: 'text-red-600 dark:text-red-400' },
                  rent: { label: t('profile.receivedRent'), color: 'text-green-600 dark:text-green-400' },
                  loan: { label: t('profile.loanTaken'), color: 'text-blue-600 dark:text-blue-400' },
                  loan_payment: { label: t('profile.loanPayment'), color: 'text-amber-600 dark:text-amber-400' },
                  loan_repay: { label: t('profile.loanRepaid'), color: 'text-green-600 dark:text-green-400' },
                  penalty: { label: t('profile.penalty'), color: 'text-red-600 dark:text-red-400' },
                  repossess: { label: t('profile.repossessed'), color: 'text-red-600 dark:text-red-400' },
                  construction: { label: t('profile.construction'), color: 'text-blue-600 dark:text-blue-400' },
                  upgrade: { label: t('profile.upgrade'), color: 'text-purple-600 dark:text-purple-400' },
                };
                const info = typeMap[tx.type] || { label: tx.type, color: 'text-gray-500' };
                return (
                  <div
                    key={tx._id}
                    className="flex justify-between items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600 dark:text-gray-300">{tx.propertyId?.name || '—'}</span>
                      <span className={`text-xs font-medium ${info.color}`}>{info.label}</span>
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs shrink-0">
                      ${tx.price?.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isOwner && (
          <div className="text-center mt-4">
            <Link to="/" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-300">
              {t('common.goHome')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
