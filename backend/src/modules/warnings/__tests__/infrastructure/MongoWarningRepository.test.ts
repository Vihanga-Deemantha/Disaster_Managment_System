import mongoose from 'mongoose';
import { clearDatabase, connectTestMongo } from '@shared/testing/mongo';
import { MongoWarningRepository } from '../../infrastructure/MongoWarningRepository';
import { WarningModel } from '../../infrastructure/models';
import { aTargetArea, aWarning, HOUR, MESSAGES, NOW } from '../../testing/builders';

let teardown: () => Promise<void>;
const repository = new MongoWarningRepository();

beforeAll(async () => {
  teardown = await connectTestMongo();
  await WarningModel.init();
});
afterAll(async () => teardown());
beforeEach(async () => clearDatabase());

describe('UC-1 persistence: MongoWarningRepository', () => {
  it('stores a warning and reads back exactly what was stored', async () => {
    const warning = aWarning({
      sourceClusterId: 'cluster-7',
      targetAreas: [
        aTargetArea({
          areaId: 'basin-kelani',
          type: 'RIVER_BASIN',
          name: 'Kelani Ganga',
          boundary: [
            { lat: 6.8, lng: 79.8 },
            { lat: 6.8, lng: 80.0 },
            { lat: 7.0, lng: 80.0 },
          ],
        }),
      ],
    });
    warning.approve('usr-dmc-1', NOW);

    await repository.insert(warning);

    expect((await repository.findById('W-1'))?.snapshot()).toEqual(warning.snapshot());
  });

  it('keeps a draft with empty Sinhala and Tamil messages as it is', async () => {
    await repository.insert(aWarning({ messages: { SI: '', TA: '', EN: MESSAGES.EN } }));

    const stored = await repository.findById('W-1');

    expect(stored?.snapshot().messages).toEqual({ SI: '', TA: '', EN: MESSAGES.EN });
  });

  it('does not add a version key of its own: the warning’s own version is the only one', async () => {
    await repository.insert(aWarning());

    const raw = await mongoose.connection.collection('warnings').findOne({ _id: 'W-1' as never });

    expect(raw).toMatchObject({ version: 1 });
    expect(raw && '__v' in raw).toBe(false);
  });

  it('answers null for a warning that does not exist', async () => {
    expect(await repository.findById('nope')).toBeNull();
  });

  it('lists warnings newest first, optionally of one status', async () => {
    await repository.insert(aWarning({ warningId: 'W-old' }, NOW));
    await repository.insert(aWarning({ warningId: 'W-new' }, new Date(NOW.getTime() + 2 * HOUR)));
    const rejected = aWarning({ warningId: 'W-mid' }, new Date(NOW.getTime() + HOUR));
    rejected.reject('usr-dmc-1', 'Duplicate', NOW);
    await repository.insert(rejected);

    expect((await repository.findByStatus()).map((w) => w.warningId)).toEqual([
      'W-new',
      'W-mid',
      'W-old',
    ]);
    expect((await repository.findByStatus('PENDING_APPROVAL')).map((w) => w.warningId)).toEqual([
      'W-new',
      'W-old',
    ]);
    expect((await repository.findByStatus('REJECTED')).map((w) => w.warningId)).toEqual(['W-mid']);
    expect(await repository.findByStatus('ISSUED')).toEqual([]);
  });

  it('finds the draft that came from a UC-3 cluster', async () => {
    await repository.insert(aWarning({ warningId: 'W-a', sourceClusterId: 'cluster-1' }));
    await repository.insert(aWarning({ warningId: 'W-b', sourceClusterId: 'cluster-2' }));
    await repository.insert(aWarning({ warningId: 'W-c' }));

    expect((await repository.findBySourceCluster('cluster-2'))?.warningId).toBe('W-b');
    expect(await repository.findBySourceCluster('cluster-9')).toBeNull();
  });

  it('refuses a second draft for the same cluster, even if the handler were raced', async () => {
    await repository.insert(aWarning({ warningId: 'W-a', sourceClusterId: 'cluster-1' }));

    await expect(
      repository.insert(aWarning({ warningId: 'W-b', sourceClusterId: 'cluster-1' })),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows any number of warnings that came from no cluster', async () => {
    await repository.insert(aWarning({ warningId: 'W-a' }));
    await expect(repository.insert(aWarning({ warningId: 'W-b' }))).resolves.toBeUndefined();
  });
});

describe('UC-1 A2 / BR5: MongoWarningRepository.save is compare-and-set', () => {
  it('stores the change when the version is the one the caller loaded', async () => {
    await repository.insert(aWarning());
    const loaded = (await repository.findById('W-1'))!;
    loaded.update({ severity: 'CRITICAL' }, NOW);

    expect(await repository.save(loaded, 1)).toBe(true);

    expect((await repository.findById('W-1'))?.snapshot()).toMatchObject({
      severity: 'CRITICAL',
      version: 2,
    });
  });

  it('refuses a change made from an out-of-date copy, and keeps what is stored', async () => {
    await repository.insert(aWarning());
    const first = (await repository.findById('W-1'))!;
    const second = (await repository.findById('W-1'))!;
    first.update({ severity: 'LOW' }, NOW);
    second.update({ severity: 'CRITICAL' }, NOW);
    await repository.save(first, 1);

    expect(await repository.save(second, 1)).toBe(false);

    expect((await repository.findById('W-1'))?.severity).toBe('LOW');
  });

  it('lets exactly one of two parallel saves win', async () => {
    await repository.insert(aWarning());
    const copies = await Promise.all([repository.findById('W-1'), repository.findById('W-1')]);
    copies.forEach((copy, i) => copy!.update({ severity: i === 0 ? 'LOW' : 'CRITICAL' }, NOW));

    const outcomes = await Promise.all(copies.map((copy) => repository.save(copy!, 1)));

    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it('refuses to save a warning that was never stored', async () => {
    expect(await repository.save(aWarning({ warningId: 'ghost' }), 1)).toBe(false);
    expect(await repository.findById('ghost')).toBeNull();
  });

  it('removes a field that has been cleared, rather than keeping the old value', async () => {
    const warning = aWarning();
    warning.approve('usr-dmc-1', NOW);
    await repository.insert(warning);

    const raw = await mongoose.connection.collection('warnings').findOne({ _id: 'W-1' as never });

    expect(raw).toMatchObject({ approvedBy: 'usr-dmc-1' });
  });
});

describe('UC-1 citizen inbox: MongoWarningRepository.findByIds', () => {
  it('returns the warnings that exist, whatever their status, and skips ids nobody stored', async () => {
    const issued = aWarning({ warningId: 'W-issued' });
    issued.approve('usr-dmc-1', NOW);
    issued.markIssued(NOW);
    await repository.insert(issued);
    await repository.insert(aWarning({ warningId: 'W-pending' }));
    await repository.insert(aWarning({ warningId: 'W-other' }));

    const found = await repository.findByIds(['W-issued', 'W-pending', 'W-missing']);

    expect(found.map((w) => w.warningId).sort()).toEqual(['W-issued', 'W-pending']);
    expect(found.find((w) => w.warningId === 'W-issued')?.status).toBe('ISSUED');
    expect(found[0]?.snapshot().messages).toEqual(MESSAGES);
  });

  it('answers an empty list for an empty request', async () => {
    await repository.insert(aWarning());

    expect(await repository.findByIds([])).toEqual([]);
  });
});
