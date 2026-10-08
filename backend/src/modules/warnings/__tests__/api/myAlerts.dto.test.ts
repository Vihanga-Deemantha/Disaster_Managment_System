import { toMyAlertDto, toMyAlertsDto } from '../../api/myAlerts.dto';
import type { InboxAlert } from '../../application/CitizenAlertInbox';
import {
  aNotification,
  aTargetArea,
  anIssuedWarning,
  HOUR,
  MESSAGES,
  NOW,
  result,
} from '../../testing/builders';

const RING = [
  { lat: 6.9, lng: 79.8 },
  { lat: 6.9, lng: 80.0 },
  { lat: 7.1, lng: 80.0 },
];

function anAlert(): InboxAlert {
  const notification = aNotification({ id: 'N-7', citizenId: 'c-7', warningId: 'W-7' });
  notification.recordAttempts([result('SMS', 'DELIVERED')], new Date(NOW.getTime() + HOUR), 3);
  const warning = anIssuedWarning({
    warningId: 'W-7',
    hazardType: 'LANDSLIDE',
    severity: 'CRITICAL',
    targetAreas: [
      aTargetArea(),
      aTargetArea({
        areaId: 'basin-kelani',
        type: 'RIVER_BASIN',
        name: 'Kelani Ganga',
        district: 'COLOMBO',
        boundary: RING,
      }),
    ],
  });
  return { notification, warning, deliveredAt: new Date(NOW.getTime() + HOUR) };
}

describe('UC-1 citizen inbox: toMyAlertDto', () => {
  it('names the alert, the warning, the text sent, the places and the times', () => {
    expect(toMyAlertDto(anAlert())).toEqual({
      alertId: 'N-7',
      warningId: 'W-7',
      hazardType: 'LANDSLIDE',
      severity: 'CRITICAL',
      message: MESSAGES.EN,
      language: 'EN',
      areas: [
        { areaId: 'GAMPAHA', type: 'DISTRICT', name: 'Gampaha', district: 'GAMPAHA' },
        { areaId: 'basin-kelani', type: 'RIVER_BASIN', name: 'Kelani Ganga', district: 'COLOMBO' },
      ],
      validFrom: NOW.toISOString(),
      validTo: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
      deliveredAt: new Date(NOW.getTime() + HOUR).toISOString(),
    });
  });

  it('leaves a basin’s map ring out: the phone only needs to name the place', () => {
    const [, basin] = toMyAlertDto(anAlert()).areas;

    expect(basin).toBeDefined();
    expect('boundary' in (basin as object)).toBe(false);
  });
});

describe('UC-1 citizen inbox: toMyAlertsDto', () => {
  it('keeps the order it is given and writes the server time as an ISO string', () => {
    const first = anAlert();
    const second = { ...anAlert(), notification: aNotification({ id: 'N-8' }) };

    const dto = toMyAlertsDto({ alerts: [second, first], serverTime: NOW });

    expect(dto.alerts.map((alert) => alert.alertId)).toEqual(['N-8', 'N-7']);
    expect(dto.serverTime).toBe('2026-10-07T09:00:00.000Z');
  });

  it('is just an empty list when there is nothing to show', () => {
    expect(toMyAlertsDto({ alerts: [], serverTime: NOW })).toEqual({
      alerts: [],
      serverTime: NOW.toISOString(),
    });
  });
});
