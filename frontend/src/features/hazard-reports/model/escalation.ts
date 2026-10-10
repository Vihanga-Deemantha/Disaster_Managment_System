import type { ClusterSummary, EscalationRequirement } from '../api/types';
export type EscalationState =
  | { kind: 'READY' }
  | { kind: 'DONE' }
  | { kind: 'OFFLINE' }
  | { kind: 'BLOCKED'; unmet: EscalationRequirement[] };
export function escalationState(cluster: ClusterSummary, online: boolean): EscalationState {
  if (cluster.status === 'ESCALATED') return { kind: 'DONE' };
  if (cluster.status !== 'ESCALATION_RECOMMENDED')
    return { kind: 'BLOCKED', unmet: cluster.escalation.unmet };
  return online ? { kind: 'READY' } : { kind: 'OFFLINE' };
}
