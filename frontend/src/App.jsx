import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import OnboardingWrapper from './components/OnboardingWrapper';
import ProtectedRoute from './components/ProtectedRoute';
import GuestRoute from './components/GuestRoute';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import MobileInit from './components/MobileInit';
import MobileSettingsPage from './pages/MobileSettingsPage';
import { ThemeProvider } from './components/ThemeProvider';
import LandingPage from './pages/LandingPage';
import MapPage from './pages/MapPage';
import CityDashboard from './pages/CityDashboard';
import PlayerDashboard from './pages/PlayerDashboard';
import Marketplace from './pages/Marketplace';
import LoginPage from './pages/LoginPage';
import PropertyPage from './pages/PropertyPage';
import BankPage from './pages/BankPage';
import AdminPage from './pages/AdminPage';
import DevelopmentPage from './pages/DevelopmentPage';
import ProjectDetailsPage from './pages/ProjectDetailsPage';
import UserProfilePage from './pages/UserProfilePage';
import FriendsPage from './pages/FriendsPage';
import NotificationsPage from './pages/NotificationsPage';
import NotFoundPage from './pages/NotFoundPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import CookiesPage from './pages/CookiesPage';
import SeasonHistoryPage from './pages/SeasonHistoryPage';
import ContributorsPage from './pages/ContributorsPage';
import MaintenancePage from './pages/MaintenancePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import OAuthAcceptTermsPage from './pages/OAuthAcceptTermsPage';
import SettingsPage from './pages/SettingsPage';
import StockMarket from './pages/StockMarket';
import CompanyPage from './pages/CompanyPage';
import StockPortfolio from './pages/StockPortfolio';
import IndexPage from './pages/IndexPage';
import LeaderboardPage from './pages/LeaderboardPage';
import CompetitiveEventsPage from './pages/CompetitiveEventsPage';
import { useEffect } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { useGameStore } from './store/useGameStore';
import { ToastProvider } from './components/Toast';
import { isNativePlatform, loadToken } from './utils/capacitor';
import { setupDeepLinking, setNavigateFunction } from './utils/deepLinks';
import { registerForPushNotifications, setupPushNotificationListeners } from './utils/pushNotifications';
import { isBiometricEnabled, authenticateWithBiometric, isBiometricAvailable } from './utils/biometric';
import './i18n/index.js';

const TERMS_PATH = '/auth/accept-terms';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/terms',
  '/privacy',
  '/cookies',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/auth/callback',
];

function AppRoutes() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const needsTerms = user && (!user.acceptedTerms || !user.acceptedPrivacy);
  const isPublicPath =
    PUBLIC_PATHS.includes(location.pathname) ||
    location.pathname.startsWith('/seasons') ||
    location.pathname.startsWith('/contributors');

  if (needsTerms && location.pathname !== TERMS_PATH) {
    return <Navigate to={TERMS_PATH} replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/map" element={<MapPage />} />
      <Route
        path="/city/:id"
        element={
          <ErrorBoundary>
            <CityDashboard />
          </ErrorBoundary>
        }
      />
      <Route
        path="/property/:id"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <PropertyPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <PlayerDashboard />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/bank"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <BankPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/development"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <DevelopmentPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/project/:id"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <ProjectDetailsPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/marketplace"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <Marketplace />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/admin"
        element={
          <ErrorBoundary>
            <ProtectedRoute requiredRole="admin">
              <AdminPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/profile/:username"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <UserProfilePage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/profile"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <UserProfilePage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/friends"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <FriendsPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/notifications"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/settings"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/mobile-settings"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <MobileSettingsPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/stocks"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <StockMarket />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/stocks/portfolio"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <StockPortfolio />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/company/:id"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <CompanyPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route
        path="/index/:id"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <IndexPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/cookies" element={<CookiesPage />} />
      <Route path="/leaderboards" element={<LeaderboardPage />} />
      <Route path="/events" element={<CompetitiveEventsPage />} />
      <Route path="/seasons" element={<SeasonHistoryPage />} />
      <Route path="/contributors" element={<ContributorsPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route
        path="/auth/accept-terms"
        element={
          <ErrorBoundary>
            <ProtectedRoute>
              <OAuthAcceptTermsPage />
            </ProtectedRoute>
          </ErrorBoundary>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function AppInner() {
  const navigate = useNavigate();

  useEffect(() => {
    setNavigateFunction(navigate);
    setupDeepLinking();
  }, [navigate]);

  return null;
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const maintenance = useGameStore((s) => s.maintenance);
  const fetchMaintenance = useGameStore((s) => s.fetchMaintenance);

  useEffect(() => {
    fetchMaintenance();
    loadToken().then((token) => {
      if (token) {
        fetchMe();
      } else {
        useAuthStore.setState({ loading: false });
      }
    });
  }, []);

  const isAdmin = user?.role === 'admin';
  const needsTerms = user && (!user.acceptedTerms || !user.acceptedPrivacy);

  if (authLoading) {
    return (
      <ThemeProvider>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-gray-500">Loading...</div>
        </div>
      </ThemeProvider>
    );
  }

  const allowedPaths = ['/', '/login'];
  const isAllowedPath = allowedPaths.includes(window.location.pathname);

  if (maintenance.enabled && !isAdmin && !isAllowedPath) {
    return (
      <ThemeProvider>
        <OfflineBanner />
        <MaintenancePage message={maintenance.message} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineBanner />
        <BrowserRouter>
          <AppInner />
          <MobileInit />
          {needsTerms ? (
            <AppRoutes />
          ) : (
            <Layout>
              <OnboardingWrapper>
                <AppRoutes />
              </OnboardingWrapper>
            </Layout>
          )}
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
