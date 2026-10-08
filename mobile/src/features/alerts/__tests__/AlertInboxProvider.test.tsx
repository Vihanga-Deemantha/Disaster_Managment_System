import { act, render, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import { useAlertInbox } from '../hooks/AlertInboxProvider';
import { anAlert, HOUR, NOW, snapshotOf } from '../testing/fakes';
import { renderInbox, type InboxOptions } from '../testing/renderInbox';

function Probe() {
  const { state, serverNow } = useAlertInbox();
  return (
    <>
      <Text testID="count">{String(state.alerts.length)}</Text>
      <Text testID="now">{String(serverNow())}</Text>
    </>
  );
}

const open = (options: InboxOptions = {}) => renderInbox(<Probe />, options);

/** The listeners the provider registered for the app moving to and from the background. */
function appStateListeners(): Array<(state: string) => void> {
  return (AppState.addEventListener as jest.Mock).mock.calls
    .filter(([event]) => event === 'change')
    .map(([, listener]) => listener as (state: string) => void);
}

const moveTo = async (state: string) => {
  const listener = appStateListeners().at(-1) as (state: string) => void;
  await act(async () => listener(state));
};

describe('AlertInboxProvider: polling only while the app is open', () => {
  it('fetches when the app opens, and keeps fetching on a timer of 15 seconds', async () => {
    const { gateway, scheduler } = await open({ alerts: [anAlert()] });

    expect(gateway.calls).toBe(1);
    expect(scheduler.running).toBe(true);
    expect(scheduler.intervals).toEqual([15_000]);
    expect(screen.getByTestId('count').props.children).toBe('1');
  });

  it('stops fetching when the app goes to the background', async () => {
    const { gateway, scheduler } = await open({ alerts: [anAlert()] });

    await moveTo('background');
    await act(async () => scheduler.tick());

    expect(scheduler.running).toBe(false);
    expect(gateway.calls).toBe(1);
  });

  it('fetches again at once, and resumes the timer, when the app comes back to the front', async () => {
    const { gateway, scheduler } = await open({ alerts: [anAlert()] });
    await moveTo('background');

    await moveTo('active');

    expect(scheduler.running).toBe(true);
    expect(gateway.calls).toBe(2);
  });

  it('keeps polling when the app is briefly inactive, as on the iOS app switcher', async () => {
    const { scheduler } = await open();

    await moveTo('inactive');

    expect(scheduler.running).toBe(true);
  });

  it('stops for good when the screen goes away (signing out leaves the tabs)', async () => {
    const { scheduler, unmount } = await open();

    unmount();

    expect(scheduler.running).toBe(false);
    expect(scheduler.cancelled).toBeGreaterThan(0);
  });
});

describe('AlertInboxProvider: banners and the server’s clock', () => {
  it('opens an alert when its banner is tapped', async () => {
    const { tapBanner, onOpenAlert, subscribeToTaps } = await open();

    await tapBanner('A-7');

    expect(subscribeToTaps).toHaveBeenCalledTimes(1);
    expect(onOpenAlert).toHaveBeenCalledWith('A-7');
  });

  it('stops listening for banner taps when the screen goes away', async () => {
    const { stopTaps, unmount } = await open();

    unmount();

    expect(stopTaps).toHaveBeenCalledTimes(1);
  });

  it('judges time by the server’s clock, not the phone’s', async () => {
    await open({ answers: [snapshotOf([], new Date(NOW.getTime() + 2 * HOUR).toISOString())] });

    expect(Number(screen.getByTestId('now').props.children)).toBe(NOW.getTime() + 2 * HOUR);
  });

  it('uses the phone’s clock until the server has said its time', async () => {
    await open({ holdFirstFetch: true });

    expect(Number(screen.getByTestId('now').props.children)).toBe(NOW.getTime());
  });
});

describe('useAlertInbox', () => {
  it('needs the provider around it', () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Probe />)).toThrow(
      'useAlertInbox must be used inside <AlertInboxProvider>.',
    );
    quiet.mockRestore();
  });
});
