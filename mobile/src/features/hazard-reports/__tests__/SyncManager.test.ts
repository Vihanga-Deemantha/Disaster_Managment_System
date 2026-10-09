import { aDraft } from '../testing/fakes';
import { deferred, delivered, syncHarness } from '../testing/syncHarness';
import type { SyncTrigger, UploadOutcome } from '../offline/types';

describe('UC-3 A1: journal delivery', () => {
  it('logs an empty online run without uploading or notifying', async () => {
    const h = syncHarness();
    expect(await h.sync.run('OS_TASK')).toMatchObject({ uploaded: 0, remaining: 0 });
    expect(h.calls).toEqual([]);
    expect(h.sent).toEqual([]);
    expect(h.signIn).toEqual([]);
  });
  it('does not resend an entry another delivery removed while checking its photo', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue(
      'citizen-1',
      aDraft({ photo: { uri: 'cache', name: 'p.jpg', mimeType: 'image/jpeg', bytes: 8 } }),
    );
    jest.spyOn(h.photos, 'exists').mockImplementationOnce(async () => {
      await h.queue.remove(entry.clientReportId);
      return false;
    });
    expect(await h.sync.run('MANUAL')).toMatchObject({ uploaded: 0, remaining: 0 });
    expect(h.calls).toEqual([]);
  });
  it('OS_TASK announces completed delivery and the remaining sign-in requirement separately', async () => {
    const h = syncHarness();
    await h.queue.enqueue('citizen-1', aDraft());
    await h.queue.enqueue('citizen-1', aDraft());
    h.outcomes.push(delivered, { kind: 'AUTH_REQUIRED' });
    expect(await h.sync.run('OS_TASK')).toMatchObject({
      uploaded: 1,
      remaining: 1,
      stoppedBy: 'NO_SESSION',
    });
    expect(h.sent).toEqual([1]);
    expect(h.signIn).toEqual([1]);
  });
  it('H7: retries the same identity after acknowledgement cleanup could not be saved', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue('citizen-1', aDraft());
    h.uploader.upload.mockImplementationOnce(async (sending, options) => {
      h.calls.push({ entry: sending, options });
      jest.spyOn(h.storage, 'save').mockRejectedValueOnce(new Error('disk full'));
      return delivered;
    });
    await expect(h.sync.run('MANUAL')).rejects.toThrow('disk full');
    expect(await h.queue.get(entry.clientReportId)).toMatchObject({ state: 'UPLOADING' });
    h.outcomes.push({ ...delivered, via: 'ALREADY_RECEIVED' });
    expect(await h.restart().run('APP_FOREGROUND')).toMatchObject({ uploaded: 1, remaining: 0 });
    expect(h.calls.map((c) => c.entry.clientReportId)).toEqual([
      entry.clientReportId,
      entry.clientReportId,
    ]);
  });
  it('uploads oldest first, preserving identity, capture times and the stored photo until acknowledgement', async () => {
    const h = syncHarness();
    const first = await h.queue.enqueue(
      'citizen-1',
      aDraft({ photo: { uri: 'cache', name: 'p.jpg', mimeType: 'image/jpeg', bytes: 8 } }),
    );
    h.clock.advance(1000);
    const second = await h.queue.enqueue('citizen-1', aDraft());
    h.uploader.upload.mockImplementationOnce(async (entry, options) => {
      expect((await h.queue.get(entry.clientReportId))?.state).toBe('UPLOADING');
      expect(h.photos.discarded).toEqual([]);
      h.calls.push({ entry, options });
      return { ...delivered, via: 'ALREADY_RECEIVED' };
    });
    expect(await h.sync.run('RECONNECT')).toMatchObject({ uploaded: 2, remaining: 0 });
    expect(h.calls.map(({ entry }) => [entry.clientReportId, entry.capturedAt])).toEqual(
      [first, second].map((e) => [e.clientReportId, e.capturedAt]),
    );
    expect(h.calls.every((c) => c.options.syncedFromOffline)).toBe(true);
    expect(h.calls[0].entry.photo).toEqual(first.photo);
    expect(h.photos.discarded).toEqual([first.photo!.uri]);
    expect(await h.queue.list()).toEqual([]);
    expect(await h.runLog.last()).toEqual(h.runs[0]);
    expect(h.sent).toEqual([]);
  });
  it.each<UploadOutcome>([{ kind: 'RETRY' }, { kind: 'AUTH_REQUIRED' }])(
    'keeps the failed report and stops before later reports: %s',
    async (failure) => {
      const h = syncHarness();
      for (let i = 0; i < 3; i++) await h.queue.enqueue('citizen-1', aDraft());
      h.outcomes.push(delivered, failure);
      expect(await h.sync.run('MANUAL')).toMatchObject({
        uploaded: 1,
        remaining: 2,
        stoppedBy: failure.kind === 'RETRY' ? 'RETRY_LATER' : 'NO_SESSION',
      });
      expect(h.calls).toHaveLength(2);
      expect((await h.queue.list()).map((e) => [e.state, e.attempts])).toEqual([
        ['QUEUED', 1],
        ['QUEUED', 0],
      ]);
    },
  );
  it('D11: retains permanent rejection details and skips it on future drains', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue('citizen-1', aDraft());
    await h.queue.enqueue('citizen-1', aDraft());
    h.outcomes.push({ kind: 'REJECTED', code: 'INVALID_PHOTO', message: 'Unsupported photo' });
    expect(await h.sync.run('APP_FOREGROUND')).toMatchObject({ uploaded: 1, remaining: 1 });
    expect(await h.queue.get(entry.clientReportId)).toMatchObject({
      state: 'NEEDS_ATTENTION',
      problem: { code: 'INVALID_PHOTO', message: 'Unsupported photo' },
    });
    await h.sync.run('MANUAL');
    expect(h.calls).toHaveLength(2);
    expect(h.runs).toHaveLength(2);
  });
  it('does nothing offline, without probing the session, and logs the run', async () => {
    const h = syncHarness();
    h.connectivity.isOnline.mockResolvedValue(false);
    expect(await h.sync.run('MANUAL')).toMatchObject({
      uploaded: 0,
      remaining: 0,
      stoppedBy: 'OFFLINE',
    });
    expect(h.session.currentUserId).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
    expect(h.runs).toHaveLength(1);
  });
  it.each(['connectivity', 'session'] as const)(
    'retains reports when the %s probe throws',
    async (probe) => {
      const h = syncHarness();
      await h.queue.enqueue('citizen-1', aDraft());
      if (probe === 'connectivity') h.connectivity.isOnline.mockRejectedValue(new Error('offline'));
      else h.session.currentUserId.mockRejectedValue(new Error('offline'));
      expect(await h.sync.run('MANUAL')).toMatchObject({ stoppedBy: 'OFFLINE', remaining: 1 });
      expect(h.calls).toEqual([]);
    },
  );
  it('never uploads or includes another account in a signed-in run count', async () => {
    const h = syncHarness();
    const other = await h.queue.enqueue('citizen-2', aDraft());
    await h.queue.enqueue('citizen-1', aDraft());
    expect(await h.sync.run('MANUAL')).toMatchObject({ uploaded: 1, remaining: 0 });
    expect(await h.queue.list()).toEqual([other]);
    expect(h.calls[0].entry.ownerId).toBe('citizen-1');
    expect(await h.sync.submitNow(other.clientReportId)).toEqual({ kind: 'AUTH_REQUIRED' });
    expect(h.calls).toHaveLength(1);
  });
  it('H7: recovers UPLOADING after a runtime restart, with the same id and next attempt count', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue('citizen-1', aDraft());
    await h.queue.update(entry.clientReportId, { state: 'UPLOADING', attempts: 1 });
    h.outcomes.push({ ...delivered, via: 'ALREADY_RECEIVED' });
    expect(await h.restart().run('APP_FOREGROUND')).toMatchObject({ uploaded: 1, remaining: 0 });
    expect(h.calls[0].entry).toMatchObject({
      clientReportId: entry.clientReportId,
      capturedAt: entry.capturedAt,
      attempts: 2,
    });
  });
  it('sends without a photo only when its stored file has gone', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue(
      'citizen-1',
      aDraft({ photo: { uri: 'cache', name: 'p.jpg', mimeType: 'image/jpeg', bytes: 8 } }),
    );
    h.photos.lose(entry.photo!.uri);
    await h.sync.run('RECONNECT');
    expect(h.calls[0].entry.photo).toBeUndefined();
  });
  it.each<SyncTrigger>(['RECONNECT', 'APP_FOREGROUND', 'MANUAL', 'OS_TASK'])(
    'handles a parked duplicate during %s',
    async (trigger) => {
      const h = syncHarness();
      const entry = await h.queue.enqueue('citizen-1', aDraft());
      await h.queue.update(entry.clientReportId, {
        state: 'AWAITING_DECISION',
        existingReportId: 'existing',
      });
      expect(await h.sync.run(trigger)).toMatchObject({ uploaded: trigger === 'OS_TASK' ? 1 : 0 });
      expect(h.sent).toEqual(trigger === 'OS_TASK' ? [1] : []);
    },
  );
  it.each([0, 1])('OS_TASK requests sign-in only for a nonempty journal (%s)', async (count) => {
    const h = syncHarness();
    if (count) await h.queue.enqueue('citizen-1', aDraft());
    h.session.currentUserId.mockResolvedValue(undefined);
    expect(await h.sync.run('OS_TASK')).toMatchObject({
      stoppedBy: 'NO_SESSION',
      remaining: count,
    });
    expect(h.signIn).toEqual(count ? [1] : []);
  });
  it('joins concurrent drains and serializes an interactive submission behind them', async () => {
    const h = syncHarness();
    const first = await h.queue.enqueue('citizen-1', aDraft());
    const waiting = deferred<UploadOutcome>();
    const started = deferred<void>();
    h.uploader.upload.mockImplementationOnce(async (entry, options) => {
      h.calls.push({ entry, options });
      started.resolve();
      return waiting.promise;
    });
    const run = h.sync.run('MANUAL');
    expect(h.sync.run('OS_TASK')).toBe(run);
    await started.promise;
    const second = await h.queue.enqueue('citizen-1', aDraft());
    const submit = h.sync.submitNow(second.clientReportId);
    expect(h.calls).toHaveLength(1);
    waiting.resolve(delivered);
    await run;
    await submit;
    expect(h.calls.map((c) => c.entry.clientReportId)).toEqual([
      first.clientReportId,
      second.clientReportId,
    ]);
    expect(h.calls[1].options.syncedFromOffline).toBe(false);
    await h.sync.run('MANUAL');
    expect(h.runs).toHaveLength(2);
  });
});

describe('UC-3 steps 6–7: interactive journal upload', () => {
  it.each<UploadOutcome>([
    delivered,
    { kind: 'RETRY' },
    { kind: 'AUTH_REQUIRED' },
    { kind: 'DUPLICATE_SUSPECTED', existingReportId: 'existing' },
    { kind: 'REJECTED', code: 'INVALID_PHOTO', message: 'Bad photo' },
  ])('settles the journal honestly: %s', async (outcome) => {
    const h = syncHarness();
    const entry = await h.queue.enqueue('citizen-1', aDraft());
    h.outcomes.push(outcome);
    expect(await h.sync.submitNow(entry.clientReportId)).toEqual(
      outcome.kind === 'RETRY' ? { kind: 'SAVED_OFFLINE' } : outcome,
    );
    expect(h.calls[0].options.syncedFromOffline).toBe(false);
    const saved = await h.queue.get(entry.clientReportId);
    if (outcome.kind === 'DELIVERED') expect(saved).toBeUndefined();
    else
      expect(saved?.state).toBe(
        outcome.kind === 'DUPLICATE_SUSPECTED'
          ? 'AWAITING_DECISION'
          : outcome.kind === 'REJECTED'
            ? 'NEEDS_ATTENTION'
            : 'QUEUED',
      );
  });
  it('keeps offline reports and returns AUTH_REQUIRED while signed out', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue('citizen-1', aDraft());
    h.connectivity.isOnline.mockResolvedValue(false);
    expect(await h.sync.submitNow(entry.clientReportId)).toEqual({ kind: 'SAVED_OFFLINE' });
    h.connectivity.isOnline.mockResolvedValue(true);
    h.session.currentUserId.mockResolvedValue(undefined);
    expect(await h.sync.submitNow(entry.clientReportId)).toEqual({ kind: 'AUTH_REQUIRED' });
    expect(await h.sync.submitNow('absent')).toEqual({ kind: 'ALREADY_SENT' });
    expect(h.calls).toEqual([]);
    expect((await h.queue.list())[0].attempts).toBe(0);
  });
  it('E3: persists an explicit choice across retry and runtime restart', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue('citizen-1', aDraft());
    h.outcomes.push({ kind: 'RETRY' });
    await h.sync.submitNow(entry.clientReportId, 'NEW');
    await h.restart().run('RECONNECT');
    expect(h.calls.map((c) => c.options.duplicateAction)).toEqual(['NEW', 'NEW']);
  });
  it('a thrown uploader error retains the report and does not break later work', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue('citizen-1', aDraft());
    h.uploader.upload.mockRejectedValueOnce(new Error('network'));
    expect(await h.sync.submitNow(entry.clientReportId)).toEqual({ kind: 'SAVED_OFFLINE' });
    expect(await h.sync.submitNow(entry.clientReportId)).toEqual(delivered);
  });
  it('never sends before the uploading state is persisted; the lane recovers after storage failure', async () => {
    const h = syncHarness();
    const entry = await h.queue.enqueue('citizen-1', aDraft());
    jest.spyOn(h.storage, 'save').mockRejectedValueOnce(new Error('disk full'));
    await expect(h.sync.run('MANUAL')).rejects.toThrow('disk full');
    expect(h.calls).toEqual([]);
    expect(await h.sync.run('MANUAL')).toMatchObject({ uploaded: 1 });
    expect(await h.sync.submitNow(entry.clientReportId)).toEqual({ kind: 'ALREADY_SENT' });
  });
});
