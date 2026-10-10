import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithApp } from '@/shared/testing/renderWithApp';
import { en } from '@/shared/i18n/messages.en';
import { MapPin } from '../components/MapPin';

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
const point = { lat: 6.5854, lng: 79.9607 };
const message = (data: string) =>
  fireEvent(screen.getByTestId('report-map'), 'message', {
    nativeEvent: { data },
  });
describe('UC-3 E1: map pin', () => {
  it('accepts valid selections only while editable and keeps coordinates visible', async () => {
    const onPin = jest.fn();
    const ui = await renderWithApp(
      <MapPin centre={point} pin={point} editable={false} onPin={onPin} />,
    );
    expect(screen.getByText('6.58540, 79.96070')).toBeTruthy();
    message('{"type":"PIN","lat":6.6,"lng":80}');
    expect(onPin).not.toHaveBeenCalled();
    ui.unmount();
    await renderWithApp(<MapPin centre={point} pin={point} editable onPin={onPin} />);
    message('bad');
    message('{"type":"PIN","lat":100,"lng":80}');
    expect(onPin).not.toHaveBeenCalled();
    message('{"type":"PIN","lat":6.6,"lng":80}');
    expect(onPin).toHaveBeenCalledWith({ lat: 6.6, lng: 80 });
  });
  it('explains map failures without inventing a pin and offers a retry', async () => {
    const onPin = jest.fn();
    await renderWithApp(<MapPin centre={point} editable onPin={onPin} />);
    message('{"type":"ERROR"}');
    expect(screen.getByText(en['reports.location.mapUnavailable'])).toBeTruthy();
    expect(onPin).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: en['reports.location.reloadMap'] }));
    expect(screen.queryByText(en['reports.location.mapUnavailable'])).toBeNull();
    fireEvent(screen.getByTestId('report-map'), 'error');
    expect(screen.getByText(en['reports.location.mapUnavailable'])).toBeTruthy();
  });
});
