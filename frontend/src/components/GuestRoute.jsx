import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function GuestRoute({ children }) {
  const { user, loading } = useAuthStore();

  if (loading) {
    return <div className="h-full flex items-center justify-center text-muted">Loading...</div>;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
