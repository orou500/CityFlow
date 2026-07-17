import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../components/ThemeProvider';
import Footer from '../components/Footer';
import { formatMoney } from '../utils/format';

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
    <div className="bg-card rounded-xl p-6 border border-border hover:border-blue-500/30 transition-all hover:-translate-y-1">
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
          ? 'linear-gradient(135deg, #1a2744, #020617, #020617)'
          : 'linear-gradient(135deg, #e0f2fe, #ffffff, #f0f9ff)',
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
          ? 'linear-gradient(to top, rgba(2,6,23,0.85), transparent, transparent)'
          : 'linear-gradient(to top, rgba(255,255,255,0.85), transparent, transparent)',
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
          ? 'linear-gradient(135deg, #1a2744, #020617, #020617)'
          : 'linear-gradient(135deg, #e0f2fe, #ffffff, #f0f9ff)',
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
  const [worldAge, setWorldAge] = useState(null);
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
    fetch('/api/world/status')
      .then((r) => r.json())
      .then((data) => setWorldAge(data))
      .catch(() => {});
  }, []);

  function formatActivity(tx) {
    const buyer = tx.buyerId?.displayName || tx.buyerId?.username || 'Someone';
    const seller = tx.sellerId?.displayName || tx.sellerId?.username || 'Someone';
    const property = tx.propertyId?.name || 'a property';
    const amount = formatMoney(tx.price);

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
          <img src="/images/logo-big.png" alt="CityFlow" className="h-20 md:h-30 lg:h-48 mx-auto mb-6" />
          <h1 className="text-4xl md:text-6xl font-bold text-primary mb-6 leading-tight">{t('landing.hero.title')}</h1>
          <p className="text-lg md:text-xl text-secondary mb-8 max-w-2xl mx-auto leading-relaxed">
            {t('landing.hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="bg-orange-500 hover:bg-orange-400 text-white text-lg px-8 py-3 rounded-lg font-bold transition-all hover:-translate-y-0.5 shadow-lg shadow-orange-500/25"
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
                <div className="w-16 h-16 rounded-full bg-orange-500/20 border-2 border-orange-500/40 flex items-center justify-center text-2xl font-bold text-orange-500 dark:text-orange-400 mx-auto mb-4">
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            {[
              { key: 'players', target: stats?.playersCount || 0, suffix: '' },
              { key: 'properties', target: stats?.propertiesCount || 0, suffix: '' },
              { key: 'cities', target: stats?.citiesCount || 0, suffix: '' },
              { key: 'transactions', target: stats?.transactionsCount || 0, suffix: '' },
              { key: 'worldAge', target: worldAge?.currentCycle || 0, suffix: '' },
            ].map((s) => (
              <div key={s.key} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-orange-500 dark:text-orange-400 mb-1">
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
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">
                    {formatMoney(player.netWorth || 0)}
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

      {/* Community */}
      <section className="py-20 px-4 bg-card transition-colors duration-300">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 rounded-full bg-[#5865F2]/10 border-2 border-[#5865F2]/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">{t('landing.community.title')}</h2>
          <p className="text-secondary max-w-xl mx-auto mb-8">{t('landing.community.description')}</p>
          <a
            href={import.meta.env.VITE_DISCORD_INVITE_URL || 'https://discord.gg/vTav6WYQdQ'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-lg px-8 py-3 rounded-lg font-bold transition-all hover:-translate-y-0.5 shadow-lg shadow-[#5865F2]/25"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            {t('landing.community.button')}
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 relative overflow-hidden">
        <CtaGradient resolved={resolved} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-primary mb-6 leading-tight">{t('landing.cta.title')}</h2>
          <p className="text-lg text-secondary mb-8 max-w-xl mx-auto">{t('landing.cta.description')}</p>
          <Link
            to="/login"
            className="inline-block bg-orange-500 hover:bg-orange-400 text-white text-xl px-10 py-4 rounded-lg font-bold transition-all hover:-translate-y-0.5 shadow-lg shadow-orange-500/30"
          >
            {t('landing.cta.button')}
          </Link>
        </div>
      </section>
    </div>
  );
}
