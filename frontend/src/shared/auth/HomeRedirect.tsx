import { Navigate } from 'react-router';
import { useAuth } from './AuthContext';
import { homePathFor } from './homePath';

/** `/` sends each signed-in user to the screen their role works in most. */
export function HomeRedirect() {
  const { user } = useAuth();
  return user ? <Navigate to={homePathFor(user.role)} replace /> : null;
}
