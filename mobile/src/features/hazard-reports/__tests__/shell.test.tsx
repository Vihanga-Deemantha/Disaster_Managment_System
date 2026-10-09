import { screen } from '@testing-library/react-native';
import { MyReportsScreen } from '../screens/MyReportsScreen';
import { renderWithApp } from '@/shared/testing/renderWithApp';
import { syncTaskStatus } from '../background/taskStatus';
import { en } from '@/shared/i18n/messages.en';

describe('mobile shell', () => {
  beforeEach(() => syncTaskStatus.set('UNKNOWN'));
  it('renders the My reports tab placeholder', async () => {
    await renderWithApp(<MyReportsScreen />);
    expect(screen.getByText('My reports')).toBeTruthy();
  });
  it.each(['RESTRICTED', 'UNAVAILABLE'] as const)(
    'explains foreground fallback when background sync is %s',
    async (status) => {
      syncTaskStatus.set(status);
      await renderWithApp(<MyReportsScreen />);
      expect(screen.getByText(en['reports.backgroundRestricted'])).toBeTruthy();
    },
  );
});
