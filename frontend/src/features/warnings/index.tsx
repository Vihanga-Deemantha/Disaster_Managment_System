import { Route, Routes } from 'react-router';
import { NotFoundPage } from '@/shared/layout/NotFoundPage';
import { DeliverySummaryPage } from './DeliverySummaryPage';
import { PendingApprovalsPage } from './PendingApprovalsPage';
import { ReviewWarningPage } from './ReviewWarningPage';

/**
 * UC-1 Issue Warning. The app mounts this at `/warnings/*`:
 *   /warnings                         Pending Approvals (screen 1)
 *   /warnings/:warningId              Review, with edit, reject and the confirm dialog (screens 2 to 5)
 *   /warnings/:warningId/delivery     Delivery summary (screen 6)
 */
export function WarningsPage() {
  return (
    <Routes>
      <Route index element={<PendingApprovalsPage />} />
      <Route path=":warningId" element={<ReviewWarningPage />} />
      <Route path=":warningId/delivery" element={<DeliverySummaryPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
