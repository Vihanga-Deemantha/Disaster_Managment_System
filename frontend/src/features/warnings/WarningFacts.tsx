import type { ReactNode } from 'react';
import { useI18n, useT } from '@/shared/i18n/I18nProvider';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { SeverityPill } from '@/shared/ui/SeverityPill';
import { formatDateTime } from './format';
import { HazardIcon, HazardTile } from './HazardIcon';
import type { WarningDto } from './types';

/** One line of a fact list: a label, then an icon and the value. */
export function InfoRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2.5 font-medium text-navy-900">
        {icon ? <Icon name={icon} size={16} className="flex-none text-ink-soft" /> : null}
        <span className="min-w-0">{children}</span>
      </dd>
    </>
  );
}

/** The warning's title with its hazard tile: "Flood Warning". `as` keeps the heading levels in order. */
export function WarningTitle({
  warning,
  as: Heading = 'h2',
}: {
  warning: WarningDto;
  as?: 'h2' | 'h3';
}) {
  const t = useT();
  const hazard = t(`warnings.hazard.${warning.hazardType}`);
  return (
    <div className="flex items-center gap-4">
      <HazardTile hazard={warning.hazardType} severity={warning.severity} />
      <Heading className="text-xl font-extrabold text-navy-900">
        {t('warnings.review.cardTitle', { hazard })}
      </Heading>
    </div>
  );
}

/**
 * What the warning is: hazard, severity, where and until when. The screen adds its own rows after these
 * (who submitted it and when for the review, who issued it and when for the delivery summary).
 */
export function WarningFacts({ warning, children }: { warning: WarningDto; children?: ReactNode }) {
  const { t, language } = useI18n();
  const hazard = t(`warnings.hazard.${warning.hazardType}`);
  return (
    <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
      <InfoRow label={t('warnings.review.label.hazard')}>
        <span className="flex items-center gap-2.5">
          <span className="text-ink-soft">
            <HazardIcon hazard={warning.hazardType} size={16} />
          </span>
          {hazard}
        </span>
      </InfoRow>
      <InfoRow label={t('warnings.review.label.severity')}>
        <SeverityPill severity={warning.severity} />
      </InfoRow>
      <InfoRow label={t('warnings.review.label.area')} icon="mapPin">
        {warning.targetAreas.map((area) => (
          <span key={area.areaId} className="block">
            {area.name}
            <span className="ml-2 rounded bg-accent-100 px-1.5 py-0.5 text-xs font-semibold">
              {t(`warnings.area.${area.type}`)}
            </span>
          </span>
        ))}
      </InfoRow>
      <InfoRow label={t('warnings.review.label.validity')} icon="calendar">
        {/* each end stays in one piece, so the line can only break at the dash */}
        <span className="whitespace-nowrap">
          {formatDateTime(warning.validFrom, language)}
        </span> —{' '}
        <span className="whitespace-nowrap">{formatDateTime(warning.validTo, language)}</span>
      </InfoRow>
      {children}
    </dl>
  );
}
