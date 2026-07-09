import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function NotFoundPage() {
  const { user } = useAuthStore();

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-surface">
      <div className="text-center max-w-md">
        <h1 className="text-8xl font-bold text-gray-300 dark:text-gray-600 mb-4">404</h1>
        <h2 className="text-2xl font-bold text-primary mb-2">Page Not Found</h2>
        <p className="text-muted mb-8">The page you're looking for doesn't exist.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
          >
            World Map
          </Link>
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
              >
                Dashboard
              </Link>
              <Link
                to="/marketplace"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded transition-colors"
              >
                Marketplace
              </Link>
              <Link
                to="/bank"
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm rounded transition-colors"
              >
                Bank
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
              >
                Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
