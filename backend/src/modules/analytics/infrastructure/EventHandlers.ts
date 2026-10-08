import type { AllocationDeployed, WarningIssued } from '@shared/contracts/events';
import type { AnalyticsStore } from '../application/ports';
/** Observer: WarningIssued becomes owned history. */
export class WarningIssuedHandler {
  constructor(private readonly store: AnalyticsStore) {}
  async handle(event: WarningIssued): Promise<void> {
    const day = event.issuedAt.slice(0, 10);
    let matched = (await this.store.list()).find(
      (e) =>
        e.hazardType === event.hazardType &&
        e.districts.includes(event.targetArea.district) &&
        e.startDate <= day &&
        e.endDate >= day,
    );
    if (!matched) {
      matched = {
        eventId: `warning-${event.warningId}`,
        name: `${event.targetArea.name} ${event.hazardType.toLowerCase()} (${day})`,
        hazardType: event.hazardType,
        districts: [event.targetArea.district],
        startDate: day,
        endDate: day,
      };
      await this.store.putEvent(matched);
    }
    await this.store.putAlert({
      id: event.warningId,
      eventId: matched.eventId,
      district: event.targetArea.district,
      hazardType: event.hazardType,
      at: event.issuedAt,
      targeted: event.targetedCitizens,
      reached: event.reached,
      pendingRetry: event.pendingRetry,
      failed: event.failed,
      byChannel: event.byChannel,
    });
  }
}
/** Frozen AllocationDeployed has no event/hazard. Associate only an unambiguous event window. */
export class AllocationDeployedHandler {
  constructor(private readonly store: AnalyticsStore) {}
  async handle(event: AllocationDeployed): Promise<void> {
    const day = event.deployedAt.slice(0, 10);
    const candidates = (await this.store.list()).filter(
      (e) => e.districts.includes(event.district) && e.startDate <= day && e.endDate >= day,
    );
    const matched = candidates.length === 1 ? candidates[0] : undefined;
    await this.store.putDispatch({
      id: event.allocationId,
      eventId: matched?.eventId,
      district: event.district,
      hazardType: matched?.hazardType ?? 'UNKNOWN',
      at: event.deployedAt,
      organizationId: event.organizationId,
      organizationName: event.organizationName,
      supplyCategory: event.supplyCategory,
      quantity: event.quantity,
      unit: event.unit,
    });
  }
}
