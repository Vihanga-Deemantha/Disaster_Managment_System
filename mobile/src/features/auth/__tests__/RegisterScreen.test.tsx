import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { ApiError, NetworkError } from '@/shared/api/errors';
import type { RegisterRequest } from '@/shared/contracts/auth';
import { DISTRICTS } from '@/shared/contracts/enums';
import { en } from '@/shared/i18n/messages.en';
import { si } from '@/shared/i18n/messages.si';
import { renderWithApp } from '@/shared/testing/renderWithApp';
import type { LocationReading } from '../adapters/ExpoLocationProvider';
import { RegisterScreen } from '../screens/RegisterScreen';

interface Setup {
  register?: (request: RegisterRequest) => Promise<unknown>;
  reading?: LocationReading;
  /** `null`: the phone cannot make a marker. */
  deviceToken?: string | null;
}

async function open({ register, reading, deviceToken = 'marker-1' }: Setup = {}) {
  const sent: RegisterRequest[] = [];
  const onSignIn = jest.fn();
  const readLocation = jest.fn(
    async () => reading ?? { status: 'ok' as const, lat: '7.08730', lng: '79.99250' },
  );
  await renderWithApp(
    <RegisterScreen
      register={async (request) => {
        sent.push(request);
        return register ? register(request) : undefined;
      }}
      getDeviceToken={async () => deviceToken ?? undefined}
      readLocation={readLocation}
      onSignIn={onSignIn}
    />,
  );
  return { sent, onSignIn, readLocation };
}

const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const heading = (key: 'step1' | 'step2' | 'step3') =>
  screen.findByRole('header', { name: en[`auth.register.${key}.title`] });

function fillAbout(overrides: Partial<Record<'name' | 'nic' | 'phone' | 'password', string>> = {}) {
  type(en['auth.register.fullName'], overrides.name ?? 'Nimali Perera');
  type(en['auth.register.nic'], overrides.nic ?? '200012345678');
  type(en['auth.register.phone'], overrides.phone ?? '77 123 4567');
  type(en['auth.register.password'], overrides.password ?? 'sunrise over galle fort');
}

async function chooseDistrict(label = 'Gampaha') {
  fireEvent.press(
    screen.getByRole('button', {
      name: `${en['auth.register.district']}: ${en['auth.register.districtPlaceholder']}`,
    }),
  );
  fireEvent.press(await screen.findByRole('radio', { name: label }));
}

/** Walks to step 3 with a valid form. */
async function reachLastStep() {
  fillAbout();
  press(en['auth.register.next']);
  await heading('step2');
  await chooseDistrict();
  fireEvent.press(screen.getByRole('button', { name: en['auth.register.locationUse'] }));
  await screen.findByText(en['auth.register.locationSet']);
  press(en['auth.register.next']);
  await heading('step3');
}

describe('RegisterScreen: the three steps', () => {
  it('starts on step 1 of 3 with the person’s details to fill in', async () => {
    await open();

    expect(await heading('step1')).toBeTruthy();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    expect(screen.getByLabelText(en['auth.register.nic'])).toBeTruthy();
    expect(screen.getByText('+94')).toBeTruthy();
  });

  it('will not leave step 1 with problems, and says what each one is', async () => {
    await open();

    press(en['auth.register.next']);

    expect(await screen.findByText(`! ${en['error.NAME_REQUIRED']}`)).toBeTruthy();
    expect(screen.getByText(`! ${en['error.NIC_FORMAT']}`)).toBeTruthy();
    expect(screen.getByText(`! ${en['error.PHONE_INVALID']}`)).toBeTruthy();
    expect(screen.getByText(`! ${en['error.PASSWORD_TOO_SHORT']}`)).toBeTruthy();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  });

  it('clears a field’s problem as soon as it is fixed', async () => {
    await open();
    press(en['auth.register.next']);
    await screen.findByText(`! ${en['error.NAME_REQUIRED']}`);

    type(en['auth.register.fullName'], 'Nimali');

    expect(screen.queryByText(`! ${en['error.NAME_REQUIRED']}`)).toBeNull();
  });

  it('rates the password as it is typed', async () => {
    await open();

    type(en['auth.register.password'], 'short');
    expect(await screen.findByText(en['auth.register.passwordShort'])).toBeTruthy();

    type(en['auth.register.password'], 'password123');
    expect(await screen.findByText(en['error.PASSWORD_TOO_COMMON'])).toBeTruthy();

    type(en['auth.register.password'], 'sunrise over galle fort');
    expect(await screen.findByText(en['auth.register.passwordStrong'])).toBeTruthy();
  });

  it('moves on to step 2 when step 1 is fine, and back again', async () => {
    await open();
    fillAbout();

    press(en['auth.register.next']);

    expect(await heading('step2')).toBeTruthy();
    press(en['auth.register.back']);
    expect(await heading('step1')).toBeTruthy();
    expect(screen.getByLabelText(en['auth.register.fullName']).props.value).toBe('Nimali Perera');
  });

  it('wants a district and a location on step 2', async () => {
    await open();
    fillAbout();
    press(en['auth.register.next']);
    await heading('step2');

    press(en['auth.register.next']);

    expect(await screen.findByText(`! ${en['error.DISTRICT_INVALID']}`)).toBeTruthy();
    expect(screen.getByText(`! ${en['error.LOCATION_REQUIRED']}`)).toBeTruthy();
  });

  it('sets the location from the phone in one tap', async () => {
    const { readLocation } = await open();
    fillAbout();
    press(en['auth.register.next']);
    await heading('step2');

    fireEvent.press(screen.getByRole('button', { name: en['auth.register.locationUse'] }));

    expect(await screen.findByText('7.08730, 79.99250')).toBeTruthy();
    expect(readLocation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['denied', en['location.denied']],
    ['unavailable', en['location.unsupported']],
  ] as const)(
    'explains a location the phone would not give (%s) and offers typing it',
    async (status, message) => {
      await open({ reading: { status } });
      fillAbout();
      press(en['auth.register.next']);
      await heading('step2');

      fireEvent.press(screen.getByRole('button', { name: en['auth.register.locationUse'] }));

      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByLabelText(en['auth.register.locationLat'])).toBeTruthy();
    },
  );

  it('takes the coordinates typed by hand', async () => {
    await open({ reading: { status: 'denied' } });
    fillAbout();
    press(en['auth.register.next']);
    await heading('step2');
    press(en['auth.register.locationManual']);

    type(en['auth.register.locationLat'], '7.0873');
    type(en['auth.register.locationLng'], '79.9925');

    expect(await screen.findByText(en['auth.register.locationSet'])).toBeTruthy();
  });

  it('lists every one of the 25 districts to choose from', async () => {
    await open();
    fillAbout();
    press(en['auth.register.next']);
    await heading('step2');

    fireEvent.press(
      screen.getByRole('button', {
        name: `${en['auth.register.district']}: ${en['auth.register.districtPlaceholder']}`,
      }),
    );

    expect(DISTRICTS).toHaveLength(25);
    for (const district of DISTRICTS) {
      expect(await screen.findByRole('radio', { name: en[`district.${district}`] })).toBeTruthy();
    }
  });

  it('offers e-mail alerts only when the person opts in, and then wants an address', async () => {
    await open();
    await reachLastStep();
    expect(screen.queryByLabelText(en['auth.register.email'])).toBeNull();

    fireEvent(screen.getByLabelText(en['auth.register.emailOptIn']), 'valueChange', true);
    expect(await screen.findByLabelText(en['auth.register.email'])).toBeTruthy();
    press(en['auth.register.submit']);

    expect(await screen.findByText(`! ${en['error.EMAIL_REQUIRED_FOR_OPT_IN']}`)).toBeTruthy();
  });
});

describe('RegisterScreen: sending the registration', () => {
  it('registers with everything entered, the device marker and the chosen language', async () => {
    const { sent } = await open();
    await reachLastStep();
    const alertLanguages = within(screen.getByLabelText(en['auth.register.language']));
    fireEvent.press(alertLanguages.getByRole('radio', { name: en['lang.TA'] }));
    fireEvent(screen.getByLabelText(en['auth.register.whatsapp']), 'valueChange', true);

    press(en['auth.register.submit']);

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      nic: '200012345678',
      fullName: 'Nimali Perera',
      phone: '+94771234567',
      password: 'sunrise over galle fort',
      homeLocation: { lat: 7.0873, lng: 79.9925 },
      district: 'GAMPAHA',
      preferredLanguage: 'TA',
      whatsappOptIn: true,
      emailOptIn: false,
      confirmDistrictMismatch: false,
      deviceToken: 'marker-1',
    });
  });

  it('asks for alerts in the language the app is showing, until another is chosen', async () => {
    const { sent } = await open();
    await reachLastStep();
    const appLanguages = within(screen.getByLabelText(en['lang.label']));

    fireEvent.press(appLanguages.getByRole('radio', { name: en['lang.SI'] }));
    fireEvent.press(await screen.findByRole('button', { name: si['auth.register.submit'] }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.preferredLanguage).toBe('SI');
  });

  it('keeps the alert language the person picked, whatever language the app shows afterwards', async () => {
    const { sent } = await open();
    await reachLastStep();
    const alertLanguages = within(screen.getByLabelText(en['auth.register.language']));
    fireEvent.press(alertLanguages.getByRole('radio', { name: en['lang.TA'] }));

    fireEvent.press(
      within(screen.getByLabelText(en['lang.label'])).getByRole('radio', { name: en['lang.SI'] }),
    );
    fireEvent.press(await screen.findByRole('button', { name: si['auth.register.submit'] }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.preferredLanguage).toBe('TA');
  });

  it('registers without a marker when the phone cannot make one', async () => {
    const { sent } = await open({ deviceToken: null });
    await reachLastStep();

    press(en['auth.register.submit']);

    await waitFor(() => expect(sent).toHaveLength(1));
    expect('deviceToken' in (sent[0] as object)).toBe(false);
  });

  it('shows a busy button while it is sending, and ignores a second tap', async () => {
    let finish: () => void = () => undefined;
    const { sent } = await open({
      register: () => new Promise((resolve) => (finish = () => resolve(undefined))),
    });
    await reachLastStep();

    press(en['auth.register.submit']);
    expect(
      await screen.findByRole('button', { name: en['auth.register.submitting'] }),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: en['auth.register.submitting'] }));
    finish();

    await waitFor(() => expect(sent).toHaveLength(1));
  });

  it('takes the person back to the field the server rejected, here a phone already registered', async () => {
    await open({
      register: async () => {
        throw new ApiError(409, 'PHONE_ALREADY_REGISTERED', 'taken');
      },
    });
    await reachLastStep();

    press(en['auth.register.submit']);

    expect(await screen.findByText(`! ${en['error.PHONE_ALREADY_REGISTERED']}`)).toBeTruthy();
    expect(await heading('step1')).toBeTruthy();
  });

  it('shows a failure that is not about a field, such as being offline', async () => {
    await open({
      register: async () => {
        throw new NetworkError();
      },
    });
    await reachLastStep();

    press(en['auth.register.submit']);

    expect(await screen.findByText(en['error.NETWORK'])).toBeTruthy();
    expect(screen.getByText('Step 3 of 3')).toBeTruthy();
  });

  it('asks whether the district is right when the pin sits in another, and registers with the nearer one', async () => {
    let first = true;
    const { sent } = await open({
      register: async () => {
        if (first) {
          first = false;
          throw new ApiError(409, 'DISTRICT_LOCATION_MISMATCH', 'nearer Colombo', {
            suggestedDistrict: 'COLOMBO',
          });
        }
        return undefined;
      },
    });
    await reachLastStep();
    press(en['auth.register.submit']);

    expect(await screen.findByText(en['auth.mismatch.title'])).toBeTruthy();
    expect(screen.getByText('Your location looks closer to Colombo than to Gampaha.')).toBeTruthy();
    press('Use Colombo');

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toMatchObject({ district: 'COLOMBO', confirmDistrictMismatch: false });
  });

  it('keeps the chosen district, and says so to the server, when the person insists', async () => {
    let first = true;
    const { sent } = await open({
      register: async () => {
        if (first) {
          first = false;
          throw new ApiError(409, 'DISTRICT_LOCATION_MISMATCH', 'nearer Colombo', {
            suggestedDistrict: 'COLOMBO',
          });
        }
        return undefined;
      },
    });
    await reachLastStep();
    press(en['auth.register.submit']);
    await screen.findByText(en['auth.mismatch.title']);

    press('Keep Gampaha');

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toMatchObject({ district: 'GAMPAHA', confirmDistrictMismatch: true });
  });

  it('goes back to sign in', async () => {
    const { onSignIn } = await open();

    press(en['auth.register.signInLink']);

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('reopens a finished step from the step indicator', async () => {
    await open();
    await reachLastStep();

    fireEvent.press(screen.getByRole('button', { name: 'Go back to step 1: About you' }));

    expect(await heading('step1')).toBeTruthy();
  });
});
