import { useId, useState } from 'react';
import { districtLabel, useI18n } from '@/shared/i18n/I18nProvider';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import type { HazardReportsApi } from '../api/hazardReportsApi';
import type { ClusterDetail } from '../api/types';
import { escalationState } from '../model/escalation';
import { escalationRequest } from '../model/escalationRequest';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { useEscalationReasons } from '../hooks/useEscalationReasons';

interface Props {
  cluster: ClusterDetail;
  client: HazardReportsApi;
  online: boolean;
  reload: () => void;
}
export function EscalationAction({ cluster, client, online, reload }: Props) {
  const { t, language } = useI18n();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const state = escalationState(cluster, online);
  const { reasons, disabledReason } = useEscalationReasons(cluster, state, online);
  return (
    <>
      {state.kind === 'DONE' ? (
        <Alert tone="success">{t('hazardReports.escalate.done')}</Alert>
      ) : (
        <>
          <Button
            disabled={state.kind !== 'READY'}
            aria-describedby={state.kind === 'READY' ? undefined : reasonId}
            onClick={() => setOpen(true)}
          >
            {t('hazardReports.escalate.button')}
          </Button>
          <div id={reasonId} className="text-sm leading-6 text-ink-soft">
            <ul className="list-inside list-disc space-y-1">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        </>
      )}
      <ConfirmActionDialog
        open={open}
        title={t('hazardReports.escalate.confirmTitle')}
        body={t('hazardReports.escalate.confirmBody', {
          area: districtLabel(t, language, cluster.district),
        })}
        confirmLabel={t('hazardReports.escalate.confirm')}
        onConfirm={escalationRequest(client, cluster.id, reload)}
        onClose={() => setOpen(false)}
        disabledReason={disabledReason}
      />
    </>
  );
}
