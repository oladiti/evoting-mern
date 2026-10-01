import { Link, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FullLoader } from './index';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullLoader text="Checking session..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function AdminRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullLoader text="Checking session..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullLoader text="Checking session..." />;
  if (user) return <Navigate to={user.is_admin ? '/admin' : '/dashboard'} replace />;
  return <Outlet />;
}

export function ErrorMessage({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-danger-600 dark:text-danger-400 bg-danger-500/10 border border-danger-500/30 px-4 py-3 rounded-xl">
      <i className="fas fa-times-circle" />
      <span>{message}</span>
    </div>
  );
}

export function SuccessMessage({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-success-600 dark:text-success-400 bg-success-500/10 border border-success-500/30 px-4 py-3 rounded-xl">
      <i className="fas fa-check-circle" />
      <span>{message}</span>
    </div>
  );
}

export function CardLink({ to, children }) {
  return (
    <Link to={to} className="w-full text-center btn-primary">
      {children}
    </Link>
  );
}
