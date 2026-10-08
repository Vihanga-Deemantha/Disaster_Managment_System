import { useT } from '@/shared/i18n/I18nProvider';
export function ScoreBar({ score }: { score: number }) {
  const t = useT();
  return (
    <div
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={t('hazardReports.cluster.score', { score })}
      className="h-2 overflow-hidden rounded-full bg-paper"
    >
      <div className="h-full bg-accent-600" style={{ width: `${score}%` }} />
    </div>
  );
}
