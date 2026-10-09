import type { AuditEntry } from '@shared/audit/AuditLog';
import type { AreaProps } from '../domain/AffectedArea';
import type { AllocationRequestProps } from '../domain/AllocationRequest';
import type { RequirementProps } from '../domain/ResourceRequirement';
import type { ResourceProps } from '../domain/Resource';
import type { District, OrganizationType } from '@shared/contracts/enums';

export interface Inventory extends ResourceProps {
  category: string;
  unit: string;
  organizationName: string;
  organizationType: OrganizationType;
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
export interface Dispatch {
  dispatchId: string;
  requestId: string;
  requirementId: string;
  resourceId: string;
  areaId: string;
  district: District;
  quantity: number;
  status: 'DISPATCHED' | 'DEPLOYED';
  dispatchedAt: Date;
  deployedAt?: Date;
}
export interface Records {
  areas: AreaProps;
  needs: Need;
  inventory: Inventory;
  requests: RequestRecord;
  dispatches: Dispatch;
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
