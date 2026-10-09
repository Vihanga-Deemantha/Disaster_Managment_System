import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithApp } from '@/shared/testing/renderWithApp';
import { en } from '@/shared/i18n/messages.en';
import { DeliveryPermission } from '../components/DeliveryPermission';

describe('report delivery permission feedback', () => {
  it.each(['GRANTED', 'DENIED', 'UNAVAILABLE'] as const)(
    'explains the %s result after an explicit tap',
    async (result) => {
      const enable = jest.fn(async () => result);
      await renderWithApp(<DeliveryPermission enable={enable} busy={false} />);
      expect(enable).not.toHaveBeenCalled();
      fireEvent.press(screen.getByRole('button', { name: en['reports.enableNotifications'] }));
      await screen.findByText(en[`reports.notifications.${result}`]);
      if (result === 'GRANTED') expect(screen.queryByRole('button')).toBeNull();
    },
  );
  it('explains unexpected permission errors without losing the saved confirmation', async () => {
    await renderWithApp(
      <DeliveryPermission
        enable={async () => {
          throw new Error('native');
        }}
        busy={false}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: en['reports.enableNotifications'] }));
    await screen.findByText(en['reports.notifications.UNAVAILABLE']);
  });
});
