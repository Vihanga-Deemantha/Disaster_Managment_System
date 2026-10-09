import type { District, OrganizationType } from '@contracts/enums';
export interface Area {
  areaId: string;
  name: string;
  district: District;
  priority: number;
  disasterEventId: string;
}
export interface Need {
  requirementId: string;
  areaId: string;
  category: string;
  unit: string;
  requiredQty: number;
  fulfilledQty: number;
  pendingQty: number;
}
export interface Supply {
  resourceId: string;
  organizationId: string;
  organizationName: string;
  organizationType: OrganizationType;
  category: string;
  unit: string;
  status: string;
  availableQty: number;
  reservedQty: number;
}
export interface Allocation {
  requestId: string;
  requirementId: string;
  resourceId: string;
  organizationId: string;
  requestedQty: number;
  confirmedQty?: number;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'NO_RESPONSE';
  respondBy: string;
  createdAt: string;
  reason?: string;
}
export interface Dispatch {
  dispatchId: string;
  requestId: string;
  requirementId: string;
  areaId: string;
  quantity: number;
  status: 'DISPATCHED' | 'DEPLOYED';
  dispatchedAt: string;
  deployedAt?: string;
}
export interface Board {
  areas: Area[];
  needs: Need[];
  requests: Allocation[];
  dispatches: Dispatch[];
}
export const label = (value: string) =>
  value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
export function describeAllocation(board: Board, requirementId: string) {
  const need = board.needs.find((n) => n.requirementId === requirementId);
  const area = board.areas.find((a) => a.areaId === need?.areaId);
  return {
    category: label(need?.category ?? 'Relief supply'),
    area: area?.name ?? requirementId,
    unit: need?.unit ?? '',
  };
}
export const remaining = (need: Need) =>
  Math.max(0, need.requiredQty - need.fulfilledQty - need.pendingQty);
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
export const dateLabel = (date: string) =>
  new Date(date).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
