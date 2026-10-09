import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { aMe, renderWithApp } from '@/shared/testing/renderWithApp';
import { en } from '@/shared/i18n/messages.en';
import { ReportHazardForm } from '../screens/ReportHazardScreen';
import { syncHarness } from '../testing/syncHarness';
import type { QueuedReport, UploadOutcome } from '../offline/types';
import type { PhotoPickResult } from '../adapters/ExpoPhotoPicker';

jest.mock('../composition', () => ({ reportDependencies: {} }));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
function setup(outcome: UploadOutcome = { kind: 'DELIVERED', via: 'CREATED', reportId: 'r-1' }) {
  const calls: QueuedReport[] = [];
  const runtime = syncHarness();
  runtime.session.currentUserId.mockResolvedValue('user-1');
  runtime.uploader.upload.mockImplementation(async (entry) => {
    calls.push(entry);
    return outcome;
  });
  const deps = {
    queue: runtime.queue,
    sync: runtime.sync,
    enableNotifications: jest.fn(async () => 'GRANTED' as const),
    location: {
      requestPermission: async () => true,
      current: async () => ({ lat: 6.5854, lng: 79.9607 }),
      lastKnown: async () => undefined,
    },
    photos: {
      pick: async (): Promise<PhotoPickResult> => ({
        kind: 'PICKED',
        photo: { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', fileSize: 100 },
      }),
    },
  };
  return { calls, deps, runtime };
}
describe('UC-3 steps 1–7: Report form', () => {
  it('UC-3 E1: submits a denied-GPS report only after an explicit manual pin', async () => {
    const h = setup();
    h.deps.location.requestPermission = async () => false;
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    await screen.findByText(en['reports.location.denied']);
    fireEvent.press(screen.getByRole('radio', { name: 'Flood' }));
    expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeDisabled();
    fireEvent(screen.getByTestId('report-map'), 'message', {
      nativeEvent: { data: '{"type":"PIN","lat":6.6,"lng":80}' },
    });
    fireEvent.press(screen.getByRole('button', { name: en['reports.submit'] }));
    await screen.findByText(en['reports.sent']);
    expect(h.calls[0].location).toEqual({ lat: 6.6, lng: 80, source: 'MANUAL' });
  });
  it('UC-3 E1: an adjusted GPS pin is submitted as MANUAL', async () => {
    const h = setup();
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    fireEvent.press(await screen.findByRole('button', { name: en['reports.location.adjust'] }));
    fireEvent(screen.getByTestId('report-map'), 'message', {
      nativeEvent: { data: '{"type":"PIN","lat":6.7,"lng":80.1}' },
    });
    fireEvent.press(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.press(screen.getByRole('button', { name: en['reports.submit'] }));
    await screen.findByText(en['reports.sent']);
    expect(h.calls[0].location).toEqual({ lat: 6.7, lng: 80.1, source: 'MANUAL' });
  });
  it('UC-3 E2: continues without a rejected replacement photo, preserving the form', async () => {
    const h = setup();
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Flood' }));
    fireEvent.changeText(screen.getByLabelText(en['reports.description']), 'Water rising');
    fireEvent.press(screen.getByRole('button', { name: en['reports.photo.gallery'] }));
    await screen.findByLabelText(en['reports.photo.preview']);
    h.deps.photos.pick = async () => ({
      kind: 'PICKED',
      photo: {
        uri: 'file:///huge.jpg',
        fileSize: 6 * 1024 * 1024,
        mimeType: 'image/jpeg',
      },
    });
    fireEvent.press(screen.getByRole('button', { name: en['reports.photo.gallery'] }));
    const button = await screen.findByRole('button', { name: en['reports.photo.continueWithout'] });
    expect(screen.getByLabelText(en['reports.photo.preview'])).toBeTruthy();
    fireEvent.press(button);
    expect(screen.queryByLabelText(en['reports.photo.preview'])).toBeNull();
    expect(screen.getByDisplayValue('Water rising')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: en['reports.submit'] }));
    await screen.findByText(en['reports.sent']);
    expect(h.calls[0]).toMatchObject({ hazardType: 'FLOOD', description: 'Water rising' });
    expect(h.calls[0].photo).toBeUndefined();
  });
  it('UC-3 E2: replaces a rejected photo by retaking a valid one', async () => {
    const h = setup();
    h.deps.photos.pick = async () => ({
      kind: 'PICKED',
      photo: {
        uri: 'file:///huge.jpg',
        fileSize: 6 * 1024 * 1024,
        mimeType: 'image/jpeg',
      },
    });
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    fireEvent.press(screen.getByRole('button', { name: en['reports.photo.gallery'] }));
    await screen.findByRole('button', { name: en['reports.photo.retake'] });
    expect(screen.queryByLabelText(en['reports.photo.preview'])).toBeNull();
    h.deps.photos.pick = async () => ({
      kind: 'PICKED',
      photo: {
        uri: 'file:///new.jpg',
        fileSize: 100,
        mimeType: 'image/jpeg',
      },
    });
    fireEvent.press(screen.getByRole('button', { name: en['reports.photo.retake'] }));
    await screen.findByLabelText(en['reports.photo.preview']);
    expect(screen.queryByRole('button', { name: en['reports.photo.continueWithout'] })).toBeNull();
  });
  it('expires a refused session and never treats authentication failure as delivery', async () => {
    const h = setup({ kind: 'AUTH_REQUIRED' });
    const expire = jest.fn(async () => undefined);
    await renderWithApp(
      <ReportHazardForm ownerId="user-1" deps={h.deps} onSessionExpired={expire} />,
    );
    fireEvent.press(screen.getByRole('radio', { name: 'Flood' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeEnabled(),
    );
    fireEvent.press(screen.getByRole('button', { name: en['reports.submit'] }));
    await screen.findByText(en['reports.authRequired']);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(en['reports.sent'])).toBeNull();
  });
  it('rejects a GPS fix outside Sri Lanka and explains why Submit is disabled', async () => {
    const h = setup();
    h.deps.location.current = async () => ({ lat: 0, lng: 0 });
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    await screen.findByText(en['reports.LOCATION_OUTSIDE_SRI_LANKA']);
    fireEvent.press(screen.getByRole('radio', { name: 'Flood' }));
    expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeDisabled();
  });
  it('shows denied camera access and cancellation preserves an attached image', async () => {
    const h = setup();
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    fireEvent.press(screen.getByRole('button', { name: en['reports.photo.gallery'] }));
    await screen.findByLabelText(en['reports.photo.preview']);
    h.deps.photos.pick = async () => ({ kind: 'CANCELLED' });
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: en['reports.photo.gallery'] })),
    );
    expect(screen.getByLabelText(en['reports.photo.preview'])).toBeTruthy();
    h.deps.photos.pick = async () => ({ kind: 'DENIED' });
    fireEvent.press(screen.getByRole('button', { name: en['reports.photo.camera'] }));
    await screen.findByText(en['reports.photo.denied']);
  });
  it('requires hazard and location, submits a validated photo and description, and confirms delivery', async () => {
    const h = setup();
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />, { signedInAs: aMe() });
    expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeDisabled();
    fireEvent.press(screen.getByRole('radio', { name: 'Flood' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeEnabled(),
    );
    fireEvent.changeText(screen.getByLabelText(en['reports.description']), ' Water rising ');
    fireEvent.press(screen.getByRole('button', { name: en['reports.photo.camera'] }));
    await screen.findByLabelText(en['reports.photo.preview']);
    fireEvent.press(screen.getByRole('button', { name: en['reports.submit'] }));
    await screen.findByText(en['reports.sent']);
    expect(h.calls[0]).toMatchObject({
      ownerId: 'user-1',
      description: 'Water rising',
      photo: { uri: 'file:///documents/client-1-photo.jpg' },
      location: { source: 'GPS' },
    });
    fireEvent.press(screen.getByRole('button', { name: en['reports.another'] }));
    expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeDisabled();
  });
  it('keeps the form on connection failure and shows an honest retry message', async () => {
    const h = setup({ kind: 'RETRY' });
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.changeText(screen.getByLabelText(en['reports.description']), 'Tree down');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeEnabled(),
    );
    fireEvent.press(screen.getByRole('button', { name: en['reports.submit'] }));
    await screen.findByText(en['reports.savedOffline']);
    expect(screen.getByDisplayValue('Tree down')).toBeTruthy();
    expect(screen.queryByText(en['reports.sent'])).toBeNull();
    expect(h.deps.enableNotifications).not.toHaveBeenCalled();
    expect(screen.getByText(en['reports.notificationsReason'])).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: en['reports.enableNotifications'] }));
    expect(h.deps.enableNotifications).toHaveBeenCalledTimes(1);
    await screen.findByText(en['reports.notifications.GRANTED']);
  });
  it('retains the form and reports a failed disk write without claiming it was saved', async () => {
    const h = setup();
    jest.spyOn(h.runtime.storage, 'save').mockRejectedValueOnce(new Error('disk full'));
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.changeText(screen.getByLabelText(en['reports.description']), 'Tree down');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeEnabled(),
    );
    fireEvent.press(screen.getByRole('button', { name: en['reports.submit'] }));
    await screen.findByText(en['reports.storageError']);
    expect(screen.getByDisplayValue('Tree down')).toBeTruthy();
    expect(screen.queryByText(en['reports.savedOffline'])).toBeNull();
    expect(h.calls).toEqual([]);
  });
  it('does not use a fallback coordinate as report evidence after permission denial', async () => {
    const h = setup();
    h.deps.location.requestPermission = async () => false;
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Flood' }));
    await screen.findByText(en['reports.location.denied']);
    expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeDisabled();
    expect(h.calls).toEqual([]);
  });
  it('rejects an oversized gallery image, supports removal, and counts Unicode characters', async () => {
    const h = setup();
    h.deps.photos.pick = async () => ({
      kind: 'PICKED',
      photo: { uri: 'file:///large.jpg', mimeType: 'image/jpeg', fileSize: 6 * 1024 * 1024 },
    });
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    fireEvent.press(screen.getByRole('button', { name: en['reports.photo.gallery'] }));
    await screen.findByText(en['reports.PHOTO_TOO_LARGE']);
    expect(screen.queryByLabelText(en['reports.photo.preview'])).toBeNull();
    h.deps.photos.pick = async () => ({
      kind: 'PICKED',
      photo: { uri: 'file:///ok.jpg', mimeType: 'image/jpeg', fileSize: 100 },
    });
    fireEvent.press(screen.getByRole('button', { name: en['reports.photo.gallery'] }));
    await screen.findByLabelText(en['reports.photo.preview']);
    fireEvent.press(screen.getByRole('button', { name: en['reports.photo.remove'] }));
    expect(screen.queryByLabelText(en['reports.photo.preview'])).toBeNull();
    fireEvent.changeText(screen.getByLabelText(en['reports.description']), '🌧'.repeat(501));
    expect(screen.getByText('501 / 500')).toBeTruthy();
    expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeDisabled();
  });
  it('offers an explicit choice for a suspected duplicate instead of reporting success', async () => {
    const h = setup({ kind: 'DUPLICATE_SUSPECTED', existingReportId: 'old' });
    await renderWithApp(<ReportHazardForm ownerId="user-1" deps={h.deps} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Flood' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: en['reports.submit'] })).toBeEnabled(),
    );
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: en['reports.submit'] })),
    );
    expect(screen.getByText(en['reports.duplicate'])).toBeTruthy();
    expect(screen.getByRole('button', { name: en['reports.duplicate.update'] })).toBeTruthy();
    expect(screen.queryByText(en['reports.sent'])).toBeNull();
  });
});
