import type { HazardType, Severity } from '@shared/contracts/enums';
import type { ClusteringConfig } from './ClusteringConfig';
import type { Band, ReportHazardType, ReportStatus } from './types';

export type EscalationRequirement = 'HIGH_BAND' | 'VERIFIED_REPORTS' | 'WARNABLE_HAZARD';

export interface EscalationInput {
  band: Band;
  dominantHazardType: ReportHazardType;
  reports: readonly { status: ReportStatus; hazardType: ReportHazardType }[];
}

export interface EscalationDecision {
  recommended: boolean;
  /** What is still missing: drives the disabled-button explanation. */
  unmet: EscalationRequirement[];
  verifiedCount: number;
  requiredVerified: number;
  /** The hazard UC-1 would warn about; undefined when the cluster holds no flood or landslide report. */
  hazardType?: HazardType;
  proposedSeverity?: Severity;
}

const isWarnable = (type: ReportHazardType): type is 'FLOOD' | 'LANDSLIDE' =>
  type === 'FLOOD' || type === 'LANDSLIDE';

/** The dominant type when UC-1 can issue it, else the most severe flood/landslide report present. */
function warningHazardType({
  dominantHazardType,
  reports,
}: EscalationInput): HazardType | undefined {
  if (isWarnable(dominantHazardType)) return dominantHazardType;
  const active = reports.filter((report) => report.status !== 'REJECTED');
  if (active.some((report) => report.hazardType === 'LANDSLIDE')) return 'LANDSLIDE';
  return active.some((report) => report.hazardType === 'FLOOD') ? 'FLOOD' : undefined;
}

/** Report §4: High band with a dominant landslide/flood proposes HIGH, anything else MEDIUM. */
export const severityFor = (band: Band, dominant: ReportHazardType): Severity =>
  band === 'HIGH' && isWarnable(dominant) ? 'HIGH' : 'MEDIUM';

/** Policy: when a cluster may be escalated, and what the request to UC-1 says (H4, H5, H11). */
export class EscalationPolicy {
  constructor(private readonly config: Pick<ClusteringConfig, 'escalationMinVerified'>) {}

  /** UC-3 step 15. */
  evaluate(input: EscalationInput): EscalationDecision {
    const verifiedCount = input.reports.filter((report) => report.status === 'VERIFIED').length;
    const hazardType = warningHazardType(input);
    const unmet: EscalationRequirement[] = [];
    if (input.band !== 'HIGH') unmet.push('HIGH_BAND');
    if (verifiedCount < this.config.escalationMinVerified) unmet.push('VERIFIED_REPORTS');
    if (!hazardType) unmet.push('WARNABLE_HAZARD');
    return {
      recommended: unmet.length === 0,
      unmet,
      verifiedCount,
      requiredVerified: this.config.escalationMinVerified,
      hazardType,
      proposedSeverity: hazardType ? severityFor(input.band, input.dominantHazardType) : undefined,
    };
  }
}
