import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithApp } from '@/shared/testing/renderWithApp';
import { InMemoryKeyValueStore } from '@/shared/testing/InMemoryKeyValueStore';
import { en } from '@/shared/i18n/messages.en';
import { MyReportsView } from '../screens/MyReportsScreen';
import { MyReportsCache } from '../adapters/MyReportsCache';
import { aDraft } from '../testing/fakes';
import { syncHarness } from '../testing/syncHarness';
import type { RemoteReport } from '../domain/mergeMyReports';
jest.mock('../composition', () => ({ getHazardReportsRuntime: jest.fn() }));
jest.mock('../background/syncTask', () => ({
  triggerSyncTaskForTesting: jest.fn(async () => false),
}));
function harness() {
  const h = syncHarness();
  const reports = { list: jest.fn(async (): Promise<RemoteReport[]> => []) };
  return { ...h, reports, cache: new MyReportsCache(new InMemoryKeyValueStore()) };
}
describe('UC-3 H10: My reports on the phone', () => {
  it('does not claim the server history is empty when offline with no cached list', async () => {
    const h = harness();
    h.connectivity.isOnline.mockResolvedValue(false);
    await renderWithApp(<MyReportsView ownerId="citizen-1" deps={h} />);
    await screen.findByText(
      'No reports are saved on this phone. Connect to load your submitted reports.',
    );
    expect(screen.queryByText('You have not reported anything yet.')).toBeNull();
  });
  it('distinguishes an empty successful list from loading', async () => {
    await renderWithApp(<MyReportsView ownerId="citizen-1" deps={harness()} />);
    await screen.findByText('You have not reported anything yet.');
    expect(screen.queryByText('Loading your reports…')).toBeNull();
  });
  it('shows delivery and review statuses, including a rejection reason', async () => {
    const h = harness();
    h.reports.list.mockResolvedValue(
      ['PENDING', 'VERIFIED', 'REJECTED'].map((status, index) => ({
        id: `r-${index}`,
        clientReportId: `remote-${index}`,
        hazardType: 'FLOOD',
        description: `Report ${index}`,
        capturedAt: '2026-10-09T03:30:00.000Z',
        status: status as RemoteReport['status'],
        rejectionReason: 'Location was incorrect',
      })),
    );
    await renderWithApp(<MyReportsView ownerId="citizen-1" deps={h} />);
    await screen.findByText('Pending review');
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('Location was incorrect')).toBeTruthy();
  });
  it('keeps a duplicate visible until the reporter chooses and sends the saved choice', async () => {
    const h = harness();
    const saved = await h.queue.enqueue('citizen-1', aDraft());
    await h.queue.update(saved.clientReportId, {
      state: 'AWAITING_DECISION',
      existingReportId: 'earlier',
    });
    await renderWithApp(<MyReportsView ownerId="citizen-1" deps={h} />);
    await screen.findByText('Needs your choice');
    fireEvent.press(screen.getByRole('button', { name: en['reports.duplicate.update'] }));
    await waitFor(() => expect(h.calls).toHaveLength(1));
    expect(h.calls[0].options.duplicateAction).toBe('UPDATE');
    await waitFor(async () => expect(await h.queue.list()).toEqual([]));
    await screen.findByText(en['reports.sent']);
  });
  it('requires confirmation before discarding and never offers photo removal without a photo', async () => {
    const h = harness();
    const saved = await h.queue.enqueue('citizen-1', aDraft());
    await h.queue.update(saved.clientReportId, {
      state: 'NEEDS_ATTENTION',
      problem: { code: 'INVALID', message: 'Check location' },
    });
    await renderWithApp(<MyReportsView ownerId="citizen-1" deps={h} />);
    await screen.findByText('Check location');
    expect(screen.queryByRole('button', { name: 'Send without photo' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    expect(await h.queue.list()).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(await h.queue.list()).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.press(screen.getByRole('button', { name: 'Discard saved report' }));
    await waitFor(async () => expect(await h.queue.list()).toEqual([]));
  });
  it('lets the owner retry a rejected photo report without its photo', async () => {
    const h = harness();
    const saved = await h.queue.enqueue(
      'citizen-1',
      aDraft({
        photo: {
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          bytes: 100,
          name: 'photo.jpg',
        },
      }),
    );
    await h.queue.update(saved.clientReportId, {
      state: 'NEEDS_ATTENTION',
      problem: { code: 'INVALID_PHOTO', message: 'Unreadable image' },
    });
    await renderWithApp(<MyReportsView ownerId="citizen-1" deps={h} />);
    fireEvent.press(await screen.findByRole('button', { name: 'Send without photo' }));
    await waitFor(() => expect(h.calls).toHaveLength(1));
    expect(h.calls[0].entry.photo).toBeUndefined();
  });
  it('pull-to-refresh delivers queued reports and labels a completed system run', async () => {
    const h = harness();
    h.runs.push({
      trigger: 'OS_TASK',
      ranAt: '2026-10-09T03:30:00.000Z',
      uploaded: 2,
      remaining: 0,
    });
    await renderWithApp(<MyReportsView ownerId="citizen-1" deps={h} />);
    await screen.findByText(/by the system in the background/);
    const list = screen.getByTestId('my-reports-list');
    await act(async () => {
      await list.props.onRefresh();
    });
    await waitFor(() => expect(h.runs.at(-1)?.trigger).toBe('MANUAL'));
  });
  it('shows a journal error without claiming there are no reports', async () => {
    const h = harness();
    jest.spyOn(h.queue, 'list').mockRejectedValue(new Error('disk'));
    await renderWithApp(<MyReportsView ownerId="citizen-1" deps={h} />);
    await screen.findByText(/Could not read saved reports/);
    expect(screen.queryByText('You have not reported anything yet.')).toBeNull();
  });
});
