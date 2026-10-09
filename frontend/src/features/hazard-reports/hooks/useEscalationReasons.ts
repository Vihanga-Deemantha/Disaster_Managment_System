import { useT } from '@/shared/i18n/I18nProvider';
import type { ClusterDetail } from '../api/types';
import type { EscalationState } from '../model/escalation';

export function useEscalationReasons(
  cluster: ClusterDetail,
  state: EscalationState,
  online: boolean,
) {
  const t = useT();
  const requirements = state.kind === 'BLOCKED' ? state.unmet : [];
  const reasons = !online
    ? [t('hazardReports.escalate.offline')]
    : requirements.map((requirement) =>
        t(`hazardReports.escalate.needs.${requirement}`, {
          verified: cluster.counts.verified,
          required: cluster.escalation.requiredVerified,
        }),
      );
  const disabledReason =
    state.kind === 'READY' ? undefined : reasons.join(' ') || t('error.ESCALATION_NOT_ALLOWED');
  return { reasons, disabledReason };
}
