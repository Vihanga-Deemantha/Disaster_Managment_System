import { act, fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { en } from '@/shared/i18n/messages.en';
import { AlertDetailScreen } from '../screens/AlertDetailScreen';
import { anAlert, at, HOUR } from '../testing/fakes';
import { renderInbox, type InboxOptions } from '../testing/renderInbox';

async function open(alertId: string, options: InboxOptions = {}) {
  const onBack = jest.fn();
  const view = await renderInbox(<AlertDetailScreen alertId={alertId} onBack={onBack} />, options);
  return { ...view, onBack };
}

describe('AlertDetailScreen', () => {
  it('shows the whole message, where the warning applies and for how long', async () => {
    await open('A-1', {
      alerts: [
        anAlert({
          message:
            'Flood warning: water is rising. Move to higher ground now. Do not cross flooded roads.',
          validFrom: at(-30 * 60_000),
          validTo: at(26 * HOUR),
          deliveredAt: at(-5 * 60_000),
        }),
      ],
    });

    expect(
      screen.getByText(
        'Flood warning: water is rising. Move to higher ground now. Do not cross flooded roads.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(en['alerts.detail.area'])).toBeTruthy();
    expect(screen.getByText('Gampaha')).toBeTruthy();
    expect(screen.getByText('Today, 14:00')).toBeTruthy();
    expect(screen.getByText('9 Oct, 16:30')).toBeTruthy();
    expect(screen.getByText('Today, 14:25')).toBeTruthy();
    expect(screen.getByRole('header', { name: en['hazard.FLOOD'] })).toBeTruthy();
  });

  it('shows the severity and whether the warning is active', async () => {
    await open('A-1', { alerts: [anAlert({ severity: 'CRITICAL' })] });

    expect(screen.getAllByText(en['severity.CRITICAL']).length).toBeGreaterThan(0);
    expect(screen.getByText(en['alerts.status.active'])).toBeTruthy();
  });

  it('says a warning has expired, and when one has not started yet', async () => {
    await open('A-old', {
      alerts: [anAlert({ alertId: 'A-old', validFrom: at(-3 * HOUR), validTo: at(-HOUR) })],
    });
    expect(screen.getByText(en['alerts.status.expired'])).toBeTruthy();
  });

  it('shows a warning that has not started yet with its start time', async () => {
    await open('A-soon', {
      alerts: [anAlert({ alertId: 'A-soon', validFrom: at(2 * HOUR), validTo: at(4 * HOUR) })],
    });

    expect(screen.getByText('Starts Today, 16:30')).toBeTruthy();
  });

  it('marks the warning as read as soon as it is opened, and remembers that', async () => {
    const { poller, storage } = await open('A-1', {
      alerts: [anAlert(), anAlert({ alertId: 'A-2' })],
    });

    expect(poller.getState().readIds.has('A-1')).toBe(true);
    expect(poller.getState().unreadCount).toBe(1);
    expect(storage.stored?.readIds).toEqual(['A-1']);
  });

  it('names a river basin as the DMC wrote it, next to the district', async () => {
    await open('A-1', {
      alerts: [
        anAlert({
          areas: [
            { areaId: 'GAMPAHA', type: 'DISTRICT', name: 'Gampaha', district: 'GAMPAHA' },
            {
              areaId: 'kelani',
              type: 'RIVER_BASIN',
              name: 'Kelani Ganga basin',
              district: 'COLOMBO',
            },
          ],
        }),
      ],
    });

    expect(screen.getByText('Gampaha, Kelani Ganga basin')).toBeTruthy();
  });

  it('shows a Sinhala message in Sinhala, whatever language the app is in', async () => {
    await open('A-1', {
      alerts: [
        anAlert({ language: 'SI', message: 'ගම්පහ ගංවතුර අනතුරු ඇඟවීම: දැන්ම උස් බිම්වලට යන්න.' }),
      ],
    });

    expect(screen.getByText('ගම්පහ ගංවතුර අනතුරු ඇඟවීම: දැන්ම උස් බිම්වලට යන්න.')).toBeTruthy();
  });

  it('calls a hazard it does not know a plain hazard, rather than hiding the warning', async () => {
    await open('A-1', { alerts: [anAlert({ hazardType: 'OTHER' })] });

    expect(screen.getByRole('header', { name: en['hazard.OTHER'] })).toBeTruthy();
  });

  it('dials the emergency hotline', async () => {
    const dial = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await open('A-1', { alerts: [anAlert()] });

    fireEvent.press(screen.getByRole('button', { name: en['alerts.detail.callHotline'] }));

    expect(dial).toHaveBeenCalledWith('tel:117');
    dial.mockRestore();
  });

  it('says so, and offers the way back, when the warning is not on the phone', async () => {
    const { onBack, poller } = await open('A-missing', { alerts: [anAlert()] });

    expect(screen.getByText(en['alerts.detail.notFound'])).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: en['alerts.detail.backToList'] }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(poller.getState().readIds.size).toBe(0);
  });

  it('finds the warning once the list arrives, when it was opened before the first fetch finished', async () => {
    const { gateway } = await open('A-1', { alerts: [anAlert()], holdFirstFetch: true });
    expect(screen.getByText(en['alerts.detail.notFound'])).toBeTruthy();

    await act(async () => gateway.letThrough());

    expect(screen.queryByText(en['alerts.detail.notFound'])).toBeNull();
    expect(screen.getByRole('header', { name: en['hazard.FLOOD'] })).toBeTruthy();
  });
});
