import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../components/ThemeProvider';
import Footer from '../components/Footer';

function AnimatedCounter({ target, suffix = '' }) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);
  const counted = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !counted.current) {
          counted.current = true;
          const duration = 1500;
          const steps = 30;
          const increment = target / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              setValue(target);
              clearInterval(timer);
            } else {
              setValue(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.3 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref}>
      {value.toLocaleString()}
      {suffix}
    </span>
  );
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="bg-card rounded-xl p-6 border border-border hover:border-emerald-500/30 transition-all hover:-translate-y-1">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-primary font-bold mb-2">{title}</h3>
      <p className="text-secondary text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function SectionHeading({ title, description }) {
  return (
    <div className="mb-16 text-center">
      <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">{title}</h2>
      {description && <p className="text-secondary max-w-xl mx-auto">{description}</p>}
    </div>
  );
}

function HeroGradient({ resolved }) {
  const isDark = resolved === 'dark';
  return (
    <div
      className="absolute inset-0 transition-all duration-500"
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #064e3b, #020617, #020617)'
          : 'linear-gradient(135deg, #ecfdf5, #ffffff, #f0fdf4)',
      }}
    />
  );
}

function HeroOverlay({ resolved }) {
  const isDark = resolved === 'dark';
  return (
    <div
      className="absolute inset-0 transition-all duration-500"
      style={{
        background: isDark
          ? 'linear-gradient(to top, #020617, transparent, transparent)'
          : 'linear-gradient(to top, #ffffff, transparent, transparent)',
      }}
    />
  );
}

function DotGrid({ resolved }) {
  const isDark = resolved === 'dark';
  return (
    <div
      className="absolute inset-0 transition-all duration-500"
      style={{
        opacity: isDark ? 0.03 : 0.04,
        backgroundImage: `radial-gradient(circle at 25% 25%, ${isDark ? '#fff' : '#0f172a'} 1px, transparent 1px), radial-gradient(circle at 75% 75%, ${isDark ? '#fff' : '#0f172a'} 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }}
    />
  );
}

function CtaGradient({ resolved }) {
  const isDark = resolved === 'dark';
  return (
    <div
      className="absolute inset-0 transition-all duration-500"
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #064e3b, #020617, #020617)'
          : 'linear-gradient(135deg, #ecfdf5, #ffffff, #f0fdf4)',
      }}
    />
  );
}

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const { resolved } = useTheme();
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activity, setActivity] = useState([]);
  const isRtl = i18n.language === 'he';

  useEffect(() => {
    if (!loading && user) {
      navigate('/map', { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setLeaderboard(data.topPlayers || []);
        setActivity(data.recentActivity || []);
      })
      .catch(() => {});
  }, []);

  function formatActivity(tx) {
    const buyer = tx.buyerId?.displayName || tx.buyerId?.username || 'Someone';
    const seller = tx.sellerId?.displayName || tx.sellerId?.username || 'Someone';
    const property = tx.propertyId?.name || 'a property';
    const amount = tx.price?.toLocaleString();

    switch (tx.type) {
      case 'buy':
        return t('landing.activity.buy', { buyer, property, amount });
      case 'sell':
        return t('landing.activity.sell', { seller, property, amount });
      case 'construction':
        return t('landing.activity.construction', { buyer, property });
      case 'upgrade':
        return t('landing.activity.upgrade', { buyer, property });
      default:
        return t('landing.activity.default', { property, amount });
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-surface transition-colors duration-300" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <HeroGradient resolved={resolved} />
        <DotGrid resolved={resolved} />
        <HeroOverlay resolved={resolved} />
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <div className="text-6xl mb-6">🌍</div>
          <h1 className="text-4xl md:text-6xl font-bold text-primary mb-6 leading-tight">{t('landing.hero.title')}</h1>
          <p className="text-lg md:text-xl text-secondary mb-8 max-w-2xl mx-auto leading-relaxed">
            {t('landing.hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-lg px-8 py-3 rounded-lg font-bold transition-all hover:-translate-y-0.5 shadow-lg shadow-emerald-600/25"
            >
              {t('landing.hero.cta')}
            </Link>
            <a
              href="#how-it-works"
              className="bg-card hover:bg-gray-100 dark:hover:bg-gray-700 text-secondary text-lg px-8 py-3 rounded-lg font-semibold transition-all border border-border"
            >
              {t('landing.hero.learnMore')}
            </a>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 bg-surface transition-colors duration-300">
        <div className="max-w-5xl mx-auto">
          <SectionHeading title={t('landing.how.title')} description={t('landing.how.description')} />
          <div className="grid md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-600/20 border-2 border-emerald-500/40 flex items-center justify-center text-2xl font-bold text-emerald-600 dark:text-emerald-400 mx-auto mb-4">
                  {i}
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">{t(`landing.how.step${i}.title`)}</h3>
                <p className="text-secondary text-sm">{t(`landing.how.step${i}.description`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-20 px-4 bg-card transition-colors duration-300">
        <div className="max-w-5xl mx-auto">
          <SectionHeading title={t('landing.features.title')} description={t('landing.features.description')} />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: '🌎', key: 'globalMap' },
              { icon: '📊', key: 'realEconomy' },
              { icon: '🏦', key: 'banking' },
              { icon: '🏗️', key: 'development' },
              { icon: '👥', key: 'multiplayer' },
              { icon: '🌍', key: 'worldEvents' },
            ].map((f) => (
              <FeatureCard
                key={f.key}
                icon={f.icon}
                title={t(`landing.features.${f.key}.title`)}
                description={t(`landing.features.${f.key}.description`)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Statistics */}
      <section className="py-20 px-4 bg-surface transition-colors duration-300">
        <div className="max-w-5xl mx-auto">
          <SectionHeading title={t('landing.stats.title')} description={null} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { key: 'players', target: stats?.playersCount || 0, suffix: '' },
              { key: 'properties', target: stats?.propertiesCount || 0, suffix: '' },
              { key: 'cities', target: stats?.citiesCount || 0, suffix: '' },
              { key: 'transactions', target: stats?.transactionsCount || 0, suffix: '' },
            ].map((s) => (
              <div key={s.key} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                  <AnimatedCounter target={s.target} suffix={s.suffix} />
                </div>
                <div className="text-sm text-secondary">{t(`landing.stats.${s.key}`)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <section className="py-20 px-4 bg-card transition-colors duration-300">
          <div className="max-w-3xl mx-auto">
            <SectionHeading title={t('landing.leaderboard.title')} description={t('landing.leaderboard.description')} />
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              {leaderboard.map((player, i) => (
                <Link
                  key={player._id}
                  to={`/profile/${player.username}`}
                  className={`flex items-center justify-between px-6 py-4 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors ${i < leaderboard.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-lg font-bold w-8 ${i === 0 ? 'text-yellow-600 dark:text-yellow-400' : i === 1 ? 'text-gray-500 dark:text-gray-300' : i === 2 ? 'text-amber-600 dark:text-amber-500' : 'text-muted'}`}
                    >
                      {i + 1}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm text-muted">
                      {(player.displayName || player.username).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-primary font-medium">{player.displayName || player.username}</span>
                  </div>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    ${(player.netWorth || 0).toLocaleString()}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Activity Feed */}
      {activity.length > 0 && (
        <section className="py-20 px-4 bg-surface transition-colors duration-300">
          <div className="max-w-3xl mx-auto">
            <SectionHeading title={t('landing.activity.title')} description={t('landing.activity.description')} />
            <div className="space-y-3">
              {activity.map((tx) => (
                <div key={tx._id} className="bg-card rounded-lg px-5 py-3 border border-border text-sm">
                  <span className="text-primary">{formatActivity(tx)}</span>
                  <span className="text-muted text-xs ml-2">{new Date(tx.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-24 px-4 relative overflow-hidden">
        <CtaGradient resolved={resolved} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-primary mb-6 leading-tight">{t('landing.cta.title')}</h2>
          <p className="text-lg text-secondary mb-8 max-w-xl mx-auto">{t('landing.cta.description')}</p>
          <Link
            to="/login"
            className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white text-xl px-10 py-4 rounded-lg font-bold transition-all hover:-translate-y-0.5 shadow-lg shadow-emerald-600/30"
          >
            {t('landing.cta.button')}
          </Link>
        </div>
      </section>
    </div>
  );
}
