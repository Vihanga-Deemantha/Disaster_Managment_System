import { answerDuplicate, sendWithoutPhoto, submitReport } from '../offline/submitReport';
import { aDraft } from '../testing/fakes';
import { delivered, syncHarness } from '../testing/syncHarness';

describe('UC-3 steps 5–7: journal before delivery', () => {
  it('does not enqueue or upload an invalid draft', async () => {
    const h = syncHarness();
    expect(await submitReport(h, 'citizen-1', { description: '' })).toEqual({
      kind: 'INVALID',
      problems: ['HAZARD_TYPE_REQUIRED', 'LOCATION_REQUIRED'],
    });
    expect(await h.queue.list()).toEqual([]);
    expect(h.calls).toEqual([]);
  });
  it('persists before trying upload and returns the journal id', async () => {
    const h = syncHarness();
    const capturedAt = h.clock.now().toISOString();
    jest.spyOn(h.sync, 'submitNow').mockImplementation(async (id) => {
      expect(await h.queue.get(id)).toMatchObject({
        capturedAt,
        ownerId: 'citizen-1',
        state: 'QUEUED',
      });
      return delivered;
    });
    expect(await submitReport(h, 'citizen-1', aDraft())).toEqual({
      ...delivered,
      clientReportId: 'client-1',
    });
  });
  it('never uploads or claims saved when writing the journal fails', async () => {
    const h = syncHarness();
    jest.spyOn(h.storage, 'save').mockRejectedValueOnce(new Error('full'));
    await expect(submitReport(h, 'citizen-1', aDraft())).rejects.toThrow('full');
    expect(h.calls).toEqual([]);
  });
  it('returns SAVED_OFFLINE with the persisted identity and capture time', async () => {
    const h = syncHarness();
    h.connectivity.isOnline.mockResolvedValue(false);
    expect(await submitReport(h, 'citizen-1', aDraft())).toEqual({
      kind: 'SAVED_OFFLINE',
      clientReportId: 'client-1',
    });
    expect(await h.queue.get('client-1')).toMatchObject({ ownerId: 'citizen-1', state: 'QUEUED' });
  });
  it.each(['UPDATE', 'NEW'] as const)(
    'E3: requeues a duplicate, clears old errors and preserves %s',
    async (action) => {
      const h = syncHarness();
      const entry = await h.queue.enqueue('citizen-1', aDraft());
      await h.queue.update(entry.clientReportId, {
        state: 'AWAITING_DECISION',
        existingReportId: 'server-1',
        problem: { code: 'old', message: 'old' },
      });
      h.outcomes.push({ kind: 'RETRY' });
      expect(await answerDuplicate(h, 'citizen-1', entry.clientReportId, action)).toEqual({
        kind: 'SAVED_OFFLINE',
      });
      expect(await h.queue.get(entry.clientReportId)).toMatchObject({
        state: 'QUEUED',
        duplicateAction: action,
      });
      expect((await h.queue.get(entry.clientReportId))?.existingReportId).toBeUndefined();
      expect((await h.queue.get(entry.clientReportId))?.problem).toBeUndefined();
    },
  );
  it('E2: removes rejected photo before sending without it', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue(
      'citizen-1',
      aDraft({ photo: { uri: 'cache', name: 'p.jpg', mimeType: 'image/jpeg', bytes: 2 } }),
    );
    await h.queue.update(entry.clientReportId, {
      state: 'NEEDS_ATTENTION',
      problem: { code: 'INVALID_PHOTO', message: 'Bad image' },
    });
    expect(await sendWithoutPhoto(h, 'citizen-1', entry.clientReportId)).toEqual(delivered);
    expect(h.calls[0].entry.photo).toBeUndefined();
    expect(h.photos.discarded).toEqual([entry.photo!.uri]);
  });
  it('protects another owner’s saved report from choice and photo mutations', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue(
      'citizen-2',
      aDraft({ photo: { uri: 'cache', name: 'p.jpg', mimeType: 'image/jpeg', bytes: 2 } }),
    );
    expect(await answerDuplicate(h, 'citizen-1', entry.clientReportId, 'NEW')).toEqual({
      kind: 'AUTH_REQUIRED',
    });
    expect(await sendWithoutPhoto(h, 'citizen-1', entry.clientReportId)).toEqual({
      kind: 'AUTH_REQUIRED',
    });
    expect(await h.queue.get(entry.clientReportId)).toEqual(entry);
    expect(h.photos.discarded).toEqual([]);
    expect(h.calls).toEqual([]);
  });
  it('recovery actions on an acknowledged report cannot recreate it', async () => {
    const h = syncHarness();
    expect(await answerDuplicate(h, 'citizen-1', 'absent', 'NEW')).toEqual({
      kind: 'ALREADY_SENT',
    });
    expect(await sendWithoutPhoto(h, 'citizen-1', 'absent')).toEqual({ kind: 'ALREADY_SENT' });
    expect(h.calls).toEqual([]);
  });
  it('keeps a duplicate choice made offline for the next drain', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue('citizen-1', aDraft());
    h.connectivity.isOnline.mockResolvedValue(false);
    expect(await answerDuplicate(h, 'citizen-1', entry.clientReportId, 'UPDATE')).toEqual({
      kind: 'SAVED_OFFLINE',
    });
    h.connectivity.isOnline.mockResolvedValue(true);
    await h.restart().run('MANUAL');
    expect(h.calls[0].options.duplicateAction).toBe('UPDATE');
  });
});
