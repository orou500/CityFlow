import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../utils/capacitor';
import { useAuthStore } from '../store/useAuthStore';
import {
  DEFAULT_COSMETICS,
  USERNAME_COLORS,
  PRESETS,
  OPTION_GROUPS,
  tierIndexFor,
  USERNAME_GRADIENT_CLASS,
  resolveOptionLabel,
  BADGES,
} from '../config/supporterCosmetics.js';
import UserIdentity from '../components/UserIdentity.jsx';
import SupporterTour from '../components/SupporterTour.jsx';

const API = getApiBaseUrl();

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const GRADIENT_CHIPS = [
  { id: 'none', type: 'none' },
  { id: 'cityflow_ocean', type: 'gradient' },
  { id: 'ocean_dream', type: 'gradient' },
  { id: 'sunset', type: 'gradient' },
  { id: 'royal', type: 'gradient' },
  { id: 'neon', type: 'gradient' },
  { id: 'empyrean', type: 'gradient' },
];

const EFFECT_CHIPS = [
  { id: 'none', minTier: 'supporter' },
  { id: 'soft_glow', minTier: 'supporter' },
  { id: 'glow', minTier: 'early_supporter' },
  { id: 'shimmer', minTier: 'early_supporter' },
  { id: 'pulse', minTier: 'early_supporter' },
  { id: 'gradient_flow', minTier: 'early_supporter' },
];

const BACKGROUND_CHIPS = [
  { id: 'none', minTier: 'supporter' },
  { id: 'midnight_city', minTier: 'supporter' },
  { id: 'blue_horizon', minTier: 'supporter' },
  { id: 'financial_district', minTier: 'supporter' },
  { id: 'neon_metro', minTier: 'early_supporter' },
  { id: 'sunset_skyline', minTier: 'early_supporter' },
  { id: 'ocean_city', minTier: 'early_supporter' },
  { id: 'corporate_black', minTier: 'early_supporter' },
  { id: 'global_empire', minTier: 'founding_supporter' },
  { id: 'golden_hour', minTier: 'founding_supporter' },
  { id: 'deep_space', minTier: 'founding_supporter' },
];

const BGFX_CHIPS = [
  { id: 'none', minTier: 'supporter' },
  { id: 'gradient', minTier: 'supporter' },
  { id: 'grid', minTier: 'supporter' },
  { id: 'glass', minTier: 'supporter' },
  { id: 'animated_gradient', minTier: 'early_supporter' },
  { id: 'city_lights', minTier: 'early_supporter' },
  { id: 'particles', minTier: 'early_supporter' },
  { id: 'skyline', minTier: 'early_supporter' },
  { id: 'light_streaks', minTier: 'founding_supporter' },
];

const BORDER_CHIPS = [
  { id: 'none', minTier: 'supporter' },
  { id: 'cityflow_blue', minTier: 'supporter' },
  { id: 'cyan', minTier: 'supporter' },
  { id: 'purple', minTier: 'early_supporter' },
  { id: 'gold', minTier: 'early_supporter' },
  { id: 'platinum', minTier: 'founding_supporter' },
  { id: 'animated_gradient', minTier: 'founding_supporter' },
];

const FRAME_CHIPS = [
  { id: 'none', minTier: 'supporter' },
  { id: 'blue_glow', minTier: 'supporter' },
  { id: 'cyan_ring', minTier: 'supporter' },
  { id: 'gold_ring', minTier: 'early_supporter' },
  { id: 'gradient_ring', minTier: 'early_supporter' },
  { id: 'animated_ring', minTier: 'early_supporter' },
  { id: 'premium_frame', minTier: 'founding_supporter' },
];

const BADGE_CHIPS = [
  { id: 'none', minTier: 'supporter' },
  { id: 'supporter', minTier: 'supporter' },
  { id: 'early_supporter', minTier: 'early_supporter' },
  { id: 'founding_supporter', minTier: 'founding_supporter' },
];

const TITLE_CHIPS = [
  { id: 'none', minTier: 'supporter' },
  { id: 'supporter', minTier: 'supporter' },
  { id: 'city_builder', minTier: 'supporter' },
  { id: 'urban_investor', minTier: 'early_supporter' },
  { id: 'empire_builder', minTier: 'early_supporter' },
  { id: 'global_developer', minTier: 'early_supporter' },
  { id: 'market_mogul', minTier: 'founding_supporter' },
  { id: 'cityflow_founder', minTier: 'founding_supporter' },
];

function LockTag({ label }) {
  return (
    <span className="text-[0.6em] font-semibold text-muted bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 ml-1">
      🔒 {label}
    </span>
  );
}

function Chip({ active, disabled, onClick, children, swatch }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : disabled
            ? 'opacity-40 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 cursor-not-allowed'
            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-secondary hover:border-blue-400'
      }`}
    >
      {swatch && (
        <span className={`inline-block w-3 h-3 rounded-full align-[-1px] mr-1.5 ${swatch}`} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

function restoreCosmeticsForTier(cosmetics, tierIndex) {
  const next = { ...cosmetics };
  const guard = (current, minTier) => (tierIndex < tierIndexFor(minTier) ? 'none' : current);
  next.usernameStyle = { ...(next.usernameStyle || DEFAULT_COSMETICS.usernameStyle) };
  if (tierIndex < 2) next.usernameStyle.animated = false;
  if (next.usernameStyle.type !== 'static' && tierIndex < 1) next.usernameStyle.type = 'static';
  next.usernameEffect = guard(next.usernameEffect, 'supporter');
  next.profileBackground = guard(next.profileBackground, 'supporter');
  next.profileBackgroundEffect = guard(next.profileBackgroundEffect, 'supporter');
  next.profileBorder = guard(next.profileBorder, 'supporter');
  next.avatarFrame = guard(next.avatarFrame, 'supporter');
  next.badge = guard(next.badge, 'supporter');
  next.title = guard(next.title, 'supporter');
  return next;
}

export default function SupporterStylePage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [identity, setIdentity] = useState(null);
  const [editable, setEditable] = useState(false);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [replayTour, setReplayTour] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api('/supporter-identity/me');
        const cos = { ...DEFAULT_COSMETICS, ...(res.identity?.cosmetics || {}) };
        setIdentity(res.identity);
        setEditable(!!res.editable);
        setDraft(cos);
      } catch {
        setMessage({ type: 'error', text: t('common.error') });
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  // One-time supporter tour: auto-opens when the server onboarding state is
  // 'pending' (armed only by a CONFIRMED donation). Completed/skipped states
  // are persisted server-side so it never re-appears on its own.
  useEffect(() => {
    if (!editable) return undefined;
    let cancelled = false;
    api('/supporter-identity/onboarding')
      .then((data) => {
        if (!cancelled && data.status === 'pending') setReplayTour(true);
      })
      .catch(() => {
        // best-effort — the tour is a guide, never a blocker
      });
    return () => {
      cancelled = true;
    };
  }, [editable]);

  const finishTour = async (action) => {
    setReplayTour(false);
    try {
      await api(`/supporter-identity/onboarding/${action}`, { method: 'POST' });
    } catch {
      // best-effort — state stays pending and is re-offered next visit
    }
  };

  const tierIndex = useMemo(() => (identity ? tierIndexFor(identity.tier) : 0), [identity]);

  const setField = (field, value) =>
    setDraft((d) => {
      const next = { ...d, [field]: value };
      return restoreCosmeticsForTier(next, tierIndex);
    });

  const setUsernameStyle = (patch) =>
    setDraft((d) => {
      const next = {
        ...d,
        usernameStyle: { ...(d.usernameStyle || DEFAULT_COSMETICS.usernameStyle), ...patch },
      };
      return restoreCosmeticsForTier(next, tierIndex);
    });

  const applyPreset = (presetId) => {
    const preset = PRESETS[presetId];
    if (!preset || tierIndex < preset.minTier) return;
    setDraft({ ...DEFAULT_COSMETICS, ...preset.options });
  };

  const handleSave = async () => {
    if (!editable) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api('/supporter-identity/me', {
        method: 'PUT',
        body: JSON.stringify({ cosmetics: draft }),
      });
      setIdentity(res.identity);
      setEditable(!!res.editable);
      setMessage({ type: 'success', text: t('supporterIdentity.saved') });
      fetchMe?.();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!editable) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api('/supporter-identity/me/reset', { method: 'POST' });
      setDraft({ ...DEFAULT_COSMETICS, ...(res.identity?.cosmetics || {}) });
      setIdentity(res.identity);
      setMessage({ type: 'success', text: t('supporterIdentity.resetDone') });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24 text-muted">{t('common.loading')}</div>;
  }

  const displayName = user?.displayName || user?.username || 'Player';
  const username = user?.username || 'player';
  const avatar = user?.avatar;

  // Build preview cosmetic style classes
  const previewCos = draft;
  const us = previewCos.usernameStyle || DEFAULT_COSMETICS.usernameStyle;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('supporterIdentity.pageTitle')}</h1>
            <p className="text-muted text-sm mt-1">{t('supporterIdentity.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {editable && (
              <button
                type="button"
                onClick={() => setReplayTour(true)}
                className="text-sm text-blue-500 hover:text-blue-400 transition-colors"
              >
                {t('supporterIdentity.tourReplay')}
              </button>
            )}
            <Link to="/donate" className="text-sm text-blue-500 hover:text-blue-400 transition-colors">
              {editable ? t('supporterIdentity.donateAgain') : t('supporterIdentity.learnSupport')}
            </Link>
          </div>
        </div>

        {/* What Supporter Style does */}
        <div className="bg-card border border-border rounded-xl p-5" data-testid="supporter-about">
          <h2 className="font-bold text-primary">{t('supporterIdentity.aboutTitle')}</h2>
          <p className="text-sm text-muted mt-1">{t('supporterIdentity.aboutDescription')}</p>
          <p className="text-xs font-semibold text-muted mt-4 mb-2">{t('supporterIdentity.aboutItems')}</p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-secondary list-disc ps-5">
            <li>{t('supporterIdentity.itemUsername')}</li>
            <li>{t('supporterIdentity.itemProfile')}</li>
            <li>{t('supporterIdentity.itemAvatar')}</li>
            <li>{t('supporterIdentity.itemIdentity')}</li>
          </ul>
          <div className="mt-4 rounded-lg border border-blue-600/30 bg-blue-600/10 px-4 py-3 text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
            <span aria-hidden="true">🎨</span>
            <p>{t('supporterIdentity.visualOnlyNote')}</p>
          </div>
        </div>

        {message && (
          <div
            className={`p-3 rounded text-sm ${
              message.type === 'success'
                ? 'bg-green-900/40 text-green-300 border border-green-800'
                : 'bg-red-900/40 text-red-300 border border-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {!editable && (
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="text-3xl" aria-hidden="true">
                🔒
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-primary">{t('supporterIdentity.lockedTitle')}</h2>
                <p className="text-sm text-muted mt-1">{t('supporterIdentity.lockedDescription')}</p>
              </div>
              <Link
                to="/donate"
                className="shrink-0 bg-yellow-500 hover:bg-yellow-600 text-yellow-950 dark:text-black font-semibold text-sm px-4 py-2 rounded-lg transition"
              >
                {t('supporterIdentity.donateCta')}
              </Link>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* LIVE PREVIEW — rendered with the SAME UserIdentity system as the
              profile page and leaderboards, so the preview always matches the
              real profile. */}
          <div className="bg-card border border-border rounded-xl p-5 order-1">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-4">
              {t('supporterIdentity.livePreview')}
            </h2>
            <UserIdentity
              username={username}
              displayName={displayName}
              avatar={avatar}
              cosmetics={previewCos}
              supporterBadge={previewCos.badge}
              title={previewCos.title}
              variant="card"
              avatarClass="w-16 h-16"
              avatarTextClass="text-xl"
              usernameClass="text-lg font-bold"
            />
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
              <span className="bg-white/40 dark:bg-white/10 rounded px-2 py-0.5">
                {t('supporterIdentity.tierLabel')}: {resolveOptionLabel(t, 'tier', identity?.tier || 'none', i18n)}
              </span>
              {identity?.supporterSince && (
                <span className="bg-white/40 dark:bg-white/10 rounded px-2 py-0.5">
                  {t('supporterIdentity.supporterSince')} {new Date(identity.supporterSince).toLocaleDateString()}
                </span>
              )}
            </div>

            {editable && (
              <div className="flex gap-2 mt-4">
                <button
                  id="si-tour-save"
                  data-tour-step="save"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
                >
                  {saving ? t('supporterIdentity.saving') : t('common.save')}
                </button>
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="px-4 bg-gray-100 dark:bg-gray-800 text-secondary font-medium py-2 rounded-lg transition disabled:opacity-50"
                >
                  {t('common.reset')}
                </button>
              </div>
            )}
          </div>

          {/* OPTIONS */}
          <div className="order-2 space-y-6">
            {editable && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
                  {t('supporterIdentity.presets')}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PRESETS).map(([id, preset]) => {
                    const locked = tierIndex < preset.minTier;
                    return (
                      <button
                        key={id}
                        onClick={() => applyPreset(id)}
                        disabled={locked}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          locked
                            ? 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                            : 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-gray-300 dark:border-gray-700 text-secondary hover:border-blue-400'
                        }`}
                      >
                        {resolveOptionLabel(t, 'preset', id, i18n)}
                        {locked && (
                          <LockTag
                            label={resolveOptionLabel(
                              t,
                              'tier',
                              preset.minTier < 2
                                ? 'supporter'
                                : preset.minTier < 3
                                  ? 'early_supporter'
                                  : 'founding_supporter',
                              i18n,
                            )}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <OptionGroup
              title={t('supporterIdentity.username')}
              editable={editable}
              lockedChildren={
                <>
                  {Object.entries(USERNAME_COLORS).map(([id, c]) => {
                    const minTier = OPTION_GROUPS.usernameColor[id];
                    return (
                      <Chip key={id} active={false} disabled={true}>
                        <span
                          className="inline-block w-3 h-3 rounded-full mr-1.5 align-[-1px]"
                          style={{ background: c.value }}
                        />
                        {resolveOptionLabel(t, 'color', id, i18n)}
                        {tierIndex < minTier && <LockTag label={lockTierLabel(tierIndex, minTier, t)} />}
                      </Chip>
                    );
                  })}
                </>
              }
            >
              <>
                <section id="si-tour-username" data-tour-step="username">
                  <h3 className="text-xs font-medium text-muted mb-2">{t('supporterIdentity.colorHeading')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(USERNAME_COLORS).map(([id, c]) => {
                      const minTier = OPTION_GROUPS.usernameColor[id];
                      const locked = tierIndex < minTier;
                      return (
                        <Chip
                          key={id}
                          active={us.type === 'static' && us.color === id}
                          disabled={locked}
                          onClick={() => !locked && setUsernameStyle({ type: 'static', color: id, animated: false })}
                          swatch={undefined}
                        >
                          <span
                            className="inline-block w-3 h-3 rounded-full mr-1.5 align-[-1px]"
                            style={{ background: c.value }}
                          />
                          {resolveOptionLabel(t, 'color', id, i18n)}
                          {locked && <LockTag label={lockTierLabel(tierIndex, minTier, t)} />}
                        </Chip>
                      );
                    })}
                  </div>
                </section>

                <section className="mt-4">
                  <h3 className="text-xs font-medium text-muted mb-2">{t('supporterIdentity.gradientHeading')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {GRADIENT_CHIPS.map((g) => {
                      if (g.type === 'none') {
                        const locked = false;
                        return (
                          <Chip
                            key={g.id}
                            active={us.type === 'static'}
                            disabled={locked}
                            onClick={() =>
                              !locked && setUsernameStyle({ type: 'static', color: us.color, animated: false })
                            }
                          >
                            {t('supporterIdentity.gradient.none')}
                          </Chip>
                        );
                      }
                      const locked = false;
                      return (
                        <Chip
                          key={g.id}
                          active={us.type !== 'static' && us.gradient === g.id}
                          disabled={locked}
                          onClick={() =>
                            !locked &&
                            setUsernameStyle({
                              type: 'gradient',
                              color: us.color || 'cityflow_blue',
                              gradient: g.id,
                              animated: false,
                            })
                          }
                        >
                          <span
                            className={`inline-block w-3 h-3 rounded-full mr-1.5 align-[-1px] ${USERNAME_GRADIENT_CLASS[g.id]}`}
                            aria-hidden="true"
                          />
                          {resolveOptionLabel(t, 'gradient', g.id, i18n)}
                        </Chip>
                      );
                    })}
                  </div>
                </section>

                <section className="mt-4">
                  <h3 className="text-xs font-medium text-muted mb-2">
                    {t('supporterIdentity.animation')}
                    {tierIndex < 2 && <LockTag label={t('supporterIdentity.tier.early_supporter')} />}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      active={!us.animated || us.type === 'static'}
                      disabled={false}
                      onClick={() =>
                        setUsernameStyle({ ...us, animated: false, type: us.type === 'static' ? 'static' : us.type })
                      }
                    >
                      {t('supporterIdentity.animationStatic')}
                    </Chip>
                    <Chip
                      active={!!us.animated && us.type !== 'static'}
                      disabled={tierIndex < 2}
                      onClick={() =>
                        tierIndex >= 2 &&
                        setUsernameStyle({ ...us, animated: true, type: us.type === 'static' ? 'gradient' : us.type })
                      }
                    >
                      {t('supporterIdentity.animationAnimated')}
                      {tierIndex < 2 && <LockTag label={t('supporterIdentity.tier.early_supporter')} />}
                    </Chip>
                  </div>
                </section>

                <section id="si-tour-avatar" data-tour-step="avatar" className="mt-4">
                  <h3 className="text-xs font-medium text-muted mb-2">{t('supporterIdentity.avatarFrameHeading')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {FRAME_CHIPS.map((f) => {
                      const locked = tierIndex < tierIndexFor(f.minTier);
                      return (
                        <Chip
                          key={f.id}
                          active={previewCos.avatarFrame === f.id}
                          disabled={locked}
                          onClick={() => !locked && setField('avatarFrame', f.id)}
                        >
                          {resolveOptionLabel(t, 'avatarFrame', f.id, i18n)}
                          {locked && <LockTag label={lockTierLabel(tierIndex, tierIndexFor(f.minTier), t)} />}
                        </Chip>
                      );
                    })}
                  </div>
                </section>

                <section className="mt-4">
                  <h3 className="text-xs font-medium text-muted mb-2">{t('supporterIdentity.usernameEffect')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {EFFECT_CHIPS.map((e) => {
                      const locked = tierIndex < tierIndexFor(e.minTier);
                      return (
                        <Chip
                          key={e.id}
                          active={previewCos.usernameEffect === e.id}
                          disabled={locked}
                          onClick={() => !locked && setField('usernameEffect', e.id)}
                        >
                          {resolveOptionLabel(t, 'effect', e.id, i18n)}
                          {locked && <LockTag label={lockTierLabel(tierIndex, tierIndexFor(e.minTier), t)} />}
                        </Chip>
                      );
                    })}
                  </div>
                </section>
              </>
            </OptionGroup>

            <OptionGroup title={t('supporterIdentity.profile')} editable={editable} lockedChildren={null}>
              <section id="si-tour-profile" data-tour-step="profile">
                <h3 className="text-xs font-medium text-muted mb-2">{t('supporterIdentity.profileBackground')}</h3>
                <div className="flex flex-wrap gap-2">
                  {BACKGROUND_CHIPS.map((b) => {
                    const locked = tierIndex < tierIndexFor(b.minTier);
                    return (
                      <Chip
                        key={b.id}
                        active={previewCos.profileBackground === b.id}
                        disabled={locked}
                        onClick={() => !locked && setField('profileBackground', b.id)}
                      >
                        {resolveOptionLabel(t, 'background', b.id, i18n)}
                        {locked && <LockTag label={lockTierLabel(tierIndex, tierIndexFor(b.minTier), t)} />}
                      </Chip>
                    );
                  })}
                </div>
              </section>

              <section className="mt-4">
                <h3 className="text-xs font-medium text-muted mb-2">
                  {t('supporterIdentity.backgroundEffectHeading')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {BGFX_CHIPS.map((b) => {
                    const locked = tierIndex < tierIndexFor(b.minTier);
                    return (
                      <Chip
                        key={b.id}
                        active={previewCos.profileBackgroundEffect === b.id}
                        disabled={locked}
                        onClick={() => !locked && setField('profileBackgroundEffect', b.id)}
                      >
                        {resolveOptionLabel(t, 'backgroundEffect', b.id, i18n)}
                        {locked && <LockTag label={lockTierLabel(tierIndex, tierIndexFor(b.minTier), t)} />}
                      </Chip>
                    );
                  })}
                </div>
              </section>

              <section className="mt-4">
                <h3 className="text-xs font-medium text-muted mb-2">{t('supporterIdentity.profileBorder')}</h3>
                <div className="flex flex-wrap gap-2">
                  {BORDER_CHIPS.map((b) => {
                    const locked = tierIndex < tierIndexFor(b.minTier);
                    return (
                      <Chip
                        key={b.id}
                        active={previewCos.profileBorder === b.id}
                        disabled={locked}
                        onClick={() => !locked && setField('profileBorder', b.id)}
                      >
                        {resolveOptionLabel(t, 'border', b.id, i18n)}
                        {locked && <LockTag label={lockTierLabel(tierIndex, tierIndexFor(b.minTier), t)} />}
                      </Chip>
                    );
                  })}
                </div>
              </section>
            </OptionGroup>

            <OptionGroup title={t('supporterIdentity.identity')} editable={editable} lockedChildren={null}>
              <section id="si-tour-identity" data-tour-step="identity">
                <h3 className="text-xs font-medium text-muted mb-2">{t('supporterIdentity.badgeHeading')}</h3>
                <div className="flex flex-wrap gap-2">
                  {BADGE_CHIPS.map((b) => {
                    const locked = tierIndex < tierIndexFor(b.minTier);
                    return (
                      <Chip
                        key={b.id}
                        active={previewCos.badge === b.id}
                        disabled={locked}
                        onClick={() => !locked && setField('badge', b.id)}
                      >
                        {b.id !== 'none' && <span className="mr-1">{BADGES[b.id]?.icon}</span>}
                        {resolveOptionLabel(t, 'badge', b.id, i18n)}
                        {locked && <LockTag label={lockTierLabel(tierIndex, tierIndexFor(b.minTier), t)} />}
                      </Chip>
                    );
                  })}
                </div>
              </section>

              <section className="mt-4">
                <h3 className="text-xs font-medium text-muted mb-2">{t('supporterIdentity.titleHeading')}</h3>
                <div className="flex flex-wrap gap-2">
                  {TITLE_CHIPS.map((ti) => {
                    const locked = tierIndex < tierIndexFor(ti.minTier);
                    return (
                      <Chip
                        key={ti.id}
                        active={previewCos.title === ti.id}
                        disabled={locked}
                        onClick={() => !locked && setField('title', ti.id)}
                      >
                        {resolveOptionLabel(t, 'title', ti.id, i18n)}
                        {locked && <LockTag label={lockTierLabel(tierIndex, tierIndexFor(ti.minTier), t)} />}
                      </Chip>
                    );
                  })}
                </div>
              </section>
            </OptionGroup>
          </div>
        </div>
      </div>
      <SupporterTour
        open={replayTour && editable}
        onDone={() => finishTour('complete')}
        onSkip={() => finishTour('skip')}
      />
    </div>
  );
}

function OptionGroup({ title, editable, children, lockedChildren }) {
  const { t } = useTranslation();
  if (!editable) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">{title}</h2>
          <span className="text-xs text-muted">🔒 {t('supporterIdentity.locked')}</span>
        </div>
        {/* Drives "locked items are visible" - show dimmed options when not editable */}
        {lockedChildren ? <div className="opacity-60">{lockedChildren}</div> : null}
      </div>
    );
  }
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

function lockTierLabel(tierIndex, minTierIndex, t) {
  if (minTierIndex >= 3) return t('supporterIdentity.tier.founding_supporter');
  if (minTierIndex >= 2) return t('supporterIdentity.tier.early_supporter');
  return t('supporterIdentity.tier.supporter');
}
