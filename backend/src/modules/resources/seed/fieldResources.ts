import { DEMO_ORGANIZATIONS } from '@shared/auth/seed/demoAccounts';
import type { District } from '@shared/contracts/enums';
import type { Inventory, Need } from '../application/ports';

export function fieldInventory(now: Date): Inventory[] {
  const base = {
    status: 'AVAILABLE' as const,
    reservedQty: 0,
    lastSyncedAt: now,
    location: { lat: 7.0873, lng: 79.9925 },
  };
  const teams = [
    {
      resourceId: 'army-rescue-team-1',
      organizationId: DEMO_ORGANIZATIONS.army.id,
      organizationName: 'Sri Lanka Army',
      organizationType: 'ARMED_FORCES',
      category: 'ARMY',
      teamType: 'ARMY',
      teamSize: 12,
      name: 'Army rescue unit 1',
    },
    {
      resourceId: 'red-cross-medical-team-1',
      organizationId: DEMO_ORGANIZATIONS.redCross.id,
      organizationName: 'Sri Lanka Red Cross',
      organizationType: 'NGO',
      category: 'MEDICAL_TEAM',
      teamType: 'MEDICAL',
      teamSize: 6,
      name: 'Red Cross medical unit 1',
    },
  ] as const;
  const teamInventory: Inventory[] = teams.map((team) => ({
    ...base,
    ...team,
    resourceType: 'RESCUE_TEAM' as const,
    availableQty: 1,
    unit: 'teams',
    lastUpdatedAt: now,
  }));
  return [
    ...teamInventory,
    ...(['GAMPAHA', 'COLOMBO', 'RATNAPURA'] as const).map((district) => ({
      ...base,
      resourceId: `${district.toLowerCase()}-shelter-1`,
      organizationId: DEMO_ORGANIZATIONS.redCross.id,
      organizationName: 'Sri Lanka Red Cross',
      organizationType: 'NGO' as const,
      name: `${district} evacuation shelter`,
      district,
      resourceType: 'SHELTER' as const,
      category: 'EVACUATION_SHELTER',
      unit: 'places',
      capacity: 300,
      currentOccupancy: 40,
      committedQty: 0,
      availableQty: 260,
    })),
  ];
}
export function fieldNeeds(district: District): Need[] {
  const areaId = `${district.toLowerCase()}-flood-area`;
  return [
    { category: 'ARMY', resourceType: 'RESCUE_TEAM' as const, unit: 'teams', requiredQty: 1 },
    {
      category: 'MEDICAL_TEAM',
      resourceType: 'RESCUE_TEAM' as const,
      unit: 'teams',
      requiredQty: 1,
    },
    {
      category: 'EVACUATION_SHELTER',
      resourceType: 'SHELTER' as const,
      unit: 'places',
      requiredQty: 200,
    },
  ].map((need) => ({
    ...need,
    areaId,
    requirementId: `${areaId}-${need.category}`,
    fulfilledQty: 0,
    pendingQty: 0,
  }));
}
