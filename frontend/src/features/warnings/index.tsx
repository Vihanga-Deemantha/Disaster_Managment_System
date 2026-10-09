import { Route, Routes } from 'react-router';
import { NotFoundPage } from '@/shared/layout/NotFoundPage';
import { DeliverySummaryPage } from './DeliverySummaryPage';
import { ReviewWarningPage } from './ReviewWarningPage';
import { WarningsListPage } from './WarningsListPage';

/**
 * UC-1 Issue Warning. The app mounts this at `/warnings/*`:
 *   /warnings                         Pending Approvals (screen 1)
 *   /warnings/issued, /rejected       the same list for warnings that were issued or rejected
 *   /warnings/:warningId              Review, with edit, reject and the confirm dialog (screens 2 to 5)
 *   /warnings/:warningId/delivery     Delivery summary (screen 6)
 */
export function WarningsPage() {
  return (
    <Routes>
      <Route index element={<WarningsListPage kind="PENDING" />} />
      <Route path="issued" element={<WarningsListPage kind="ISSUED" />} />
      <Route path="rejected" element={<WarningsListPage kind="REJECTED" />} />
      <Route path=":warningId" element={<ReviewWarningPage />} />
      <Route path=":warningId/delivery" element={<DeliverySummaryPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
