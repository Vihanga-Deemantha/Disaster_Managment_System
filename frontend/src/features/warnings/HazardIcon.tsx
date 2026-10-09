import type { HazardType, Severity } from '@contracts/enums';
import { Icon, type IconName } from '@/shared/ui/Icon';

/** One line icon per hazard, so a row can be told apart at a glance as well as by its name. */
const ICONS: Record<HazardType, IconName> = {
  FLOOD: 'waves',
  LANDSLIDE: 'mountain',
  CYCLONE: 'tornado',
  TSUNAMI: 'waves',
  DROUGHT: 'sun',
  LIGHTNING: 'zap',
  ROAD_BLOCKAGE: 'alertTriangle',
  OTHER: 'alertTriangle',
};

export function HazardIcon({ hazard, size = 18 }: { hazard: HazardType; size?: number }) {
  return <Icon name={ICONS[hazard]} size={size} />;
}

/** The soft tile behind the big hazard icon on a warning's card; its colour follows how severe it is. */
const TILES: Record<Severity, string> = {
  LOW: 'bg-info-100 text-info-600',
  MEDIUM: 'bg-warning-100 text-warning-600',
  HIGH: 'bg-danger-100 text-danger-600',
  CRITICAL: 'bg-danger-100 text-danger-600',
};

export function HazardTile({ hazard, severity }: { hazard: HazardType; severity: Severity }) {
  return (
    <span
      className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl ${TILES[severity]}`}
    >
      <HazardIcon hazard={hazard} size={26} />
    </span>
  );
}
