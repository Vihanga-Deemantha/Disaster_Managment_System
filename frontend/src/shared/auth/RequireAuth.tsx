import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Role } from '@contracts/enums';
import { Spinner } from '@/shared/ui/Spinner';
import { useAuth } from './AuthContext';
import { ForbiddenPage } from './ForbiddenPage';

/**
 * Route guard. Anonymous visitors go to /login (and come back afterwards); a signed-in user whose
 * role is not in `roles` sees a 403 page. The server enforces the same rules: this is only the UX.
 */
export function RequireAuth({ roles, children }: { roles?: readonly Role[]; children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (roles && !roles.includes(user.role)) return <ForbiddenPage />;
  return <>{children}</>;
}
