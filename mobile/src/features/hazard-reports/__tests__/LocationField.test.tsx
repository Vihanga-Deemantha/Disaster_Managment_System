import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { renderWithApp } from '@/shared/testing/renderWithApp';
import { en } from '@/shared/i18n/messages.en';
import { LocationField } from '../components/LocationField';

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
const point = { lat: 6.5854, lng: 79.9607 };
describe('UC-3 E1: location recovery', () => {
  it('requires explicit confirmation of a genuine last-known position', async () => {
    const onPin = jest.fn();
    await renderWithApp(
      <LocationField
        state={{ status: 'MANUAL', reason: 'DENIED', center: point, lastKnown: point }}
        retry={jest.fn()}
        onPin={onPin}
        disabled={false}
      />,
    );
    expect(onPin).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: en['reports.location.useLastKnown'] }));
    expect(onPin).toHaveBeenCalledWith(point);
  });
  it('does not offer the default map centre as report evidence', async () => {
    await renderWithApp(
      <LocationField
        state={{ status: 'MANUAL', reason: 'UNAVAILABLE', center: point }}
        retry={jest.fn()}
        onPin={jest.fn()}
        disabled={false}
      />,
    );
    expect(screen.queryByRole('button', { name: en['reports.location.useLastKnown'] })).toBeNull();
  });
  it('requires Adjust pin before GPS can be changed', async () => {
    const onPin = jest.fn();
    await renderWithApp(
      <LocationField
        state={{ status: 'READY', location: { ...point, source: 'GPS' } }}
        retry={jest.fn()}
        onPin={onPin}
        disabled={false}
      />,
    );
    const select = () =>
      fireEvent(screen.getByTestId('report-map'), 'message', {
        nativeEvent: { data: '{"type":"PIN","lat":6.6,"lng":80}' },
      });
    select();
    expect(onPin).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: en['reports.location.adjust'] }));
    select();
    expect(onPin).toHaveBeenCalledWith({ lat: 6.6, lng: 80 });
  });
  it('ignores manual map selections and disables last-known confirmation while busy', async () => {
    const onPin = jest.fn();
    await renderWithApp(
      <LocationField
        state={{ status: 'MANUAL', reason: 'DENIED', center: point, lastKnown: point }}
        retry={jest.fn()}
        onPin={onPin}
        disabled
      />,
    );
    fireEvent(screen.getByTestId('report-map'), 'message', {
      nativeEvent: { data: '{"type":"PIN","lat":6.6,"lng":80}' },
    });
    expect(onPin).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: en['reports.location.useLastKnown'] }),
    ).toBeDisabled();
  });
  it('shows feedback when system settings cannot be opened', async () => {
    jest.spyOn(Linking, 'openSettings').mockRejectedValueOnce(new Error('unavailable'));
    await renderWithApp(
      <LocationField
        state={{ status: 'MANUAL', reason: 'DENIED', center: point }}
        retry={jest.fn()}
        onPin={jest.fn()}
        disabled={false}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: en['reports.location.settings'] }));
    await screen.findByText(en['reports.location.settingsFailed']);
  });
});
