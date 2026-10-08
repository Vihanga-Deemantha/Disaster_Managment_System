import { districtLabel, useI18n } from '@/shared/i18n/I18nProvider';
import type { ClusterDetail } from '../api/types';
import { clusterStatusTone } from '../model/labels';
import { BandBadge } from './BandBadge';
import { InfoRow } from './InfoRow';
import { StatusChip } from './StatusChip';

export function ClusterInformation({ cluster }: { cluster: ClusterDetail }) {
  const { t, language } = useI18n();
  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
      <InfoRow label={t('hazardReports.col.area')} icon="mapPin">
        {districtLabel(t, language, cluster.district)}
      </InfoRow>
      <InfoRow label={t('hazardReports.col.score')} icon="barChart">
        <BandBadge band={cluster.band} />
      </InfoRow>
      <InfoRow label={t('hazardReports.col.reports')} icon="fileText">
        {t('hazardReports.reportsCount', {
          total: cluster.counts.total,
          verified: cluster.counts.verified,
        })}
      </InfoRow>
      <InfoRow label={t('hazardReports.col.status')} icon="shieldCheck">
        <StatusChip
          label={t(`hazardReports.clusterStatus.${cluster.status}`)}
          tone={clusterStatusTone(cluster.status)}
        />
      </InfoRow>
    </dl>
  );
}
