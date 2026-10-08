import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ApiError, NetworkError } from '@/shared/api/errors';
import { en } from '@/shared/i18n/messages.en';
import { si } from '@/shared/i18n/messages.si';
import { aMe, renderWithApp } from '@/shared/testing/renderWithApp';
import { SignInScreen } from '../screens/SignInScreen';

const fill = (identifier: string, password: string) => {
  fireEvent.changeText(screen.getByLabelText(en['auth.login.identifier']), identifier);
  fireEvent.changeText(screen.getByLabelText(en['auth.login.password']), password);
};
const submit = () => fireEvent.press(screen.getByRole('button', { name: en['auth.login.submit'] }));

describe('SignInScreen', () => {
  it('asks for a phone number or email and a password, and offers registration and the hotline', async () => {
    await renderWithApp(<SignInScreen onRegister={jest.fn()} />);

    expect(screen.getByRole('header', { name: en['auth.login.title'] })).toBeTruthy();
    expect(screen.getByLabelText(en['auth.login.identifier'])).toBeTruthy();
    expect(screen.getByLabelText(en['auth.login.password'])).toBeTruthy();
    expect(screen.getByRole('button', { name: en['auth.login.registerLink'] })).toBeTruthy();
    expect(screen.getByText(en['auth.login.officerNote'])).toBeTruthy();
    expect(screen.getByRole('link', { name: `${en['auth.side.hotline']} 117` })).toBeTruthy();
  });

  it('says what is missing and sends nothing when the boxes are empty', async () => {
    const { calls } = await renderWithApp(<SignInScreen onRegister={jest.fn()} />);

    submit();

    expect(await screen.findByText(`! ${en['error.IDENTIFIER_REQUIRED']}`)).toBeTruthy();
    expect(screen.getByText(`! ${en['error.PASSWORD_REQUIRED']}`)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('signs in with what was typed', async () => {
    const { calls, controller } = await renderWithApp(<SignInScreen onRegister={jest.fn()} />);

    fill('0771234567', 'a long password');
    submit();

    await waitFor(() => expect(controller.getState().status).toBe('signedIn'));
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/auth/login',
        body: { identifier: '0771234567', password: 'a long password' },
      },
    ]);
  });

  it('shows the server’s refusal in the person’s language and clears the password', async () => {
    await renderWithApp(<SignInScreen onRegister={jest.fn()} />, {
      handler: () => {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
      },
    });
    fill('0771234567', 'wrong password');

    submit();

    expect(await screen.findByText(en['error.INVALID_CREDENTIALS'])).toBeTruthy();
    expect(screen.getByLabelText(en['auth.login.password']).props.value).toBe('');
    expect(screen.getByLabelText(en['auth.login.identifier']).props.value).toBe('0771234567');
  });

  it('says how long to wait when the server throttled the sign-in', async () => {
    await renderWithApp(<SignInScreen onRegister={jest.fn()} />, {
      handler: () => {
        throw new ApiError(429, 'LOGIN_THROTTLED', 'slow down', { retryAfterSeconds: 45 });
      },
    });
    fill('0771234567', 'pw');

    submit();

    expect(
      await screen.findByText('Too many attempts. Please wait 45 seconds and try again.'),
    ).toBeTruthy();
  });

  it('says it is offline when the phone cannot reach the server', async () => {
    await renderWithApp(<SignInScreen onRegister={jest.fn()} />, {
      handler: () => {
        throw new NetworkError();
      },
    });
    fill('0771234567', 'pw');

    submit();

    expect(await screen.findByText(en['error.NETWORK'])).toBeTruthy();
  });

  it('turns an officer away with the reason, and stays on the sign-in screen', async () => {
    const { controller } = await renderWithApp(<SignInScreen onRegister={jest.fn()} />, {
      handler: (_method, path) =>
        path === '/api/auth/login' ? { user: aMe({ role: 'DMC_OFFICER' }) } : { status: 204 },
    });
    fill('officer@dmc.gov.lk', 'pw');

    submit();

    expect(await screen.findByText(en['error.ROLE_NOT_ALLOWED'])).toBeTruthy();
    expect(controller.getState()).toEqual({ status: 'signedOut' });
  });

  it('tells a person whose session ended to sign in again', async () => {
    const { controller } = await renderWithApp(<SignInScreen onRegister={jest.fn()} />, {
      signedInAs: aMe(),
    });
    await act(async () => {
      await controller.restore();
      await controller.expire();
    });

    expect(await screen.findByText(en['auth.login.sessionExpired'])).toBeTruthy();
  });

  it('opens registration', async () => {
    const onRegister = jest.fn();
    await renderWithApp(<SignInScreen onRegister={onRegister} />);

    fireEvent.press(screen.getByRole('button', { name: en['auth.login.registerLink'] }));

    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  it('switches the whole screen to Sinhala', async () => {
    await renderWithApp(<SignInScreen onRegister={jest.fn()} />);

    fireEvent.press(screen.getByRole('radio', { name: en['lang.SI'] }));

    expect(await screen.findByRole('header', { name: si['auth.login.title'] })).toBeTruthy();
    expect(screen.getByLabelText(si['auth.login.password'])).toBeTruthy();
  });

  it('shows and hides the password', async () => {
    await renderWithApp(<SignInScreen onRegister={jest.fn()} />);
    const box = () => screen.getByLabelText(en['auth.login.password']);
    expect(box().props.secureTextEntry).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: en['common.show'] }));
    expect(box().props.secureTextEntry).toBe(false);

    fireEvent.press(screen.getByRole('button', { name: en['common.hide'] }));
    expect(box().props.secureTextEntry).toBe(true);
  });
});
