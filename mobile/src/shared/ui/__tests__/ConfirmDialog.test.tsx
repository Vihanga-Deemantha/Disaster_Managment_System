import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { ConfirmDialog } from '../ConfirmDialog';

function setup(visible = true) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(
    <ConfirmDialog
      visible={visible}
      title="Sign out?"
      body="You will stop receiving warnings."
      confirmLabel="Sign out"
      cancelLabel="Cancel"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

const dialog = () => within(screen.getByLabelText('Sign out?'));

describe('ConfirmDialog', () => {
  it('shows nothing while it is closed', () => {
    setup(false);

    expect(screen.queryByLabelText('Sign out?')).toBeNull();
    expect(screen.queryByText('You will stop receiving warnings.')).toBeNull();
  });

  it('asks the question, with one button for yes and one for no', () => {
    setup();

    expect(dialog().getByText('Sign out?')).toBeTruthy();
    expect(dialog().getByText('You will stop receiving warnings.')).toBeTruthy();
    expect(dialog().getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(dialog().getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('answers yes only when the confirming button is pressed', () => {
    const { onConfirm, onCancel } = setup();

    fireEvent.press(dialog().getByRole('button', { name: 'Sign out' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('answers no only when Cancel is pressed', () => {
    const { onConfirm, onCancel } = setup();

    fireEvent.press(dialog().getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('takes the back button on Android and the escape key on the web as a no', () => {
    const { onConfirm, onCancel } = setup();

    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('can be an ordinary question: the confirming button is still there when it is not a warning', () => {
    render(
      <ConfirmDialog
        visible
        title="Keep going?"
        body="Nothing is lost."
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Yes' })).toBeTruthy();
  });
});
