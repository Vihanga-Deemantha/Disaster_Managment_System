import type { AuditEntry } from '@shared/audit/AuditLog';
import type { AreaProps } from '../domain/AffectedArea';
import type { AllocationRequestProps } from '../domain/AllocationRequest';
import type { RequirementProps } from '../domain/ResourceRequirement';
import type { ResourceProps } from '../domain/Resource';
import type { District, OrganizationType } from '@shared/contracts/enums';
import type { TeamType } from '../domain/types';
import type { DispatchProps } from '../domain/ResourceDispatch';

export interface Inventory extends ResourceProps {
  category: string;
  unit: string;
  organizationName: string;
  organizationType: OrganizationType;
  name?: string;
  district?: District;
  teamType?: TeamType;
  teamSize?: number;
  lastUpdatedAt?: Date;
  capacity?: number;
  currentOccupancy?: number;
  committedQty?: number;
}
export interface Need extends RequirementProps {
  category: string;
  pendingQty: number;
}
export interface RequestRecord extends AllocationRequestProps {
  district: District;
  requestedBy: string;
  createdAt: Date;
}
export type Dispatch = DispatchProps;
export interface Records {
  areas: AreaProps;
  needs: Need;
  inventory: Inventory;
  requests: RequestRecord;
  dispatches: Dispatch;
  partners: { organizationId: string; mode: 'OK' | 'STALE' | 'DOWN'; updatedAt: Date };
  occupancyLogs: { shelterId: string; recordedAt: Date; occupancy: number };
  notifications: {
    notificationId: string;
    requestId: string;
    message: string;
    createdAt: Date;
    district?: District;
    organizationId?: string;
    national?: boolean;
  };
}
export interface ResourceStore {
  get<K extends keyof Records>(kind: K, id: string): Promise<Records[K]>;
  list<K extends keyof Records>(kind: K): Promise<Records[K][]>;
  save<K extends keyof Records>(kind: K, id: string, value: Records[K]): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}
export interface ResourceUnitOfWork {
  run<T>(work: (store: ResourceStore) => Promise<T>): Promise<T>;
}
