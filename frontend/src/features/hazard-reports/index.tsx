import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from '@/shared/auth/AuthContext';
import { CitizenReports } from './screens/CitizenReports';
import { ClusterDetail } from './screens/ClusterDetail';
import { OfficerDashboard } from './screens/OfficerDashboard';
import { ReportDetail } from './screens/ReportDetail';
import { ReportsHistory } from './screens/ReportsHistory';

/**
 * UC-3 web route shell. Duty officers review reports; reporters submit through the mobile app.
 */
export function HazardReportsPage() {
  const { user } = useAuth();
  if (user?.role !== 'DUTY_OFFICER') return <CitizenReports />;
  return (
    <Routes>
      <Route index element={<OfficerDashboard />} />
      <Route path="clusters/:clusterId" element={<ClusterDetail />} />
      <Route path="reports/:reportId" element={<ReportDetail />} />
      <Route path="history" element={<ReportsHistory />} />
      <Route path="*" element={<Navigate to="/hazard-reports" replace />} />
    </Routes>
  );
}
