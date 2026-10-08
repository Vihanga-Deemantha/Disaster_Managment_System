import { act } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { aMe, renderWithApp } from '@/shared/testing/renderWithApp';
import { AlertInboxPoller } from '../domain/AlertInboxPoller';
import type { StoredInbox } from '../domain/ports';
import type { Alert, InboxSnapshot } from '../domain/types';
import { AlertInboxProvider } from '../hooks/AlertInboxProvider';
import {
  FakeGateway,
  FixedClock,
  ManualScheduler,
  MemoryInboxStorage,
  RecordingNotifier,
  settle,
  snapshotOf,
} from './fakes';

export interface InboxOptions {
  /** What the first fetch returns (or a list of answers, the last repeating). */
  alerts?: Alert[];
  answers?: Array<InboxSnapshot | Error>;
  stored?: StoredInbox | null;
  /** Hold the first fetch open until `inbox.gateway.letThrough()`. */
  holdFirstFetch?: boolean;
}

/**
 * Renders a screen inside a real alert inbox (the real poller, provider and session) whose gateway,
 * notifier, storage, timer and clock are the fakes, so a test watches what the citizen sees.
 */
export async function renderInbox(ui: ReactElement, options: InboxOptions = {}) {
  const gateway = new FakeGateway(options.answers ?? [snapshotOf(options.alerts ?? [])]);
  if (options.holdFirstFetch) gateway.hold();
  const notifier = new RecordingNotifier();
  const storage = new MemoryInboxStorage(options.stored ?? null);
  const scheduler = new ManualScheduler();
  const clock = new FixedClock();
  const poller = new AlertInboxPoller({ gateway, notifier, storage, scheduler, clock });
  const onOpenAlert = jest.fn();
  let tapped: ((alertId: string) => void) | undefined;
  const stopTaps = jest.fn();
  const subscribeToTaps = jest.fn((open: (alertId: string) => void) => {
    tapped = open;
    return stopTaps;
  });

  const app = await renderWithApp(
    <AlertInboxProvider
      poller={poller}
      clock={clock}
      onOpenAlert={onOpenAlert}
      subscribeToTaps={subscribeToTaps}
    >
      {ui}
    </AlertInboxProvider>,
    { signedInAs: aMe() },
  );
  if (!options.holdFirstFetch) await act(settle);

  return {
    ...app,
    poller,
    gateway,
    notifier,
    storage,
    scheduler,
    clock,
    onOpenAlert,
    subscribeToTaps,
    stopTaps,
    /** Pretends the citizen tapped a banner. */
    tapBanner: (alertId: string) => act(() => tapped?.(alertId)),
    /** Lets a poll that was started finish. */
    settle: () => act(settle),
  };
}
