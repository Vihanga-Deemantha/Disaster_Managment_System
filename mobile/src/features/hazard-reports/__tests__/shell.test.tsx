import { screen } from '@testing-library/react-native';
import { MyReportsView } from '../screens/MyReportsScreen';
import { syncHarness } from '../testing/syncHarness';
import { MyReportsCache } from '../adapters/MyReportsCache';
import { InMemoryKeyValueStore } from '@/shared/testing/InMemoryKeyValueStore';
import { renderWithApp } from '@/shared/testing/renderWithApp';
import { syncTaskStatus } from '../background/taskStatus';
import { en } from '@/shared/i18n/messages.en';
jest.mock('../composition', () => ({ getHazardReportsRuntime: jest.fn() }));
jest.mock('../background/syncTask', () => ({
  triggerSyncTaskForTesting: jest.fn(async () => false),
}));
const deps = () => ({
  ...syncHarness(),
  reports: { list: async () => [] },
  cache: new MyReportsCache(new InMemoryKeyValueStore()),
});

describe('mobile shell', () => {
  beforeEach(() => syncTaskStatus.set('UNKNOWN'));
  it('renders the My reports tab', async () => {
    await renderWithApp(<MyReportsView ownerId="citizen-1" deps={deps()} />);
    expect(screen.getByText('My reports')).toBeTruthy();
  });
  it.each(['RESTRICTED', 'UNAVAILABLE'] as const)(
    'explains foreground fallback when background sync is %s',
    async (status) => {
      syncTaskStatus.set(status);
      await renderWithApp(<MyReportsView ownerId="citizen-1" deps={deps()} />);
      expect(screen.getByText(en['reports.backgroundRestricted'])).toBeTruthy();
    },
  );
});
