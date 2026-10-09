import { inflateSync } from 'node:zlib';
import { DEFAULT_CLUSTERING_CONFIG } from '../../modules/hazard-reports/domain/ClusteringConfig';
import { PhotoValidator } from '../../modules/hazard-reports/domain/PhotoValidator';
import { REPORT_HAZARD_TYPES } from '../../modules/hazard-reports/domain/types';
import type { AnalyticsStore } from '../../modules/analytics/application/ports';
import type { AlertFact, CatalogEvent } from '../../modules/analytics/domain/types';
import { ParallelAnalyticsStore } from '../demo/analytics';
import { ALL_WORKING, failingEvery, ScriptedGateways } from '../demo/gateways';
import { PHOTO_HEIGHT, PHOTO_WIDTH, placeholderPhoto } from '../demo/photos';

describe('placeholder photos', () => {
  const validator = new PhotoValidator(DEFAULT_CLUSTERING_CONFIG);

  it.each(REPORT_HAZARD_TYPES)('a %s picture is a real PNG that UC-3 accepts', (hazard) => {
    const png = placeholderPhoto(hazard, 3);

    expect(validator.check({ content: png, mimeType: 'image/png' })).toBeUndefined();
    expect(png.byteLength).toBeLessThan(DEFAULT_CLUSTERING_CONFIG.photoMaxBytes / 10);
    expect(png.readUInt32BE(16)).toBe(PHOTO_WIDTH);
    expect(png.readUInt32BE(20)).toBe(PHOTO_HEIGHT);
  });

  it('holds exactly one row of pixels per line, so a viewer can draw it', () => {
    const png = placeholderPhoto('FLOOD', 1);
    const headerLength = 8 + 12 + 13;
    const dataLength = png.readUInt32BE(headerLength);
    const compressed = png.subarray(headerLength + 8, headerLength + 8 + dataLength);

    expect(inflateSync(compressed).byteLength).toBe((PHOTO_WIDTH * 3 + 1) * PHOTO_HEIGHT);
  });

  it('draws the same picture for the same report and a different one for another', () => {
    expect(placeholderPhoto('LANDSLIDE', 7).equals(placeholderPhoto('LANDSLIDE', 7))).toBe(true);
    expect(placeholderPhoto('LANDSLIDE', 7).equals(placeholderPhoto('LANDSLIDE', 8))).toBe(false);
    expect(placeholderPhoto('LANDSLIDE', 7).equals(placeholderPhoto('FLOOD', 7))).toBe(false);
  });
});

describe('scripted gateways', () => {
  it('fails every n-th citizen on the named channels only, counting by the number in the account id', () => {
    const everyThirdPush = failingEvery(3, ['PUSH']);

    expect(everyThirdPush('PUSH', 'usr-uc1-citizen-009')).toBe(true);
    expect(everyThirdPush('PUSH', 'usr-uc1-citizen-010')).toBe(false);
    expect(everyThirdPush('SMS', 'usr-uc1-citizen-009')).toBe(false);
    expect(everyThirdPush('PUSH', 'an-id-without-a-number')).toBe(false);
  });

  it('follows whatever plan is current when a send is made', async () => {
    const gateways = new ScriptedGateways();
    const push = gateways.services.PUSH;
    const recipient = { citizenId: 'usr-uc1-citizen-003' } as never;
    const message = {} as never;

    expect(await push.isAvailable()).toBe(true);
    expect(await push.sendNotification(message, recipient)).toEqual({ status: 'DELIVERED' });

    gateways.plan = { down: new Set(['PUSH']), failsFor: failingEvery(3, ['PUSH']) };
    expect(await push.isAvailable()).toBe(false);
    expect(await push.sendNotification(message, recipient)).toEqual({
      status: 'FAILED',
      errorCode: 'CARRIER_REJECTED',
    });
    expect(await gateways.services.SMS.isAvailable()).toBe(true);

    gateways.plan = ALL_WORKING;
    expect(await push.isAvailable()).toBe(true);
  });
});

describe('ParallelAnalyticsStore', () => {
  function recordingStore(delayMs: number, failOn?: string) {
    const state = { running: 0, peak: 0, written: [] as string[] };
    const write = async (id: string) => {
      state.running += 1;
      state.peak = Math.max(state.peak, state.running);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      state.running -= 1;
      if (id === failOn) throw new Error(`cannot write ${id}`);
      state.written.push(id);
    };
    const store = {
      putAlert: (fact: AlertFact) => write(fact.id),
      putEvent: (event: CatalogEvent) => write(event.eventId),
      putOccupancy: (fact: { id: string }) => write(fact.id),
      putDispatch: (fact: { id: string }) => write(fact.id),
      saveReport: async () => undefined,
      reports: async () => [],
      list: async () => [],
      countReach: async () => [],
      occupancySeries: async () => [],
      distributionByDistrict: async () => [],
    } as unknown as AnalyticsStore;
    return { state, store };
  }

  const alert = (id: string) => ({ id }) as AlertFact;

  it('writes everything once drained, with no more than the limit in flight', async () => {
    const { state, store } = recordingStore(5);
    const parallel = new ParallelAnalyticsStore(store, 4);

    for (let n = 0; n < 40; n += 1) await parallel.putAlert(alert(`a-${n}`));
    await parallel.drain();

    expect(state.written).toHaveLength(40);
    expect(new Set(state.written).size).toBe(40);
    expect(state.peak).toBeLessThanOrEqual(4);
    expect(state.peak).toBeGreaterThan(1);
  });

  it('reports the first write that failed when drained, and still finishes the others', async () => {
    const { state, store } = recordingStore(1, 'a-3');
    const parallel = new ParallelAnalyticsStore(store, 8);

    for (let n = 0; n < 10; n += 1) await parallel.putAlert(alert(`a-${n}`));

    await expect(parallel.drain()).rejects.toThrow('cannot write a-3');
    expect(state.written).toHaveLength(9);
  });

  it('passes reads straight through', async () => {
    const { store } = recordingStore(0);
    const parallel = new ParallelAnalyticsStore(store);

    expect(await parallel.list()).toEqual([]);
    expect(await parallel.reports('someone')).toEqual([]);
    await expect(parallel.drain()).resolves.toBeUndefined();
  });
});
