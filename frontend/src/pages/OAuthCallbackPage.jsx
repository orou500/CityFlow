import { useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const token = searchParams.get('token');
  const error = searchParams.get('error');

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      fetchMe().then(() => {
        if (searchParams.get('new_user') === '1') {
          navigate('/auth/accept-terms', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      });
    }
  }, [token, fetchMe, navigate, searchParams]);

  return (
    <div className="min-h-full flex items-center justify-center bg-surface px-4 py-8">
      <div className="bg-card p-8 rounded-lg w-full max-w-md border border-border shadow-lg text-center">
        {error && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h1 className="text-2xl font-bold mb-4 text-primary">Authentication Failed</h1>
            <p className="text-secondary mb-4">{decodeURIComponent(error)}</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-500 underline text-sm">
              Back to Login
            </Link>
          </>
        )}
        {token && (
          <>
            <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-secondary">Signing you in...</p>
          </>
        )}
        {!token && !error && (
          <>
            <h1 className="text-2xl font-bold mb-4 text-primary">Authentication Failed</h1>
            <p className="text-secondary mb-4">No authentication data received.</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-500 underline text-sm">
              Back to Login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
