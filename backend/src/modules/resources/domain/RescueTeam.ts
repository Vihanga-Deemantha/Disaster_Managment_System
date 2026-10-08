import type { GeoPoint } from '@shared/geo/GeoPoint';
import { Resource, type ResourceProps } from './Resource';
import { assertQuantity } from './quantity';
import { assertTime } from './time';
import type { ResourceStatus, TeamType } from './types';

export interface RescueTeamProps extends Omit<ResourceProps, 'resourceType'> {
  teamType: TeamType;
  teamSize: number;
  lastUpdatedAt: Date;
}

/** UC-2 A4/UCD-05: the owning agency's teams share supply stock/reservation rules. */
export class RescueTeam extends Resource {
  readonly teamType: TeamType;
  readonly teamSize: number;
  private updatedAt: Date;

  constructor(props: RescueTeamProps) {
    super({ ...props, resourceType: 'RESCUE_TEAM' });
    assertQuantity(props.teamSize, 'teamSize');
    assertTime(props.lastUpdatedAt, 'lastUpdatedAt');
    this.teamType = props.teamType;
    this.teamSize = props.teamSize;
    this.updatedAt = new Date(props.lastUpdatedAt);
  }

  get lastKnownLocation(): GeoPoint {
    return { ...this.state.location };
  }
  get lastUpdatedAt(): Date {
    return new Date(this.updatedAt);
  }

  /** UC-2 A4: record the team's field status and location with injected time. */
  updateStatus(status: ResourceStatus, location: GeoPoint, now: Date): void {
    assertTime(now, 'lastUpdatedAt');
    this.state.status = status;
    this.state.location = { ...location };
    this.updatedAt = new Date(now);
  }
}
