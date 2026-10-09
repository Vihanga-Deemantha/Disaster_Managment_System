import { ConflictError, ValidationError } from '@shared/errors/DomainError';
import { HazardReport } from '../domain/HazardReport';
import { aReport, BASE_TIME, KALUTARA, minutesAfter } from '../testing/builders';

const OFFICER = 'usr-duty-1';
const NOW = minutesAfter(20);

describe('HazardReport.submit', () => {
  it('UC-3 step 7: a new report starts Pending', () => {
    const report = HazardReport.submit({
      id: 'r-9',
      clientReportId: 'client-0009',
      reporterId: 'citizen-1',
      reporterType: 'CITIZEN',
      hazardType: 'FLOOD',
      description: '',
      location: { ...KALUTARA, source: 'MANUAL' },
      capturedAt: BASE_TIME,
      receivedAt: NOW,
      syncedFromOffline: true,
    });
    expect(report.status).toBe('PENDING');
    expect(report.snapshot().location.source).toBe('MANUAL');
    expect(report.clusterId).toBeUndefined();
  });
});

describe('HazardReport.verify', () => {
  it('UC-3 steps 13–14: sets status, reviewer and time', () => {
    const report = aReport();
    report.verify(OFFICER, NOW);
    expect(report.snapshot()).toMatchObject({
      status: 'VERIFIED',
      reviewedBy: OFFICER,
      reviewedAt: NOW,
    });
  });

  it.each(['VERIFIED', 'REJECTED'] as const)('refuses a report that is already %s', (status) => {
    const report = aReport({ status });
    expect(() => report.verify(OFFICER, NOW)).toThrow(ConflictError);
    expect(() => report.verify(OFFICER, NOW)).toThrow('already been reviewed');
    expect(report.status).toBe(status);
  });
});

describe('HazardReport.reject', () => {
  it('UC-3 A2: sets status, reviewer, time and the trimmed reason', () => {
    const report = aReport();
    report.reject(OFFICER, '  Photo shows another place  ', NOW);
    expect(report.snapshot()).toMatchObject({
      status: 'REJECTED',
      reviewedBy: OFFICER,
      reviewedAt: NOW,
      rejectionReason: 'Photo shows another place',
    });
  });

  it('UC-3 A2/H8: a blank reason is refused and the report stays Pending', () => {
    const report = aReport();
    expect(() => report.reject(OFFICER, '   ', NOW)).toThrow(ValidationError);
    expect(report.status).toBe('PENDING');
  });

  it('refuses a report that was already reviewed', () => {
    const report = aReport({ status: 'VERIFIED' });
    expect(() => report.reject(OFFICER, 'late', NOW)).toThrow(ConflictError);
  });
});

describe('HazardReport.amend', () => {
  const photo = { url: '/api/hazard-reports/photos/r-1.jpg', mime: 'image/jpeg', bytes: 10 };

  it('UC-3 E3: replaces the description and keeps the old photo when no new one came', () => {
    const report = aReport({ photo });
    report.amend({ description: 'Now knee deep', capturedAt: minutesAfter(5) });
    expect(report.snapshot()).toMatchObject({ description: 'Now knee deep', photo });
  });

  it('UC-3 E3: replaces the photo when a new one came', () => {
    const report = aReport({ photo });
    const newer = { ...photo, url: '/api/hazard-reports/photos/r-1b.jpg' };
    report.amend({ description: 'x', photo: newer, capturedAt: minutesAfter(5) });
    expect(report.snapshot().photo).toEqual(newer);
  });

  it('UC-3 E3/H6: keeps the earlier capture time when the update is older (offline report arriving late)', () => {
    const report = aReport();
    report.amend({ description: 'x', capturedAt: minutesAfter(-10) });
    expect(report.capturedAt).toEqual(minutesAfter(-10));
  });

  it('UC-3 E3: keeps the existing capture time when the update is newer', () => {
    const report = aReport();
    report.amend({ description: 'x', capturedAt: minutesAfter(10) });
    expect(report.capturedAt).toEqual(BASE_TIME);
  });

  it('refuses to amend a report an officer has already reviewed', () => {
    const report = aReport({ status: 'VERIFIED' });
    expect(() => report.amend({ description: 'x', capturedAt: BASE_TIME })).toThrow(ConflictError);
  });
});

describe('HazardReport state handling', () => {
  it('assignTo sets the cluster id', () => {
    const report = aReport();
    report.assignTo('cluster-1');
    expect(report.clusterId).toBe('cluster-1');
  });

  it('exposes the identifying fields', () => {
    const report = aReport();
    expect(report.id).toBe('r-1');
    expect(report.reporterId).toBe('citizen-1');
    expect(report.location).toMatchObject(KALUTARA);
  });

  it('restore copies its input, so later changes to the input do not leak in', () => {
    const state = aReport().snapshot();
    const report = HazardReport.restore(state);
    state.description = 'tampered';
    expect(report.snapshot().description).toBe('Water is rising');
  });

  it('snapshot returns a copy', () => {
    const report = aReport();
    const copy = report.snapshot();
    copy.description = 'tampered';
    expect(report.snapshot().description).toBe('Water is rising');
  });
});
