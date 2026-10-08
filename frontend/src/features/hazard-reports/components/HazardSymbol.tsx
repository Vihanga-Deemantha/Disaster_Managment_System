import { Icon, type IconName } from '@/shared/ui/Icon';
import type { ReportHazardType } from '../api/types';

const ICONS: Record<ReportHazardType, IconName> = {
  FLOOD: 'waves',
  LANDSLIDE: 'mountain',
  ROAD_BLOCKAGE: 'alertTriangle',
  OTHER: 'alertCircle',
};
export function HazardSymbol({ hazard }: { hazard: ReportHazardType }) {
  return <Icon name={ICONS[hazard]} size={18} />;
}
export function HazardTile({ hazard }: { hazard: ReportHazardType }) {
  return (
    <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-accent-100 text-accent-600 [&_svg]:h-7 [&_svg]:w-7">
      <HazardSymbol hazard={hazard} />
    </span>
  );
}
