import type {
  AlertFact,
  CatalogEvent,
  DispatchFact,
  FilterInput,
  OccupancyFact,
} from '../domain/types';
import type { AuthContext } from '@shared/auth/domain/types';
export const event: CatalogEvent = {
  eventId: 'flood',
  name: 'Ratnapura Monsoon Flood',
  hazardType: 'FLOOD',
  districts: ['RATNAPURA'],
  startDate: '2026-09-01',
  endDate: '2026-09-30',
};
export const input: FilterInput = {
  eventId: 'flood',
  district: 'ALL',
  hazardType: 'ALL',
  from: '2026-09-01',
  to: '2026-09-30',
};
export const dmc: AuthContext = {
  userId: 'dmc',
  role: 'DMC_OFFICER',
  sessionId: 's',
  authenticatedAt: new Date('2026-10-07'),
};
export const channel = { sent: 100, delivered: 70, failed: 30 };
export const alert: AlertFact = {
  id: 'a1',
  eventId: 'flood',
  at: '2026-09-02T23:59:59Z',
  district: 'RATNAPURA',
  hazardType: 'FLOOD',
  targeted: 100,
  reached: 80,
  pendingRetry: 10,
  failed: 10,
  byChannel: { PUSH: channel, SMS: channel, EMAIL: channel, WHATSAPP: channel },
  officerName: 'Private officer',
  citizenIdentifiers: ['private-citizen'],
};
export const occupancy: OccupancyFact = {
  id: 's1',
  eventId: 'flood',
  district: 'RATNAPURA',
  hazardType: 'FLOOD',
  at: alert.at,
  shelterId: 'shelter',
  shelterName: 'School',
  occupancy: 75,
  capacity: 100,
};
export const dispatch: DispatchFact = {
  id: 'd1',
  eventId: 'flood',
  district: 'RATNAPURA',
  hazardType: 'FLOOD',
  at: alert.at,
  organizationId: 'red-cross',
  organizationName: 'Red Cross',
  supplyCategory: 'Medical kits',
  quantity: 100,
  unit: 'kits',
  officerName: 'Private officer',
};
